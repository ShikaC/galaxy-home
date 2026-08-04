import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  createCategory,
  createItem,
  listItems,
  replaceItemCategories,
  setTodayItem,
  TodayLimitError,
  updateItem,
} from "../../src/server/repositories/items.js"

const temporaryDirectories: string[] = []
let database: DatabaseSync

beforeEach(() => {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-home-items-"))
  temporaryDirectories.push(directory)
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
})

afterEach(() => {
  database.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("item repository", () => {
  it("moves a categorized capture out of the inbox while keeping one shared status", () => {
    // Given
    const item = createItem(database, { title: "整理旅行想法", categoryIds: [], projectIds: [] })
    const category = createCategory(database, { name: "生活", color: "#26734d", icon: "leaf" })

    // When
    replaceItemCategories(database, item.id, [category.id])
    updateItem(database, item.id, { status: "completed" })

    // Then
    expect(listItems(database, { view: "inbox", localDate: "2026-08-04" })).toHaveLength(0)
    const completed = listItems(database, { view: "completed", localDate: "2026-08-04" })
    expect(completed).toHaveLength(1)
    expect(completed[0]?.categoryIds).toEqual([category.id])
  })

  it("allows only three primary today items and keeps a single focus", () => {
    // Given
    const first = createItem(database, { title: "第一件事", categoryIds: [], projectIds: [] })
    const second = createItem(database, { title: "第二件事", categoryIds: [], projectIds: [] })
    const third = createItem(database, { title: "第三件事", categoryIds: [], projectIds: [] })
    const fourth = createItem(database, { title: "第四件事", categoryIds: [], projectIds: [] })
    const localDate = "2026-08-04"

    // When
    setTodayItem(database, {
      itemId: first.id,
      localDate,
      isFocus: true,
      isSecondary: false,
    })
    setTodayItem(database, {
      itemId: second.id,
      localDate,
      isFocus: true,
      isSecondary: false,
    })
    setTodayItem(database, {
      itemId: third.id,
      localDate,
      isFocus: false,
      isSecondary: false,
    })

    // Then
    expect(() =>
      setTodayItem(database, {
        itemId: fourth.id,
        localDate,
        isFocus: false,
        isSecondary: false,
      }),
    ).toThrow(TodayLimitError)
    updateItem(database, first.id, { status: "completed" })
    expect(() =>
      setTodayItem(database, {
        itemId: fourth.id,
        localDate,
        isFocus: false,
        isSecondary: false,
      }),
    ).not.toThrow()
    const today = listItems(database, { view: "today", localDate })
    expect(today.filter((item) => item.isFocus).map((item) => item.id)).toEqual([second.id])
  })
})

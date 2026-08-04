import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  createHabit,
  listHabits,
  recordHabit,
  setHabitLog,
  undoHabit,
} from "../../src/server/repositories/habits.js"

const temporaryDirectories: string[] = []
let database: DatabaseSync

beforeEach(() => {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-home-habits-"))
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

describe("habit repository", () => {
  it("keeps over-target counts and only undoes the latest increment", () => {
    // Given
    const habit = createHabit(database, {
      name: "喝水",
      type: "count",
      targetCount: 2,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [],
    })

    // When
    recordHabit(database, habit.id, "2026-08-04")
    recordHabit(database, habit.id, "2026-08-04")
    recordHabit(database, habit.id, "2026-08-04")
    undoHabit(database, habit.id, "2026-08-04")

    // Then
    const updated = listHabits(database, "2026-08-04")[0]
    expect(updated?.currentCount).toBe(2)
    expect(updated?.completedToday).toBe(true)
    expect(updated?.totalCheckIns).toBe(1)
  })

  it("skips rest and leave dates when calculating a daily streak", () => {
    // Given
    const habit = createHabit(database, {
      name: "阅读",
      type: "check",
      targetCount: 1,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [0],
    })
    setHabitLog(database, {
      habitId: habit.id,
      localDate: "2026-08-01",
      count: 1,
      status: "active",
      corrected: true,
    })
    setHabitLog(database, {
      habitId: habit.id,
      localDate: "2026-08-03",
      count: 0,
      status: "leave",
      corrected: true,
    })

    // When
    recordHabit(database, habit.id, "2026-08-04")

    // Then
    expect(listHabits(database, "2026-08-04")[0]?.streak).toBe(2)
  })

  it("counts weekly target progress inside the current Monday-to-Sunday week", () => {
    const habit = createHabit(database, {
      name: "本周阅读",
      type: "check",
      targetCount: 1,
      frequencyType: "weekly",
      weeklyTarget: 3,
      restDays: [],
    })
    recordHabit(database, habit.id, "2026-08-03")
    recordHabit(database, habit.id, "2026-08-04")
    recordHabit(database, habit.id, "2026-08-02")

    expect(listHabits(database, "2026-08-04")[0]?.weeklyCount).toBe(2)
  })
})

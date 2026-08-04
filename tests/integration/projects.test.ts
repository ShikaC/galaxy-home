import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  advanceProject,
  createProject,
  getProject,
} from "../../src/server/repositories/projects.js"

let database: DatabaseSync
let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-home-projects-"))
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { force: true, recursive: true })
})

describe("project repository", () => {
  it("only exposes current and next work and advances manually with feedback", () => {
    const project = createProject(database, {
      name: "整理书房",
      desiredOutcome: "每天都能直接坐下阅读",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "清出工作面",
      currentTask: "收走桌面杂物",
      nextTask: "擦净桌面",
    })
    expect(project.currentTask?.title).toBe("收走桌面杂物")
    expect(project.nextTask?.title).toBe("擦净桌面")

    advanceProject(database, project.id, {
      outcome: "已经分箱",
      obstacle: "有些物品暂时没位置",
      nextTask: "为未归类物品贴标签",
    })
    const advanced = getProject(database, project.id)
    expect(advanced.currentTask?.title).toBe("擦净桌面")
    expect(advanced.nextTask?.title).toBe("为未归类物品贴标签")
    expect(advanced.completedCount).toBe(1)
  })
})

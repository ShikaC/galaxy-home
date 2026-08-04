import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("project HTTP workflow", () => {
  it("edits, advances, closes, and trashes a project through the manual API", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-project-workflow-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        name: "整理花园",
        desiredOutcome: "可以在花园里休息",
        reason: "改善居住体验",
        notes: null,
        deadlineDate: null,
        stageTitle: "清理",
        currentTask: "收走杂物",
        nextTask: "清扫地面",
      },
    })
    const projectId = z.object({ id: z.string().uuid() }).parse(created.json()).id
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}`,
      payload: { pinned: true, progress: 20, notes: "周末处理" },
    })
    expect(edited.json()).toEqual(
      expect.objectContaining({ pinned: true, progress: 20, progressSource: "manual" }),
    )
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/projects/${projectId}/advance`,
          payload: { outcome: "杂物已清空", obstacle: null, nextTask: null },
        })
      ).statusCode,
    ).toBe(204)
    await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/advance`,
      payload: { outcome: "地面已清扫", obstacle: null, nextTask: null },
    })
    const nextStage = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/stages/advance`,
      payload: {
        outcome: "花园已清空",
        stageTitle: "布置",
        currentTask: "挑选户外椅",
        nextTask: "摆放绿植",
      },
    })
    expect(nextStage.json()).toEqual(
      expect.objectContaining({
        stageTitle: "布置",
        completedStages: [expect.objectContaining({ title: "清理" })],
        recentProgress: expect.arrayContaining([
          expect.objectContaining({ taskTitle: "收走杂物" }),
        ]),
      }),
    )
    expect(
      (await app.inject({ method: "DELETE", url: `/api/projects/${projectId}` })).statusCode,
    ).toBe(204)
    const trash = await app.inject({ method: "GET", url: "/api/trash" })
    expect(trash.json()).toContainEqual(
      expect.objectContaining({ entity_id: projectId, entity_type: "project" }),
    )
    await app.close()
    database.close()
  })
})

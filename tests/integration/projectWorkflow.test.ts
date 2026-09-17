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
  it("creates a project with only its required outcome fields", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-project-minimal-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        name: "整理阳台",
        desiredOutcome: "阳台可以安心休息",
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual(
      expect.objectContaining({
        currentTask: null,
        nextTask: null,
        name: "整理阳台",
      }),
    )
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/projects/${response.json<{ id: string }>().id}/current-task/today`,
          payload: { localDate: "2026-09-07" },
        })
      ).statusCode,
    ).toBe(409)
    await app.close()
    database.close()
  })

  it("adds a manual current task to today and links it to the project", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-project-today-"))
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
        name: "把居所当成日常桌面",
        desiredOutcome: "打开就能记下并推进一件真事",
        stageTitle: "日常手感",
        currentTask: "随手记可以直接放进今天",
        nextTask: "空空间晨间提醒改口",
      },
    })
    const projectId = z.object({ id: z.uuid() }).parse(created.json()).id
    const added = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/current-task/today`,
      payload: { localDate: "2026-09-07" },
    })
    expect(added.statusCode).toBe(201)
    expect(added.json()).toEqual(
      expect.objectContaining({
        title: "随手记可以直接放进今天",
        inToday: true,
        isSecondary: false,
        projectIds: [projectId],
      }),
    )
    await app.close()
    database.close()
  })

  it("places the current project task onto today without a primary item cap", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-project-today-overflow-"))
    directories.push(directory)
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const app = await buildApp({
      database,
      dataDirectory: directory,
      backupDirectory: join(directory, "backups"),
      secretPath: join(directory, "secrets.json"),
    })
    const localDate = "2026-09-08"
    for (const title of ["早起开窗", "回一封信", "买菜"]) {
      const created = await app.inject({
        method: "POST",
        url: "/api/items",
        payload: { title, categoryIds: [], projectIds: [] },
      })
      const itemId = z.object({ id: z.uuid() }).parse(created.json()).id
      expect(
        (
          await app.inject({
            method: "PUT",
            url: `/api/items/${itemId}/today`,
            payload: { localDate, isFocus: false, isSecondary: false },
          })
        ).statusCode,
      ).toBe(204)
    }
    const project = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        name: "把居所当成日常桌面",
        desiredOutcome: "打开就能记下并推进一件真事",
        currentTask: "今日满员时加入今日仍能放下",
      },
    })
    const projectId = z.object({ id: z.uuid() }).parse(project.json()).id
    const added = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/current-task/today`,
      payload: { localDate },
    })
    expect(added.statusCode).toBe(201)
    expect(added.json()).toEqual(
      expect.objectContaining({
        title: "今日满员时加入今日仍能放下",
        inToday: true,
        isSecondary: false,
        projectIds: [projectId],
      }),
    )
    await app.close()
    database.close()
  })

  it("completes linked today items when the current project task is advanced", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-project-complete-today-"))
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
        name: "把居所当成日常桌面",
        desiredOutcome: "打开就能记下并推进一件真事",
        currentTask: "随手记可以直接放进今天",
        nextTask: "空空间晨间提醒改口",
      },
    })
    const projectId = z.object({ id: z.uuid() }).parse(created.json()).id
    const added = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/current-task/today`,
      payload: { localDate: "2026-09-07" },
    })
    const itemId = z.object({ id: z.uuid() }).parse(added.json()).id
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/projects/${projectId}/advance`,
          payload: { outcome: "已经能一记就进今天", obstacle: null, nextTask: null },
        })
      ).statusCode,
    ).toBe(204)
    const today = await app.inject({
      method: "GET",
      url: "/api/items?view=today&localDate=2026-09-07",
    })
    expect(today.json()).toContainEqual(
      expect.objectContaining({
        id: itemId,
        title: "随手记可以直接放进今天",
        status: "completed",
        inToday: true,
      }),
    )
    await app.close()
    database.close()
  })

  it("promotes a provided next task to current when the queue was empty", async () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-project-promote-"))
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
        name: "整理书房",
        desiredOutcome: "书桌能坐下工作",
        currentTask: "清掉桌面",
      },
    })
    const projectId = z.object({ id: z.uuid() }).parse(created.json()).id
    await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/advance`,
      payload: { outcome: "桌面已空", obstacle: null, nextTask: "摆一盏灯" },
    })
    const after = await app.inject({ method: "GET", url: `/api/projects/${projectId}` })
    expect(after.json()).toEqual(
      expect.objectContaining({
        currentTask: expect.objectContaining({ title: "摆一盏灯" }),
        nextTask: null,
      }),
    )
    await app.close()
    database.close()
  })

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
    const projectId = z.object({ id: z.uuid() }).parse(created.json()).id
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

import { mkdtempSync, rmSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { buildApp } from "../../src/server/app.js"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { listHabits } from "../../src/server/repositories/habits.js"
import { writeSecretConfig } from "../../src/server/services/secrets.js"

const directories: string[] = []
const servers: Server[] = []
const apps: FastifyInstance[] = []
const databases: DatabaseSync[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  for (const database of databases.splice(0)) database.close()
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  )
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

async function setup(content: string, permission: "open" | "conservative") {
  const aiServer = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ choices: [{ message: { content } }] }))
  })
  servers.push(aiServer)
  await new Promise<void>((resolve) => {
    aiServer.listen(0, "127.0.0.1", resolve)
  })
  const address = aiServer.address()
  if (address === null || typeof address === "string") throw new Error("AI test server failed")
  const directory = mkdtempSync(join(tmpdir(), "galaxy-ai-chat-actions-"))
  directories.push(directory)
  const database = openDatabase(join(directory, "app.sqlite"))
  databases.push(database)
  migrateDatabase(database)
  database.prepare("UPDATE workspace_settings SET ai_permission = ?").run(permission)
  const secretPath = join(directory, "secrets.json")
  await writeSecretConfig(secretPath, {
    chatBaseUrl: `http://127.0.0.1:${address.port}/v1`,
    chatModel: "test-model",
    apiKey: "test-key",
    transcriptionBaseUrl: "",
    transcriptionModel: "",
  })
  const app = await buildApp({
    database,
    dataDirectory: directory,
    backupDirectory: join(directory, "backups"),
    secretPath,
  })
  apps.push(app)
  return { app, database }
}

describe("AI chat habit actions", () => {
  it("creates a habit from an open-mode action block and records undo", async () => {
    const { app, database } = await setup(
      `好的，我来帮你加一个喝水提醒。

\`\`\`json
{"action":"create_habit","name":"喝一杯水","type":"check","targetCount":1,"frequencyType":"daily","weeklyTarget":null,"restDays":[]}
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我创建一个每天喝水的习惯",
        currentPath: "/habits",
        currentLabel: "习惯",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("已实际创建习惯「喝一杯水」")
    expect(listHabits(database, "2026-08-05").some((habit) => habit.name === "喝一杯水")).toBe(true)
    const actions = await app.inject({ method: "GET", url: "/api/ai/actions" })
    const actionId = (actions.json() as readonly { id: string; actionType: string }[]).find(
      (action) => action.actionType === "create_habit",
    )?.id
    expect(actionId).toBeDefined()
    expect(
      (await app.inject({ method: "POST", url: `/api/ai/actions/${actionId}/undo` })).statusCode,
    ).toBe(204)
    expect(listHabits(database, "2026-08-05").some((habit) => habit.name === "喝一杯水")).toBe(
      false,
    )
  })

  it("accepts create_habit aliases for frequency and target", async () => {
    const { app, database } = await setup(
      `好的，我来创建习惯。

\`\`\`json
{"action":"create_habit","name":"喝水","type":"check","frequency":"daily","target":1}
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我创建一个每天喝水的习惯",
        currentPath: "/habits",
        currentLabel: "习惯",
      },
    })
    expect(response.statusCode).toBe(200)
    const content = response.json().message.content as string
    expect(content).toContain("已实际创建习惯「喝水」")
    expect(content).not.toContain("```")
    expect(listHabits(database, "2026-08-05").some((habit) => habit.name === "喝水")).toBe(true)
  })

  it("fills create_habit defaults when the model omits common fields", async () => {
    const { app, database } = await setup(
      `好的。

\`\`\`json
{"action":"create_habit","name":"复测喝水","habitType":"勾选","frequency":"每天","targetCount":"1"}
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我创建一个每天喝水的习惯，名字就叫复测喝水",
        currentPath: "/habits",
        currentLabel: "习惯",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("已实际创建习惯「复测喝水」")
    expect(listHabits(database, "2026-08-05").some((habit) => habit.name === "复测喝水")).toBe(true)
  })

  it("creates a habit from a minimal create_habit action block", async () => {
    const { app, database } = await setup(
      `已准备好。

\`\`\`json
{"action":"create_habit","name":"早起喝水"}
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我加一个早起喝水习惯",
        currentPath: "/habits",
        currentLabel: "习惯",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("已实际创建习惯「早起喝水」")
    expect(listHabits(database, "2026-08-05").some((habit) => habit.name === "早起喝水")).toBe(true)
  })

  it("strips invalid action blocks and reports failure without leaking raw JSON", async () => {
    const { app, database } = await setup(
      `好的，我来创建习惯。

\`\`\`json
{"action":"create_habit","name":"坏习惯","type":"banana","frequencyType":"hourly"}
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我创建一个习惯",
        currentPath: "/habits",
        currentLabel: "习惯",
      },
    })
    expect(response.statusCode).toBe(200)
    const content = response.json().message.content as string
    expect(content).toContain("未能执行")
    expect(content).not.toContain("```")
    expect(content).not.toContain('"banana"')
    expect(listHabits(database, "2026-08-05").some((habit) => habit.name === "坏习惯")).toBe(false)
  })

  it("turns incomplete create_project blocks into a follow-up instead of a hard error", async () => {
    const { database } = await setup("unused", "open")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const settings = getSettings(database)

    const withQuestions = applyAiChatActions(
      database,
      settings,
      `想开始跑步的话，先确认两件事：目标距离？每周几次？

\`\`\`json
{"action":"create_project","name":"跑步计划"}
\`\`\``,
    )
    expect(withQuestions.pendingAction).toBeNull()
    expect(withQuestions.text).toContain("目标距离")
    expect(withQuestions.text).not.toContain("未能执行")
    expect(withQuestions.text).not.toContain("```")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM projects WHERE name = ? AND deleted_at IS NULL")
          .get("跑步计划") as { value: number }
      ).value,
    ).toBe(0)

    const withoutQuestions = applyAiChatActions(
      database,
      settings,
      `好的，我先帮你建跑步计划。

\`\`\`json
{"action":"create_project","name":"跑步计划"}
\`\`\``,
    )
    expect(withoutQuestions.pendingAction).toBeNull()
    expect(withoutQuestions.text).toMatch(/目标|结果|进展|告诉我/)
    expect(withoutQuestions.text).not.toContain("未能执行")
    expect(withoutQuestions.text).not.toContain("操作块格式不正确")
  })

  it("does not create a habit when the model only claims success", async () => {
    const { app, database } = await setup(
      "已创建习惯「晨间拉伸」，你今天就可以开始打卡了。",
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我创建一个晨间拉伸习惯",
        currentPath: "/",
        currentLabel: "首页",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("本次没有改动你的工作空间数据")
    expect(listHabits(database, "2026-08-05")).toEqual([])
  })

  it("queues action blocks in conservative mode until confirmed", async () => {
    const { app, database } = await setup(
      `建议你养成拉伸习惯。

\`\`\`json
{"action":"create_habit","name":"晨间拉伸","type":"check","targetCount":1,"frequencyType":"daily","weeklyTarget":null,"restDays":[]}
\`\`\``,
      "conservative",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我创建拉伸习惯",
        currentPath: "/habits",
        currentLabel: "习惯",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("待确认")
    expect(response.json().message.pendingAction?.status).toBe("pending")
    expect(listHabits(database, "2026-08-05")).toEqual([])
    const messageId = response.json().message.id as string
    const confirmed = await app.inject({
      method: "POST",
      url: `/api/ai/messages/${messageId}/confirm-action`,
    })
    expect(confirmed.statusCode).toBe(200)
    expect(listHabits(database, "2026-08-05").some((habit) => habit.name === "晨间拉伸")).toBe(true)
  })

  it("rejects trash and archive in conservative mode without pending confirmation", async () => {
    const { database } = await setup("unused", "conservative")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const { createItem } = await import("../../src/server/repositories/items.js")
    const settings = getSettings(database)
    createItem(database, { title: "保守删除目标", categoryIds: [], projectIds: [] })

    const trashed = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
{"action":"trash_item","itemId":"保守删除目标"}
\`\`\``,
    )
    expect(trashed.pendingAction).toBeNull()
    expect(trashed.text).toMatch(/开放模式|不支持.*删除|不支持.*归档|回收站/)
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("保守删除目标") as { value: number }
      ).value,
    ).toBe(1)

    const archived = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
{"action":"archive_item","itemId":"保守删除目标"}
\`\`\``,
    )
    expect(archived.pendingAction).toBeNull()
    expect(archived.text).toMatch(/开放模式|不支持.*归档|不支持.*删除/)
  })

  it("queues non-destructive actions and skips trash in conservative mixed batches", async () => {
    const { database } = await setup("unused", "conservative")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const { createItem } = await import("../../src/server/repositories/items.js")
    const settings = getSettings(database)
    createItem(database, { title: "混合批次删除目标", categoryIds: [], projectIds: [] })

    const mixed = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
[
  {"action":"create_project","name":"保守可建项目","desiredOutcome":"验证确认流"},
  {"action":"trash_item","itemId":"混合批次删除目标"}
]
\`\`\``,
    )
    expect(mixed.pendingAction?.status).toBe("pending")
    expect(mixed.pendingAction?.actions).toHaveLength(1)
    expect(mixed.pendingAction?.actions[0]?.action).toBe("create_project")
    expect(mixed.text).toMatch(/开放模式|跳过|未.*删除|不支持/)
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM projects WHERE name = ? AND deleted_at IS NULL")
          .get("保守可建项目") as { value: number }
      ).value,
    ).toBe(0)
  })

  it("queues trash for confirmation in open mode while executing other actions", async () => {
    const { database } = await setup("unused", "open")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const { createItem } = await import("../../src/server/repositories/items.js")
    const settings = getSettings(database)
    createItem(database, { title: "开放删除确认目标", categoryIds: [], projectIds: [] })

    const trashed = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
{"action":"trash_item","itemId":"开放删除确认目标"}
\`\`\``,
    )
    expect(trashed.pendingAction?.status).toBe("pending")
    expect(trashed.pendingAction?.actions).toEqual([
      expect.objectContaining({ action: "trash_item", itemId: "开放删除确认目标" }),
    ])
    expect(trashed.text).toContain("待确认")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("开放删除确认目标") as { value: number }
      ).value,
    ).toBe(1)

    const mixed = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
[
  {"action":"create_item","title":"开放立即创建"},
  {"action":"trash_item","itemId":"开放删除确认目标"}
]
\`\`\``,
    )
    expect(mixed.text).toContain("已实际创建待办「开放立即创建」")
    expect(mixed.pendingAction?.status).toBe("pending")
    expect(mixed.pendingAction?.actions).toHaveLength(1)
    expect(mixed.pendingAction?.actions[0]?.action).toBe("trash_item")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("开放立即创建") as { value: number }
      ).value,
    ).toBe(1)
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("开放删除确认目标") as { value: number }
      ).value,
    ).toBe(1)
  })

  it("creates an item from an open-mode action block", async () => {
    const { app, database } = await setup(
      `好的。

\`\`\`json
{"action":"create_item","title":"写完第一节","notes":"","categoryIds":[]}
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我建一个待办：写完第一节",
        currentPath: "/todos",
        currentLabel: "待办",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("已实际创建待办「写完第一节」")
    const count = database
      .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
      .get("写完第一节") as { value: number }
    expect(count.value).toBe(1)
  })

  it("creates a project from an open-mode action block", async () => {
    const { app, database } = await setup(
      `好的，先建一个项目骨架。

\`\`\`json
{"action":"create_project","name":"学 React","desiredOutcome":"能独立做简单组件","currentTask":"搭好开发环境","nextTask":"学 JSX"}
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "帮我创建一个学 React 的项目",
        currentPath: "/projects",
        currentLabel: "项目",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("已实际创建项目「学 React」")
    const count = database
      .prepare("SELECT COUNT(*) AS value FROM projects WHERE name = ? AND deleted_at IS NULL")
      .get("学 React") as { value: number }
    expect(count.value).toBe(1)
  })

  it("executes a multi-action batch: project, items, and today placement", async () => {
    const { app, database } = await setup(
      `好的，一起建好项目和今日起步任务。

\`\`\`json
[
  {"action":"create_project","as":"react","name":"学习React","desiredOutcome":"能独立做简单组件"},
  {"action":"create_item","title":"安装开发环境","projectIds":["$react"],"todayMode":"today"},
  {"action":"create_item","title":"学习 JSX","projectIds":["$react"],"todayMode":"today"},
  {"action":"create_item","title":"完成计数器组件","projectIds":["$react"],"todayMode":"today"}
]
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "创建一个项目叫学习React，并创建最初三个任务放进今日待办",
        currentPath: "/projects",
        currentLabel: "项目",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("已实际创建项目「学习React」")
    expect(response.json().message.content).toContain("已实际创建待办「安装开发环境」")
    const project = z
      .object({ id: z.string().uuid() })
      .parse(
        database
          .prepare("SELECT id FROM projects WHERE name = ? AND deleted_at IS NULL")
          .get("学习React"),
      )
    const items = z
      .array(z.object({ title: z.string(), secondary: z.number().int() }))
      .parse(
        database
          .prepare(
            `SELECT items.title, today_items.is_secondary AS secondary
             FROM items
             JOIN item_projects ON item_projects.item_id = items.id
             JOIN today_items ON today_items.item_id = items.id
             WHERE item_projects.project_id = ? AND items.deleted_at IS NULL`,
          )
          .all(project.id),
      )
    expect(items.map((item) => item.title).toSorted()).toEqual(
      ["完成计数器组件", "安装开发环境", "学习 JSX"].toSorted(),
    )
    expect(items.every((item) => item.secondary === 0)).toBe(true)
  })

  it("queues a multi-action batch in conservative mode until confirmed", async () => {
    const { app, database } = await setup(
      `准备一起做这些。

\`\`\`json
[
  {"action":"create_project","as":"p","name":"保守批次","desiredOutcome":"验证确认流"},
  {"action":"create_item","title":"第一步","projectIds":["$p"],"todayMode":"today"}
]
\`\`\``,
      "conservative",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "建项目和第一步待办",
        currentPath: "/projects",
        currentLabel: "项目",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("待确认")
    expect(response.json().message.pendingAction?.status).toBe("pending")
    expect(response.json().message.pendingAction?.summary).toContain("1.")
    expect(response.json().message.pendingAction?.actions).toHaveLength(2)
    expect(
      database
        .prepare("SELECT COUNT(*) AS value FROM projects WHERE name = ? AND deleted_at IS NULL")
        .get("保守批次") as { value: number },
    ).toEqual({ value: 0 })
    const messageId = response.json().message.id as string
    const confirmed = await app.inject({
      method: "POST",
      url: `/api/ai/messages/${messageId}/confirm-action`,
    })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().confirmation).toContain("已实际创建项目「保守批次」")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM projects WHERE name = ? AND deleted_at IS NULL")
          .get("保守批次") as { value: number }
      ).value,
    ).toBe(1)
  })

  it("downgrades overflowing today primary items to secondary instead of failing", async () => {
    const { app, database } = await setup(
      `好的。

\`\`\`json
[
  {"action":"create_item","title":"超额一","todayMode":"today"},
  {"action":"create_item","title":"超额二","todayMode":"today"},
  {"action":"create_item","title":"超额三","todayMode":"today"},
  {"action":"create_item","title":"超额四","todayMode":"today"}
]
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "一次加四个今日主要待办",
        currentPath: "/todos",
        currentLabel: "待办",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("已实际创建待办「超额一」")
    expect(response.json().message.content).toContain("已实际创建待办「超额四」")
    expect(response.json().message.content).not.toContain("未能执行")
    const count = database
      .prepare(
        "SELECT COUNT(*) AS value FROM items WHERE title LIKE '超额%' AND deleted_at IS NULL",
      )
      .get() as { value: number }
    expect(count.value).toBe(4)
    const secondary = database
      .prepare(
        `SELECT COUNT(*) AS value FROM today_items
         JOIN items ON items.id = today_items.item_id
         WHERE items.title = '超额四' AND today_items.is_secondary = 1`,
      )
      .get() as { value: number }
    expect(secondary.value).toBe(1)
  })

  it("clears weeklyTarget for daily habits from messy model output", async () => {
    const { database } = await setup("unused", "open")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const { listHabits } = await import("../../src/server/repositories/habits.js")
    const settings = getSettings(database)
    const result = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
{"action":"create_habit","name":"每日拉伸纠错","type":"check","frequencyType":"daily","targetCount":1,"weeklyTarget":7,"restDays":[]}
\`\`\``,
    )
    expect(result.text).toContain("已实际创建习惯「每日拉伸纠错」")
    expect(listHabits(database, "2026-08-05").some((habit) => habit.name === "每日拉伸纠错")).toBe(
      true,
    )
  })

  it("accepts create_item aliases for project and todayMode", async () => {
    const { database } = await setup("unused", "open")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const settings = getSettings(database)
    applyAiChatActions(
      database,
      settings,
      `建项目。

\`\`\`json
{"action":"create_project","name":"别名项目","desiredOutcome":"验证别名"}
\`\`\``,
    )
    const created = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
{"action":"create_item","name":"别名待办","project":"别名项目","today":"次要"}
\`\`\``,
    )
    expect(created.text).toContain("已实际创建待办「别名待办」")
    const row = database
      .prepare(
        `SELECT items.title AS title, today_items.is_secondary AS secondary
         FROM items
         JOIN item_projects ON item_projects.item_id = items.id
         JOIN projects ON projects.id = item_projects.project_id
         LEFT JOIN today_items ON today_items.item_id = items.id
         WHERE items.title = ? AND projects.name = ? AND items.deleted_at IS NULL`,
      )
      .get("别名待办", "别名项目") as { title: string; secondary: number | null } | undefined
    expect(row?.title).toBe("别名待办")
    expect(row?.secondary).toBe(1)
  })

  it("keeps valid actions when a batch has one invalid entry", async () => {
    const { database } = await setup("unused", "open")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const settings = getSettings(database)
    const result = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
[
  {"action":"create_todo","title":"部分成功待办","todayMode":"secondary"},
  {"action":"create_habit","name":"坏习惯","type":"banana"}
]
\`\`\``,
    )
    expect(result.text).toContain("已实际创建待办「部分成功待办」")
    expect(result.text).toContain("已跳过")
    expect(result.text).not.toContain("未能执行：操作块格式不正确")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("部分成功待办") as { value: number }
      ).value,
    ).toBe(1)
  })

  it("reuses an existing active item instead of creating a duplicate title", async () => {
    const { database } = await setup("unused", "open")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const settings = getSettings(database)
    applyAiChatActions(
      database,
      settings,
      `创建。

\`\`\`json
{"action":"create_item","title":"去重待办"}
\`\`\``,
    )
    const again = applyAiChatActions(
      database,
      settings,
      `再来一次。

\`\`\`json
{"action":"create_item","title":"去重待办","todayMode":"secondary"}
\`\`\``,
    )
    expect(again.text).toContain("已有待办「去重待办」")
    expect(again.text).toContain("未重复创建")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("去重待办") as { value: number }
      ).value,
    ).toBe(1)
  })

  it("prefers active items when resolving the same title", async () => {
    const { database } = await setup("unused", "open")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const { createCategory } = await import("../../src/server/repositories/items.js")
    const settings = getSettings(database)
    const category = createCategory(database, { name: "学习", color: "#3b82f6", icon: "book" })
    applyAiChatActions(
      database,
      settings,
      `创建两条。

\`\`\`json
[
  {"action":"create_item","title":"同名解析待办","as":"old"},
  {"action":"create_item","title":"同名解析待办备用"}
]
\`\`\``,
    )
    // complete first by title would hit most recent active - create one, complete it, create another same title
    applyAiChatActions(
      database,
      settings,
      `完成旧的。

\`\`\`json
{"action":"complete_item","itemId":"同名解析待办"}
\`\`\``,
    )
    applyAiChatActions(
      database,
      settings,
      `再建活跃同名。

\`\`\`json
{"action":"create_item","title":"同名解析待办"}
\`\`\``,
    )
    const categorized = applyAiChatActions(
      database,
      settings,
      `分类。

\`\`\`json
{"action":"set_item_categories","itemId":"同名解析待办","categoryIds":["学习"]}
\`\`\``,
    )
    expect(categorized.text).toContain("已更新待办分类")
    const activeCats = database
      .prepare(
        `SELECT items.status AS status, item_categories.category_id AS categoryId
         FROM items
         LEFT JOIN item_categories ON item_categories.item_id = items.id
         WHERE items.title = ? AND items.deleted_at IS NULL
         ORDER BY CASE items.status WHEN 'active' THEN 0 ELSE 1 END, items.updated_at DESC`,
      )
      .all("同名解析待办") as { status: string; categoryId: string | null }[]
    const active = activeCats.find((row) => row.status === "active")
    expect(active?.categoryId).toBe(category.id)
  })

  it("reports partial success when a later step fails", async () => {
    const { app, database } = await setup(
      `先建项目。

\`\`\`json
[
  {"action":"create_project","name":"半程项目","desiredOutcome":"测部分失败"},
  {"action":"create_item","title":"坏引用","projectIds":["$missing"]}
]
\`\`\``,
      "open",
    )
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "建项目再挂坏引用待办",
        currentPath: "/projects",
        currentLabel: "项目",
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().message.content).toContain("已实际创建项目「半程项目」")
    expect(response.json().message.content).toContain("第 2/2 步未能执行")
    expect(response.json().message.content).toContain("已成功 1 步")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM projects WHERE name = ? AND deleted_at IS NULL")
          .get("半程项目") as { value: number }
      ).value,
    ).toBe(1)
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("坏引用") as { value: number }
      ).value,
    ).toBe(0)
  })

  it("resolves project/item by name for progress update and trash", async () => {
    const { app, database } = await setup(
      `先建好骨架。

\`\`\`json
[
  {"action":"create_project","name":"名引用项目","desiredOutcome":"验证名称引用"},
  {"action":"create_item","title":"名引用待办","projectIds":["名引用项目"]}
]
\`\`\``,
      "open",
    )
    const created = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        conversationId: null,
        content: "创建项目和待办",
        currentPath: "/projects",
        currentLabel: "项目",
      },
    })
    expect(created.statusCode).toBe(200)
    expect(created.json().message.content).toContain("已实际创建项目「名引用项目」")
    expect(created.json().message.content).toContain("已实际创建待办「名引用待办」")

    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const settings = getSettings(database)
    const progressed = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
{"action":"update_project_progress","projectId":"名引用项目","progress":"15"}
\`\`\``,
    )
    expect(progressed.text).toContain("已将项目进度更新为 15%")
    expect(
      (
        database
          .prepare("SELECT progress AS value FROM projects WHERE name = ? AND deleted_at IS NULL")
          .get("名引用项目") as { value: number }
      ).value,
    ).toBe(15)

    const trashed = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
{"action":"trash_item","itemId":"名引用待办"}
\`\`\``,
    )
    expect(trashed.text).toContain("待确认")
    expect(trashed.pendingAction?.status).toBe("pending")
    expect(trashed.pendingAction?.actions[0]?.action).toBe("trash_item")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("名引用待办") as { value: number }
      ).value,
    ).toBe(1)

    const { executeChatActions } = await import("../../src/server/services/aiChatActions.js")
    const confirmed = executeChatActions(database, settings, trashed.pendingAction!.actions)
    expect(confirmed).toContain("已将「名引用待办」移入回收站")
    expect(
      (
        database
          .prepare("SELECT COUNT(*) AS value FROM items WHERE title = ? AND deleted_at IS NULL")
          .get("名引用待办") as { value: number }
      ).value,
    ).toBe(0)
  })

  it("resolves item/category by name for set_item_categories aliases", async () => {
    const { database } = await setup("unused", "open")
    const { createCategory } = await import("../../src/server/repositories/items.js")
    const { applyAiChatActions } = await import("../../src/server/services/aiChatActions.js")
    const { getSettings } = await import("../../src/server/repositories/settings.js")
    const settings = getSettings(database)
    const category = createCategory(database, { name: "学习", color: "#3b82f6", icon: "book" })
    applyAiChatActions(
      database,
      settings,
      `创建。

\`\`\`json
{"action":"create_item","title":"分类名引用待办"}
\`\`\``,
    )

    const updated = applyAiChatActions(
      database,
      settings,
      `好的。

\`\`\`json
{"action":"set_item_categories","title":"分类名引用待办","category":"${category.name}"}
\`\`\``,
    )
    expect(updated.text).toContain("已更新待办分类")
    const row = database
      .prepare(
        `SELECT category_id AS categoryId FROM item_categories
         WHERE item_id = (SELECT id FROM items WHERE title = ? AND deleted_at IS NULL LIMIT 1)`,
      )
      .get("分类名引用待办") as { categoryId: string } | undefined
    expect(row?.categoryId).toBe(category.id)
  })
})

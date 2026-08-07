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

  it("rejects a batch that would exceed the today primary limit before writing", async () => {
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
    expect(response.json().message.content).toContain("今日主要待办最多 3 个")
    expect(response.json().message.content).toContain("本次未写入")
    const count = database
      .prepare(
        "SELECT COUNT(*) AS value FROM items WHERE title LIKE '超额%' AND deleted_at IS NULL",
      )
      .get() as { value: number }
    expect(count.value).toBe(0)
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
})

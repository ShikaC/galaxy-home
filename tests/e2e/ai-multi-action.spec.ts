import { createServer, type Server } from "node:http"
import { expect, test } from "@playwright/test"

let aiServer: Server | undefined
let aiPort = 0

const batchReply = `好的，一次建好。

\`\`\`json
[
  {"action":"create_project","as":"batch","name":"E2E多操作","desiredOutcome":"验证同轮数组"},
  {"action":"create_item","title":"E2E起步任务","projectIds":["$batch"],"todayMode":"today"}
]
\`\`\``

test.beforeAll(async () => {
  aiServer = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // drain body
    }
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ choices: [{ message: { content: batchReply } }] }))
  })
  await new Promise<void>((resolve) => aiServer?.listen(0, "127.0.0.1", resolve))
  const address = aiServer.address()
  if (address === null || typeof address === "string") throw new Error("AI test server failed")
  aiPort = address.port
})

test.afterAll(async () => {
  if (aiServer !== undefined) await new Promise<void>((resolve) => aiServer?.close(() => resolve()))
})

test.afterEach(async ({ request }) => {
  await request.put("/api/ai/config", {
    data: {
      chatBaseUrl: "",
      chatModel: "",
      apiKey: "",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    },
  })
})

test("open-mode multi-action batch creates project and today item", async ({ page, request }) => {
  await page.goto("/")
  const welcome = page.getByRole("heading", { name: "欢迎来到银河居所" })
  const home = page.getByRole("heading", { name: "今日空间" })
  await expect(welcome.or(home)).toBeVisible()
  if (await welcome.isVisible()) {
    await page.getByLabel("个人空间名称").fill("银河居所")
    await page.getByLabel("AI 助手昵称").fill("星伴")
    await page.getByLabel("AI 对你的称呼").fill("小河")
    await page.getByRole("button", { name: "进入我的空间" }).click()
  }
  await expect(home).toBeVisible()

  await request.put("/api/ai/config", {
    data: {
      chatBaseUrl: `http://127.0.0.1:${aiPort}/v1`,
      chatModel: "batch-model",
      apiKey: "batch-key",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    },
  })
  const settings = await request.patch("/api/settings", { data: { aiPermission: "open" } })
  expect(settings.ok()).toBe(true)

  const chat = await request.post("/api/ai/chat", {
    data: {
      conversationId: null,
      content: "创建 E2E 多操作项目并放一个今日任务",
      currentPath: "/projects",
      currentLabel: "项目",
    },
  })
  expect(chat.ok()).toBe(true)
  const body = (await chat.json()) as { message: { content: string } }
  expect(body.message.content).toContain("已实际创建项目「E2E多操作」")
  expect(body.message.content).toContain("已实际创建待办「E2E起步任务」")

  await page.goto("/projects")
  await expect(page.getByText("E2E多操作", { exact: true })).toBeVisible()
  await page.goto("/")
  await expect(page.getByText("E2E起步任务", { exact: true })).toBeVisible()
})

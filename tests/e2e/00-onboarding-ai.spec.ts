import { createServer, type Server } from "node:http"
import { expect, test } from "@playwright/test"

let aiServer: Server | undefined
let aiPort = 0

test.beforeAll(async () => {
  aiServer = createServer(async (request, response) => {
    for await (const _chunk of request) {
    }
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ choices: [{ message: { content: "连接成功" } }] }))
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

test("optional AI setup can be tested during onboarding", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "欢迎来到银河居所" })).toBeVisible()
  await page.getByLabel("聊天服务地址").fill(`http://127.0.0.1:${aiPort}/v1`)
  await page.getByLabel("聊天模型").fill("onboarding-model")
  await page.getByLabel("API Key").fill("onboarding-key")
  await page.getByRole("button", { name: "保存并测试 AI 服务" }).click()
  await expect(page.getByText("连接成功", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "进入我的空间" }).click()
  await expect(page.getByRole("heading", { name: "今日空间" })).toBeVisible()
})

test("global search opens the matched AI conversation", async ({ page, request }) => {
  await request.put("/api/ai/config", {
    data: {
      chatBaseUrl: `http://127.0.0.1:${aiPort}/v1`,
      chatModel: "search-model",
      apiKey: "search-key",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    },
  })
  const conversation = await request.post("/api/ai/chat", {
    data: {
      conversationId: null,
      content: "搜索定位会话",
      currentPath: "/",
      currentLabel: "首页",
    },
  })
  expect(conversation.ok()).toBe(true)

  await page.goto("/")
  await page.getByRole("button", { name: "全局搜索" }).click()
  await page.getByLabel("搜索空间").fill("搜索定位会话")
  await page.getByRole("button", { name: /搜索定位会话/ }).click()

  const drawer = page.getByRole("dialog", { name: "星伴 AI 助手" })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText("搜索定位会话", { exact: true })).toBeVisible()
})

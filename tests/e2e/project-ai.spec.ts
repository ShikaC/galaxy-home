import { createServer, type Server } from "node:http"
import { expect, test } from "@playwright/test"

let aiServer: Server | undefined
let aiPort = 0

test.beforeAll(async () => {
  const responses = [
    { questions: ["什么结果算真正完成？"] },
    {
      stageTitle: "建立第一周节奏",
      currentTask: "选定第一篇材料",
      nextTask: "完成第一次专注阅读",
      progress: 18,
    },
    { kind: "task", nextTask: "根据阻碍缩小第二次阅读", progress: 36 },
  ]
  let responseIndex = 0
  aiServer = createServer(async (request, response) => {
    for await (const _chunk of request) {
    }
    const content = responses[responseIndex]
    responseIndex += 1
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }))
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

test("project AI clarifies, applies one stage, and advances from feedback", async ({
  page,
  request,
}, testInfo) => {
  const suffix = Date.now().toString().slice(-7)
  const projectName = `AI 阅读计划 ${suffix}`
  await request.post("/api/onboarding", {
    data: {
      workspaceName: "银河居所",
      aiNickname: "星伴",
      userName: "小河",
      timezone: "Asia/Shanghai",
    },
  })
  await request.put("/api/ai/config", {
    data: {
      chatBaseUrl: `http://127.0.0.1:${aiPort}/v1`,
      chatModel: "e2e-model",
      apiKey: "e2e-key",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    },
  })

  await page.goto("/projects")
  await page.getByRole("button", { name: "新项目" }).click()
  await page.getByLabel("项目名称").fill(projectName)
  await page.getByLabel("最终希望达到的结果").fill("形成每周三次的稳定阅读节奏")
  await page.getByLabel("当前阶段").fill("等待 AI 澄清")
  await page.getByLabel("当前任务").fill("说清楚目标")
  await page.getByLabel("下一任务").fill("等待建议")
  await page.getByRole("button", { name: "创建项目" }).click()
  await page.getByRole("link", { name: new RegExp(projectName) }).click()

  await page.getByRole("button", { name: "开始澄清" }).click()
  await expect(page.getByText("什么结果算真正完成？")).toBeVisible()
  await page.getByLabel("你的回答").fill("能够每周阅读三次并留下简短笔记")
  await page.getByRole("button", { name: "继续" }).click()
  await expect(page.getByText("建立第一周节奏", { exact: true })).toBeVisible()
  await expect(page.getByText("选定第一篇材料", { exact: true })).toBeVisible()
  await expect(page.getByText("完成第一次专注阅读", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "采用此拆解" }).click()

  await expect(page.getByText("AI 估算")).toBeVisible()
  await page.getByLabel("实际成果（可选）").fill("材料已经选好")
  await page.getByLabel("遇到的阻碍（可选）").fill("一次安排太长")
  await page.getByRole("button", { name: "AI 调整并完成" }).click()

  await expect(page.getByText("完成第一次专注阅读", { exact: true })).toBeVisible()
  await expect(page.getByText("根据阻碍缩小第二次阅读", { exact: true })).toBeVisible()
  await expect(page.getByText("成果：材料已经选好")).toBeVisible()
  await expect(page.getByText("阻碍：一次安排太长")).toBeVisible()
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("project-ai-flow.png") })
})

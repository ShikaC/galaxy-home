import { mkdirSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { z } from "zod"
import { planRunSchema } from "../../src/shared/planning.js"
import { E2E_LOCAL_DATE, expect, test } from "../helpers/e2e.js"

let model: Server | undefined
let modelPort = 0
const inputSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
})
const contextSchema = z.object({
  goal: z.string(),
  sources: z.array(z.object({ id: z.string() })),
  existingItems: z.array(z.object({ id: z.string(), title: z.string() })),
})
test.beforeAll(async () => {
  model = createServer(async (request, response) => {
    let body = ""
    for await (const chunk of request) body += chunk
    const messages = inputSchema.parse(JSON.parse(body)).messages
    const user = messages.find((message) => message.role === "user")
    if (user === undefined) throw new Error("Missing model input")
    let payload: unknown
    try {
      payload = JSON.parse(user.content)
    } catch {
      payload = null
    }
    const parsed = contextSchema.safeParse(payload)
    if (!parsed.success) {
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify({ choices: [{ message: { content: "{}" } }] }))
      return
    }
    const context = parsed.data
    if (context.goal.includes("慢速")) await new Promise((resolve) => setTimeout(resolve, 15_000))
    const reused = context.existingItems.find((item) => item.title === "作品集案例提纲 E2E")
    const proposal = {
      summary: "把作品集案例变成一个清楚的提纲，再整理验证材料。",
      clarification:
        context.goal.includes("附件") && !context.goal.includes("我的回答：")
          ? "请提供附件中的具体成果要求。"
          : null,
      tasks:
        context.goal.includes("附件") && !context.goal.includes("我的回答：")
          ? []
          : [
              {
                title: "作品集案例提纲 E2E",
                minutes: 25,
                dayOffset: 0,
                reason: "交代问题、方案与验证结果，形成一份可检查的提纲。",
                sourceIds: context.sources.map((source) => source.id),
                existingItemId: reused?.id ?? null,
              },
              {
                title: "整理作品集验证材料 E2E",
                minutes: 20,
                dayOffset: 0,
                reason: "从已有记录中选出两份支撑结果的材料。",
                sourceIds: context.sources.map((source) => source.id),
                existingItemId: null,
              },
            ],
    }
    response.setHeader("content-type", "application/json")
    response.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(proposal) } }],
        usage: { prompt_tokens: 320, completion_tokens: 180 },
      }),
    )
  })
  await new Promise<void>((resolve) => model?.listen(0, "127.0.0.1", resolve))
  const address = model.address()
  if (address === null || typeof address === "string") throw new Error("Missing fixture port")
  modelPort = address.port
})
test.afterAll(async () => {
  await new Promise<void>((resolve) => model?.close(() => resolve()))
})
test.beforeEach(async ({ request }) => {
  const onboarding = await request.post("/api/onboarding", {
    data: {
      workspaceName: "创作与探索",
      aiNickname: "星伴",
      userName: "Shika",
      timezone: "Asia/Shanghai",
    },
  })
  expect(onboarding.ok()).toBe(true)
  await request.patch("/api/settings", { data: { aiPermission: "open" } })
  await request.put("/api/ai/config", {
    data: {
      chatBaseUrl: `http://127.0.0.1:${modelPort}/v1`,
      chatModel: "planning-fixture",
      apiKey: "fixture-key",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    },
  })
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
  await request.patch("/api/settings", { data: { aiPermission: "conservative" } })
})
test("knowledge plan cites notes, reuses existing work, confirms once, persists and exports", async ({
  page,
  request,
}, info) => {
  const note = await request.post("/api/notes", {
    data: {
      title: "作品集案例研究 E2E",
      content: "案例需要交代问题、方案与验证结果。先写提纲，再整理验证材料。",
    },
  })
  expect(note.ok()).toBe(true)
  const existing = await request.post("/api/items", { data: { title: "作品集案例提纲 E2E" } })
  expect(existing.ok()).toBe(true)
  await page.goto("/plans")
  await expect(page.getByRole("heading", { name: "AI 行动计划" })).toBeVisible()
  await page.getByLabel("想推进的目标").fill("根据作品集笔记安排今天45分钟，优先复用已有任务。")
  await page.getByRole("button", { name: "生成行动计划", exact: true }).click()
  await expect(page.getByText("等待你确认", { exact: true }).first()).toBeVisible()
  const detail = page.getByRole("article", { name: "计划详情" })
  await expect(detail.getByText("复用已有任务", { exact: true })).toBeVisible()
  await expect(detail.getByText("45 / 45 分钟")).toBeVisible()
  await detail.getByText(/参考了 \d+ 篇笔记/).click()
  await expect(
    detail.getByRole("link", { name: "作品集案例研究 E2E", exact: true }).last(),
  ).toBeVisible()
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("plan-confirmation.png"),
    fullPage: true,
  })
  await detail.getByRole("button", { name: "确认并安排任务" }).click()
  await expect(detail.getByText("已安排并核验", { exact: true })).toBeVisible()
  const id = new URL(page.url()).searchParams.get("run")
  const once = planRunSchema.parse(await (await request.get(`/api/plans/${id}`)).json())
  expect(once.results).toHaveLength(2)
  expect(once.results[0]?.disposition).toBe("reused")
  expect((await request.post(`/api/plans/${id}/confirm`)).ok()).toBe(true)
  expect(planRunSchema.parse(await (await request.get(`/api/plans/${id}`)).json()).results).toEqual(
    once.results,
  )
  await page.reload()
  await expect(detail.getByText("已安排并核验", { exact: true })).toBeVisible()
  await detail.getByText("运行记录", { exact: true }).click()
  await expect(detail.getByText(/320 \/ 180/)).toBeVisible()
  const download = page.waitForEvent("download")
  await detail.getByRole("button", { name: "导出运行记录" }).click()
  expect((await download).suggestedFilename()).toBe(`galaxy-plan-${id}.json`)
  const items = z
    .array(z.object({ title: z.string() }))
    .parse(await (await request.get(`/api/items?view=today&localDate=${E2E_LOCAL_DATE}`)).json())
  expect(items.filter((item) => item.title === "整理作品集验证材料 E2E")).toHaveLength(1)
})
test("shows clarification, cancellation and provider errors with responsive light/night states", async ({
  page,
  request,
}, info) => {
  test.setTimeout(120_000)
  const evidence = `.omo/evidence/planning/${info.project.name}`
  mkdirSync(evidence, { recursive: true })
  const capture = async (state: string) => {
    for (const theme of ["dawn", "night"])
      for (const width of [1440, 768, 375]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate((theme) => {
          document.documentElement.setAttribute("data-theme", theme)
          document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light"
        }, theme)
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          )
          .toBe(true)
        await expect(page.locator("html")).toHaveCSS(
          "color-scheme",
          theme === "night" ? "dark" : "light",
        )
        await page.locator(".main-scroll").evaluate((element) => {
          element.scrollTop = 0
        })
        await page.screenshot({
          animations: "disabled",
          path: `${evidence}/${state}-${theme}-${width}.png`,
        })
        await page.locator(".main-scroll").evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        await page.screenshot({
          animations: "disabled",
          path: `${evidence}/${state}-${theme}-${width}-bottom.png`,
        })
      }
  }
  await page.goto("/plans")
  await expect(page.getByLabel("想推进的目标")).toBeVisible()
  await capture("composer")
  await page.getByLabel("想推进的目标").fill("根据尚未上传的作品集附件安排任务，先问我缺失的信息。")
  await page.getByRole("button", { name: "生成行动计划", exact: true }).click()
  await expect(page.getByText("请提供附件中的具体成果要求。", { exact: true })).toBeVisible()
  await capture("clarification")
  await page.getByRole("button", { name: "补充目标后重新生成" }).click()
  await page.getByLabel("想推进的目标").fill("整理作品集案例提纲与验证材料。")
  await page.getByRole("button", { name: "生成行动计划", exact: true }).click()
  await expect(page.getByRole("button", { name: "确认并安排任务" })).toBeVisible()
  await capture("confirmation")
  await page.getByRole("button", { name: "确认并安排任务" }).click()
  await expect(
    page.getByRole("article", { name: "计划详情" }).getByText("已安排并核验", { exact: true }),
  ).toBeVisible()
  await page
    .getByRole("article", { name: "计划详情" })
    .getByText("运行记录", { exact: true })
    .click()
  await capture("succeeded")
  await page.getByRole("button", { name: "新计划", exact: true }).click()
  await page.getByLabel("想推进的目标").fill("整理作品集案例提纲与验证材料。")
  await page.getByRole("button", { name: "生成行动计划", exact: true }).click()
  await page.getByRole("button", { name: "取消计划", exact: true }).click()
  await expect(
    page.getByRole("article", { name: "计划详情" }).getByText("已取消", { exact: true }),
  ).toBeVisible()
  await capture("cancelled")
  await page.getByRole("button", { name: "调整目标，重新生成" }).click()
  await request.put("/api/ai/config", {
    data: {
      chatBaseUrl: "",
      chatModel: "",
      apiKey: "",
      transcriptionBaseUrl: "",
      transcriptionModel: "",
    },
  })
  await page.getByRole("button", { name: "生成行动计划", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("AI 尚未配置")
  await capture("unconfigured")
})

test("edits a generated draft locally, preserves clarification, and cancels a durable running plan", async ({
  page,
  request,
}, info) => {
  const evidence = `.omo/evidence/live-usage/visual/${info.project.name}`
  mkdirSync(evidence, { recursive: true })
  const capture = async (state: string) => {
    for (const theme of ["dawn", "night"])
      for (const width of [1440, 768, 375]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate((theme) => {
          document.documentElement.setAttribute("data-theme", theme)
          document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light"
        }, theme)
        await expect(page.locator("html")).toHaveCSS(
          "color-scheme",
          theme === "night" ? "dark" : "light",
        )
        await page.locator(".main-scroll").evaluate((element) => {
          element.scrollTop = 0
        })
        await page.screenshot({
          animations: "disabled",
          path: `${evidence}/${state}-${theme}-${width}.png`,
        })
        await page.locator(".main-scroll").evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        await page.screenshot({
          animations: "disabled",
          path: `${evidence}/${state}-${theme}-${width}-bottom.png`,
        })
        if (state === "editor") {
          await page
            .getByLabel("任务 2", { exact: true })
            .evaluate((element) => element.scrollIntoView({ block: "center" }))
          await page.screenshot({
            animations: "disabled",
            path: `${evidence}/${state}-${theme}-${width}-middle.png`,
          })
        }
      }
  }
  test.setTimeout(90_000)
  await page.goto("/plans")
  await page.getByLabel("想推进的目标").fill("根据未上传的作品集附件安排任务")
  await page.getByRole("button", { name: "生成行动计划", exact: true }).click()
  await expect(page.getByLabel("补充信息")).toBeVisible()
  await page
    .getByLabel("补充信息")
    .fill("已有材料是案例提纲和两份验证截图，请先整理提纲再检查材料。")
  await page.getByRole("button", { name: "补充并继续规划" }).click()
  const detail = page.getByRole("article", { name: "计划详情" })
  await expect(detail.getByRole("button", { name: "调整安排" })).toBeVisible()
  const id = new URL(page.url()).searchParams.get("run")
  const original = planRunSchema.parse(await (await request.get(`/api/plans/${id}`)).json())
  expect(original.input.goal).toContain("根据未上传的作品集附件")
  expect(original.input.goal).toContain("已有材料是案例提纲")
  await detail.getByText("查看原始目标", { exact: true }).click()
  await capture("original-goal")
  await detail.getByText("查看原始目标", { exact: true }).click()
  await detail.locator(".plan-citations a").first().click()
  await expect(detail.locator(".plan-sources")).toHaveAttribute("open", "")
  await capture("sources")
  await detail.locator(".plan-sources summary").click()
  await detail.getByRole("button", { name: "调整安排" }).click()
  await page.getByLabel("任务 1 分钟", { exact: true }).fill("40")
  await expect(page.getByRole("button", { name: "保存调整" })).toBeDisabled()
  await page.getByLabel("任务 1 分钟", { exact: true }).fill("10")
  await page.getByLabel("任务 2", { exact: true }).fill("核对作品集材料中的截图与结论")
  await page.getByLabel("任务 2 分钟", { exact: true }).fill("25")
  await page.getByRole("link", { name: "知识笔记", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "未保存的计划调整" })).toBeVisible()
  await capture("unsaved-dialog")
  await page.getByRole("button", { name: "继续调整" }).click()
  await capture("editor")
  await page.getByRole("button", { name: "保存调整" }).click()
  await expect(detail.getByText(/已由你调整 · 第 1 版/)).toBeVisible()
  await capture("edited-confirmation")
  const edited = planRunSchema.parse(await (await request.get(`/api/plans/${id}`)).json())
  expect(edited.attempts).toEqual(original.attempts)
  expect(edited.proposal?.tasks[1]?.title).toBe("核对作品集材料中的截图与结论")
  await detail.getByRole("button", { name: "确认并安排任务" }).click()
  await expect(detail.getByText("已安排并核验", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "新计划", exact: true }).click()
  await page.getByLabel("想推进的目标").fill("慢速生成作品集计划，用于取消场景")
  await page.getByRole("button", { name: "生成行动计划", exact: true }).click()
  await expect(page.getByRole("button", { name: "取消生成" })).toBeVisible()
  await page.reload()
  await capture("generating")
  await page.getByRole("button", { name: "取消生成" }).click()
  await expect(detail.getByText("已取消", { exact: true })).toBeVisible()
})

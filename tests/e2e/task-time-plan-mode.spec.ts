import type { Server } from "node:http"
import type { APIRequestContext } from "@playwright/test"
import { z } from "zod"
import { capture, expect, items, readRun, runId, test } from "../helpers/task-time.js"
import { releaseFixtureResponses, startFixture } from "../helpers/task-time-fixture.js"

let fixture: Server | undefined
let port = 0
const noteTitle = "作品集案例研究 E2E"
const reuseTitle = "作品集案例提纲 E2E"
const createdTitle = "整理作品集验证材料 E2E"
const editedTitle = "本地改写的作品集提纲"
// 计划模式写入的任务必须自清理：测试库会被同文件的其它用例继续使用。
async function removePlanItems(request: APIRequestContext): Promise<void> {
  for (const item of await items(request))
    if ([reuseTitle, createdTitle, editedTitle].includes(item.title))
      await request.delete(`/api/items/${item.id}`)
}
const idOf = z.object({ id: z.string() })
test.beforeAll(async () => {
  const started = await startFixture()
  fixture = started.server
  port = started.port
})
test.afterAll(async () => {
  releaseFixtureResponses()
  await new Promise<void>((resolve) => fixture?.close(() => resolve()))
})
test.beforeEach(async ({ request }) => {
  for (const item of await items(request))
    expect((await request.delete(`/api/items/${item.id}`)).ok()).toBe(true)
  expect(
    (
      await request.post("/api/onboarding", {
        data: {
          workspaceName: "计划模式验收",
          aiNickname: "Fixture",
          userName: "场景验收",
          timezone: "Asia/Shanghai",
        },
      })
    ).ok(),
  ).toBe(true)
  expect(
    (
      await request.patch("/api/settings", {
        data: { aiPermission: "open", timezone: "Asia/Shanghai" },
      })
    ).ok(),
  ).toBe(true)
  expect(
    (
      await request.put("/api/ai/config", {
        data: {
          chatBaseUrl: `http://127.0.0.1:${port}/v1`,
          chatModel: "plan-mode-http-fixture",
          apiKey: "fixture-key",
          transcriptionBaseUrl: "",
          transcriptionModel: "",
        },
      })
    ).ok(),
  ).toBe(true)
})

test("plan mode cites notes, reuses existing work, confirms once and keeps the result after reload", async ({
  page,
  request,
}, info) => {
  test.setTimeout(120_000)
  const note = await request.post("/api/notes", {
    data: {
      title: noteTitle,
      content: "案例需要交代问题、方案与验证结果。先写提纲，再整理验证材料。",
    },
  })
  expect(note.ok()).toBe(true)
  try {
    const existing = await request.post("/api/items", { data: { title: reuseTitle } })
    expect(existing.ok()).toBe(true)
    await page.goto("/task-plans?mode=plan")
    await page.getByLabel("想推进的目标").fill("根据作品集笔记安排今天的行动，优先复用已有任务。")
    await page.getByRole("button", { name: "生成可编辑预览" }).click()
    await expect(page.getByText("等待确认", { exact: true }).first()).toBeVisible()
    const detail = page.getByRole("article", { name: "计划详情" })
    await expect(
      detail.locator(".task-plan-card").filter({ hasText: reuseTitle }).getByText("复用已有任务"),
    ).toBeVisible()
    await detail.getByText(/参考了 \d+ 篇笔记/).click()
    await expect(detail.getByRole("link", { name: noteTitle, exact: true }).last()).toBeVisible()
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("plan-mode-confirmation.png"),
      fullPage: true,
    })
    await detail.getByRole("button", { name: "确认并写入" }).click()
    await expect(detail.getByText("写入并核验完成", { exact: true })).toBeVisible()
    const id = runId(page)
    const once = await readRun(request, id)
    expect(once.results).toHaveLength(2)
    expect(once.results[0]?.disposition).toBe("reused")
    expect(once.results[1]?.disposition).toBe("created")
    expect(once.results[1]?.localDate).toBe("2026-09-10")
    // 再次确认是幂等的：不重复建任务，结果与首次一致。
    expect(
      (
        await request.post(`/api/task-plans/${id}/confirm`, {
          data: { expectedRevision: once.draftRevision },
        })
      ).ok(),
    ).toBe(true)
    expect((await readRun(request, id)).results).toEqual(once.results)
    await page.reload()
    await expect(
      page.getByRole("article", { name: "计划详情" }).getByText("写入并核验完成", { exact: true }),
    ).toBeVisible()
    const today = await items(request, "today")
    expect(today.filter((item) => item.title === createdTitle)).toHaveLength(1)
    expect(today.filter((item) => item.title === reuseTitle)).toHaveLength(1)
  } finally {
    await removePlanItems(request)
    // 笔记没有删除端点，用归档清理，避免影响其它用例的检索结果。
    await request.patch(`/api/notes/${idOf.parse(await note.json()).id}`, {
      data: { archived: true },
    })
  }
})

test("plan mode asks for clarification instead of scheduling when the goal is incomplete", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  await page.goto("/task-plans?mode=plan")
  await page.getByLabel("想推进的目标").fill("fixture-clarify 想投递作品集但还没定岗位。")
  await page.getByRole("button", { name: "生成可编辑预览" }).click()
  await expect(page.getByText("需要补充", { exact: true }).first()).toBeVisible()
  const detail = page.getByRole("article", { name: "计划详情" })
  await expect(detail.getByText(/投递到哪个岗位/)).toBeVisible()
  // 澄清状态下没有可确认的提案：按钮仍渲染但不可点，不写入任何任务。
  await expect(detail.getByRole("button", { name: "确认并写入" })).toBeDisabled()
  await capture(page, "plan-mode-clarification")
  expect(
    (await items(request, "today")).filter((item) => item.title === createdTitle),
  ).toHaveLength(0)
})

test("surfaces provider failures with a retry path and writes nothing", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  await page.goto("/task-plans?mode=plan")
  await page.getByLabel("想推进的目标").fill("fixture-unavailable 先安排作品集任务。")
  await page.getByRole("button", { name: "生成可编辑预览" }).click()
  await expect(page.getByText(/失败|不可用/).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole("button", { name: /重试/ }).first()).toBeVisible()
  expect(
    (await items(request, "today")).filter((item) => item.title === createdTitle),
  ).toHaveLength(0)
})

test("keeps the plan draft editable and version-guarded before confirmation", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  await page.goto("/task-plans?mode=plan")
  await page.getByLabel("想推进的目标").fill("根据作品集笔记安排今天的行动。")
  await page.getByRole("button", { name: "生成可编辑预览" }).click()
  await expect(page.getByText("等待确认", { exact: true }).first()).toBeVisible()
  const detail = page.getByRole("article", { name: "计划详情" })
  await detail.getByRole("button", { name: "编辑提案" }).click()
  // 第一条是复用任务（只读），改写新建的第二条。
  await page
    .getByRole("textbox", { name: /^任务 \d+$/ })
    .nth(1)
    .fill(editedTitle)
  await page.getByRole("button", { name: "保存修改" }).click()
  await expect(page.getByText(editedTitle)).toBeVisible()
  const id = runId(page)
  const draft = await readRun(request, id)
  try {
    // 用过期版本确认必须被拒绝，且不产生写入。
    const stale = await request.post(`/api/task-plans/${id}/confirm`, {
      data: { expectedRevision: draft.draftRevision - 1 },
    })
    expect(stale.ok()).toBe(false)
    expect((await readRun(request, id)).status).toBe("awaiting_confirmation")
    expect(
      (await items(request, "today")).filter((item) => item.title === createdTitle),
    ).toHaveLength(0)
    expect(
      (
        await request.post(`/api/task-plans/${id}/confirm`, {
          data: { expectedRevision: draft.draftRevision },
        })
      ).ok(),
    ).toBe(true)
    expect(
      (await items(request, "today")).filter((item) => item.title === editedTitle),
    ).toHaveLength(1)
  } finally {
    await removePlanItems(request)
  }
})

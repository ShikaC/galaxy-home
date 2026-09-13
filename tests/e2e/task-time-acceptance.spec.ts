import type { Server } from "node:http"
import { z } from "zod"
import { calendarSnapshotSchema } from "../../src/shared/calendar.js"
import { itemDetailSchema } from "../../src/shared/items.js"
import { taskSeriesSchema } from "../../src/shared/recurrence.js"
import { taskPlanRunSchema } from "../../src/shared/taskPlanning.js"
import {
  capture,
  expect,
  items,
  readRun,
  registerTaskTimeFailureTests,
  runId,
  test,
} from "../helpers/task-time.js"
import { releaseFixtureResponses, startFixture } from "../helpers/task-time-fixture.js"

let fixture: Server | undefined
let port = 0
const title = "周五提交可核验的客户反馈方案"
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
          workspaceName: "任务时间验收",
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
          chatModel: "task-time-http-fixture",
          apiKey: "fixture-key",
          transcriptionBaseUrl: "",
          transcriptionModel: "",
        },
      })
    ).ok(),
  ).toBe(true)
})

test("accepts the first task-time scenario through editable capture, calendar, replan and persistence", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000)
  // Given a deterministic local fixture and the actual application's task and calendar APIs.
  await page.goto("/task-plans")
  const original = page.getByLabel("原始记录")
  await original.fill("每个工作日检查客户反馈，周五提交方案。")
  await original.dispatchEvent("compositionstart", { data: "方" })
  await original.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    ctrlKey: true,
    isComposing: true,
    keyCode: 229,
  })
  expect(new URL(page.url()).searchParams.has("run")).toBe(false)
  await original.dispatchEvent("compositionend", { data: "方案" })
  await page.getByRole("button", { name: "生成可编辑预览" }).click()
  await expect(page.getByRole("button", { name: "编辑提案" })).toBeVisible()
  await capture(page, "capture-preview")
  const captureId = runId(page)
  expect((await items(request)).filter((item) => item.title === "周五提交方案")).toHaveLength(0)
  await page.getByRole("button", { name: "编辑提案" }).click()
  await page.getByLabel("任务 1 标题", { exact: true }).fill(title)
  await page.getByLabel("任务 1 预计分钟", { exact: true }).fill("60")
  await expect(page.getByLabel("任务 1 截止日期", { exact: true })).toHaveValue("2026-09-11")
  await capture(page, "capture-editor")
  await page.getByRole("button", { name: "保存修改" }).click()
  await page.getByRole("button", { name: "确认并写入" }).click()
  await expect(page.getByText("写入并核验完成", { exact: true }).last()).toBeVisible()
  await capture(page, "capture-succeeded")
  const captured = await readRun(request, captureId)
  expect(captured.results.map((result) => result.kind).sort()).toEqual(["item", "series"])
  const replay = await request.post(`/api/task-plans/${captureId}/confirm`, {
    data: { expectedRevision: captured.draftRevision },
  })
  expect(taskPlanRunSchema.parse(await replay.json()).results).toEqual(captured.results)
  const proposal = (await items(request)).find((item) => item.title === title)
  if (proposal === undefined) throw new Error("Confirmed proposal task missing")
  const series = z
    .array(taskSeriesSchema)
    .parse(await (await request.get("/api/task-series")).json())
    .find((value) => value.title === "检查客户反馈")
  expect(series?.rule).toMatchObject({ frequency: "weekly", weekdays: [1, 2, 3, 4, 5] })

  // When the user adds a child and places the parent into a real calendar slot.
  await page.goto("/todos")
  const row = page.locator(".task-row").filter({ hasText: title })
  await row.getByRole("button", { name: "更多操作" }).click()
  await page.getByRole("menuitem", { name: "编辑待办" }).click()
  await page.getByLabel("新子任务标题").fill("整理客户意见并核对证据")
  await page.getByRole("button", { name: "添加子任务" }).click()
  await expect(page.getByRole("button", { name: "编辑 整理客户意见并核对证据" })).toBeVisible()
  await capture(page, "task-detail-subtask")
  await page.getByText("说明、截止与安排", { exact: true }).click()
  await page.getByLabel("说明", { exact: true }).fill("方案需要包含子任务整理的客户意见与证据。")
  await page.getByRole("button", { name: "保存修改", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page
    .locator(".task-row")
    .filter({ hasText: "整理客户意见并核对证据" })
    .getByRole("button", { name: "更多操作" })
    .click()
  await page.getByRole("menuitem", { name: "编辑待办" }).click()
  await page.getByText("说明、截止与安排", { exact: true }).click()
  await page.getByLabel("预计耗时（分钟）").fill("30")
  await page.getByRole("button", { name: "保存修改", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.goto("/calendar")
  await page
    .locator(".calendar-backlog article")
    .filter({ hasText: title })
    .getByRole("button", { name: "安排", exact: true })
    .click()
  await page.getByLabel("开始", { exact: true }).fill("2026-09-10T10:00")
  await page.getByLabel("结束", { exact: true }).fill("2026-09-10T11:00")
  await page.getByRole("button", { name: "保存安排" }).click()
  await expect(page.locator(".calendar-editor")).toHaveCount(0)
  await page.goto("/todos?view=active")
  await page
    .locator(".task-row")
    .filter({ hasText: title })
    .getByRole("button", { name: "更多操作" })
    .click()
  await page.getByRole("menuitem", { name: "编辑待办" }).click()
  await page.getByText("说明、截止与安排", { exact: true }).click()
  await page.getByLabel("安排前 10 分钟", { exact: true }).check()
  await page.getByLabel("安排开始时", { exact: true }).check()
  await page.getByRole("button", { name: "保存修改", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.goto("/calendar")
  await page.getByRole("button", { name: "固定日程", exact: true }).click()
  await page.getByLabel("标题", { exact: true }).fill("临时客户会议")
  await page.getByLabel("开始", { exact: true }).fill("2026-09-10T10:00")
  await page.getByLabel("结束", { exact: true }).fill("2026-09-10T11:00")
  await page.getByRole("button", { name: "创建固定日程", exact: true }).click()
  await expect(page.locator(".calendar-event--conflict").first()).toBeVisible()
  await capture(page, "calendar-week-overlap")
  const before = calendarSnapshotSchema.parse(
    await (
      await request.get(
        `/api/calendar?startDate=2026-09-07&endDate=2026-09-14&timezone=Asia%2FShanghai`,
      )
    ).json(),
  )
  expect(before.conflicts.some((conflict) => conflict.code === "OVERLAP")).toBe(true)

  // Then replan explains the move, preserves the meeting, accepts a user edit and persists one result.
  await page.getByRole("link", { name: "智能重排" }).click()
  await page.getByLabel("原始记录").fill("临时会议占用原时段，调整本周剩余工作，保留会议。")
  await page.getByRole("button", { name: "生成可编辑预览" }).click()
  await expect(page.getByRole("button", { name: "编辑提案" })).toBeVisible()
  const replanId = runId(page)
  const draft = await readRun(request, replanId)
  if (draft.proposal?.kind !== "replan") throw new Error("Replan draft missing")
  const moveIndex =
    draft.proposal.changes.findIndex(
      (change) => change.action === "move" && change.itemId === proposal.id,
    ) + 1
  expect(draft.proposal.changes.some((change) => change.action === "keep")).toBe(true)
  await expect(page.getByText("原安排", { exact: true }).first()).toBeVisible()
  await expect(page.locator(".task-plan-reason").first()).toBeVisible()
  await capture(page, "replan-preview")
  await page.getByRole("button", { name: "编辑提案" }).click()
  await page.getByLabel(`变更 ${moveIndex} 新开始时间`).fill("2026-09-10T15:00")
  await page.getByLabel(`变更 ${moveIndex} 新结束时间`).fill("2026-09-10T16:00")
  await capture(page, "replan-editor")
  await page.getByRole("button", { name: "保存修改" }).click()
  await page.getByRole("button", { name: "确认并写入" }).click()
  await expect(page.getByText("写入并核验完成", { exact: true }).last()).toBeVisible()
  await page.reload()
  await capture(page, "replan-success")
  const persisted = itemDetailSchema.parse(
    await (await request.get(`/api/items/${proposal.id}`)).json(),
  )
  expect(persisted).toMatchObject({
    title,
    dueDate: "2026-09-11",
    estimatedMinutes: 60,
    scheduledStartAt: "2026-09-10T07:00:00.000Z",
  })
  expect(persisted.reminders.filter((reminder) => reminder.anchor === "scheduled")).toHaveLength(2)
  expect(persisted.subtasks.map((item) => item.title)).toContain("整理客户意见并核对证据")
  const today = (await items(request, "today")).find((item) => item.id === proposal.id)
  expect(today).toMatchObject({
    title,
    scheduledStartAt: persisted.scheduledStartAt,
    version: persisted.version,
  })
  const after = calendarSnapshotSchema.parse(
    await (
      await request.get(
        `/api/calendar?startDate=2026-09-07&endDate=2026-09-14&timezone=Asia%2FShanghai`,
      )
    ).json(),
  )
  expect(after.scheduled.find((item) => item.id === proposal.id)).toMatchObject({
    scheduledStartAt: persisted.scheduledStartAt,
    version: persisted.version,
  })
  expect(after.scheduled.find((item) => item.title === "临时客户会议")).toMatchObject({
    isFixed: true,
    scheduledStartAt: "2026-09-10T02:00:00.000Z",
  })
  expect(after.conflicts.filter((conflict) => conflict.code === "OVERLAP")).toHaveLength(0)
  expect(after.unscheduled.filter((item) => item.estimatedMinutes !== null)).toHaveLength(0)
  expect(after.scheduled.filter((item) => item.title === "检查客户反馈")).toHaveLength(2)
  expect((await items(request)).filter((item) => item.id === proposal.id)).toHaveLength(1)
})

registerTaskTimeFailureTests()

import { randomUUID } from "node:crypto"
import { z } from "zod"
import { itemSchema } from "../../src/shared/items.js"
import { notificationsSchema } from "../../src/shared/reminders.js"
import { capture, expect, items, test } from "../helpers/task-time.js"

const longTitle =
  "核对客户反馈中的使用场景、复现步骤与方案证据，确保跨团队讨论中每一个长期未解决的问题都有明确负责人和可核验的截止要求"
test("renders manual task, recurrence, calendar and home states across widths and themes", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(180_000)
  // Given a populated synthetic workspace with long Chinese text and explicit time semantics.
  expect(
    (
      await request.post("/api/onboarding", {
        data: {
          workspaceName: "任务视觉验收",
          aiNickname: "Fixture",
          userName: "验收",
          timezone: "Asia/Shanghai",
        },
      })
    ).ok(),
  ).toBe(true)
  const task = itemSchema.parse(
    await (
      await request.post("/api/items", {
        data: {
          requestId: randomUUID(),
          title: longTitle,
          notes: longTitle.repeat(5),
          priority: "high",
          estimatedMinutes: 45,
          dueDate: "2026-09-11",
          today: { localDate: "2026-09-10", isFocus: false, isSecondary: false },
        },
      })
    ).json(),
  )
  // When the same task is inspected in list, detail and home, every responsive state remains reachable.
  await page.goto("/todos?view=active")
  const row = page.locator(".task-row").filter({ hasText: longTitle }).first()
  await expect(row).toBeVisible()
  await capture(page, "task-list-long-chinese")
  await row.getByRole("button", { name: "更多操作" }).hover()
  await page.screenshot({ path: ".omo/evidence/task-core/scenario/visual/task-row-hover.png" })
  await row.getByRole("button", { name: "更多操作" }).focus()
  await expect(row.getByRole("button", { name: "更多操作" })).toBeFocused()
  await page.screenshot({ path: ".omo/evidence/task-core/scenario/visual/task-row-focus.png" })
  await page.keyboard.press("Enter")
  await page.getByRole("menuitem", { name: "编辑待办" }).click()
  await expect(page.getByLabel("标题", { exact: true })).toHaveValue(longTitle)
  await page.getByText("说明、截止与安排", { exact: true }).click()
  const draftNotes = `${longTitle.repeat(3)}编辑中的补充说明`
  await page.getByRole("textbox", { name: "说明", exact: true }).fill(draftNotes)
  await capture(page, "task-editor-long-chinese")
  const second = await context.newPage()
  await second.goto("/todos?view=active")
  expect(
    (
      await second.request.patch(`/api/items/${task.id}`, {
        data: { expectedVersion: task.version, priority: "medium" },
      })
    ).ok(),
  ).toBe(true)
  await second.close()
  const conflict = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/items/${task.id}`) && response.request().method() === "PATCH",
  )
  await page.getByRole("button", { name: "保存修改", exact: true }).click()
  expect((await conflict).status()).toBe(409)
  await expect(page.getByRole("textbox", { name: "说明", exact: true })).toHaveValue(draftNotes)
  await capture(page, "task-editor-conflict-draft")
  await page.getByRole("button", { name: "取消", exact: true }).last().click()
  const afterConflict = itemSchema.parse(await (await request.get(`/api/items/${task.id}`)).json())
  expect(afterConflict.notes).toBe(longTitle.repeat(5))
  expect(afterConflict.priority).toBe("medium")
  await page.getByRole("button", { name: "创建重复任务", exact: true }).click()
  await page.getByLabel("重复任务标题").fill("工作日检查中文客户反馈")
  await page.getByLabel("截止时刻").fill("09:30")
  await page.getByLabel("提前 30 分钟", { exact: true }).check()
  await capture(page, "series-create")
  await page.getByRole("button", { name: "创建系列", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const occurrence = page.locator(".task-row").filter({ hasText: "工作日检查中文客户反馈" }).first()
  await occurrence.getByRole("button", { name: "更多操作" }).click()
  await page.getByRole("menuitem", { name: "管理重复系列" }).click()
  await capture(page, "series-manage")
  await page.getByRole("button", { name: "取消", exact: true }).click()
  await page.goto("/")
  await expect(page.locator(".workspace-home")).toBeVisible()
  await capture(page, "home-today-metadata")
  await page.goto("/calendar")
  await expect(page.getByRole("heading", { name: "日历", exact: true })).toBeVisible()
  await capture(page, "calendar-week-populated")
  await page.getByRole("button", { name: "日", exact: true }).click()
  await capture(page, "calendar-day-populated")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.getByRole("button", { name: "固定日程", exact: true }).focus()
  await expect(page.getByRole("button", { name: "固定日程", exact: true })).toBeFocused()
  await page.getByRole("button", { name: "固定日程", exact: true }).click()
  await capture(page, "calendar-meeting-editor")
  await page.getByLabel("标题", { exact: true }).focus()
  await page.keyboard.press("Shift+Tab")
  await expect(page.getByRole("button", { name: "创建固定日程", exact: true })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByLabel("标题", { exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "创建固定日程" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "固定日程", exact: true })).toBeFocused()
  await page.goto("/task-plans")
  await expect(page.getByLabel("原始记录")).toBeVisible()
  await capture(page, "capture-composer")
  expect(
    (
      await request.put("/api/ai/config", {
        data: {
          chatBaseUrl: "",
          chatModel: "",
          apiKey: "",
          transcriptionBaseUrl: "",
          transcriptionModel: "",
        },
      })
    ).ok(),
  ).toBe(true)
  await page.getByLabel("原始记录").fill("没有配置 AI 时保留的原始记录")
  await page.getByRole("button", { name: "生成可编辑预览" }).click()
  await expect(page.getByRole("alert").last()).toBeVisible()
  await capture(page, "capture-unconfigured")
  for (const item of await items(request))
    expect((await request.delete(`/api/items/${item.id}`)).ok()).toBe(true)
  await page.goto("/todos?view=active")
  await expect(page.locator(".task-row")).toHaveCount(0)
  await capture(page, "task-list-empty")
  await page.goto("/calendar")
  await expect(page.locator(".calendar-backlog article")).toHaveCount(0)
  await capture(page, "calendar-empty")
  for (const notification of notificationsSchema.parse(
    await (await request.get("/api/notifications")).json(),
  ))
    expect((await request.post(`/api/notifications/${notification.id}/dismiss`)).ok()).toBe(true)
  expect(
    (
      await request.post("/api/items", {
        data: {
          requestId: randomUUID(),
          title: "提醒响应丢失后安全重试",
          dueAt: "2026-09-10T01:30:00.000Z",
          reminders: [{ anchor: "due", offsetMinutes: 30 }],
        },
      })
    ).ok(),
  ).toBe(true)
  await page.goto("/")
  const banner = page.locator(".reminder-banner")
  await expect(banner).toContainText("提醒响应丢失后安全重试")
  await capture(page, "reminder-visible")
  const bodies: (string | null)[] = []
  await page.route("**/api/notifications/*/snooze", async (route) => {
    bodies.push(route.request().postData())
    if (bodies.length === 1) {
      const persisted = await route.fetch()
      expect(persisted.ok()).toBe(true)
      await route.abort("failed")
    } else await route.continue()
  })
  await banner.getByRole("button", { name: "30 分钟后", exact: true }).click()
  await expect(banner.getByRole("alert")).toBeVisible()
  await capture(page, "reminder-snooze-error")
  await banner.getByRole("button", { name: "30 分钟后", exact: true }).click()
  await expect(banner).toHaveCount(0)
  expect(bodies.length).toBeGreaterThanOrEqual(2)
  expect(new Set(bodies).size).toBe(1)
  z.object({ minutes: z.literal(30), requestId: z.uuid() }).parse(JSON.parse(bodies[0] ?? "null"))
  await page.unroute("**/api/notifications/*/snooze")
})

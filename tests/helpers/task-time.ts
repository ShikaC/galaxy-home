import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type APIRequestContext, test as base, expect, type Page } from "@playwright/test"
import { z } from "zod"
import { itemSchema } from "../../src/shared/items.js"
import { type TaskPlanRun, taskPlanRunSchema } from "../../src/shared/taskPlanning.js"
import { releaseFixtureResponses } from "./task-time-fixture.js"
import { assertTaskTimeLayout } from "./task-time-layout.js"
export const DATE = "2026-09-10"
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: new Date("2026-09-10T01:00:00.000Z") })
    await use(page)
  },
})
export { expect }
export async function items(request: APIRequestContext, view = "active") {
  const response = await request.get(`/api/items?view=${view}&localDate=${DATE}`)
  expect(response.ok()).toBe(true)
  return z.array(itemSchema).parse(await response.json())
}
export async function readRun(request: APIRequestContext, id: string): Promise<TaskPlanRun> {
  return taskPlanRunSchema.parse(await (await request.get(`/api/task-plans/${id}`)).json())
}
export async function waitRun(request: APIRequestContext, id: string): Promise<TaskPlanRun> {
  await expect
    .poll(async () => (await readRun(request, id)).status, { timeout: 20_000 })
    .not.toBe("planning")
  return readRun(request, id)
}
export function runId(page: Page): string {
  return z.uuid().parse(new URL(page.url()).searchParams.get("run"))
}
export async function capture(page: Page, state: string): Promise<void> {
  const directory = join(process.cwd(), ".omo/evidence/task-core/scenario/visual")
  mkdirSync(directory, { recursive: true })
  for (const theme of ["dawn", "night"] as const)
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate((theme) => {
        document.documentElement.setAttribute("data-theme", theme)
        document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light"
      }, theme)
      await page.locator(".main-scroll, [role=dialog]").evaluateAll((elements) =>
        elements.forEach((element) => {
          element.scrollTop = 0
        }),
      )
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          message: `settled ${state}-${theme}-${width}`,
        })
        .toBeLessThanOrEqual(width)
      const shape = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        overflowing: [
          ...document.querySelectorAll("main, section, article, form, dialog, input, textarea"),
        ].flatMap((element) => {
          const bounds = element.getBoundingClientRect()
          if (bounds.width === 0 || (bounds.right <= window.innerWidth + 1 && bounds.left >= -1))
            return []
          const scrollContainer = element.closest(".calendar-timeline-scroll")
          return scrollContainer
            ? []
            : [
                {
                  tag: element.tagName,
                  className: element.className,
                  left: bounds.left,
                  right: bounds.right,
                },
              ]
        }),
      }))
      const name = `${state}-${theme}-${width}`
      await assertTaskTimeLayout(page, state, name)
      writeFileSync(
        join(directory, `${name}.json`),
        JSON.stringify({ state, theme, ...shape }, null, 2),
      )
      await page.screenshot({
        path: join(directory, `${name}.png`),
        fullPage: true,
        animations: "disabled",
      })
      if (["calendar-day-populated", "calendar-week-populated"].includes(state)) {
        const timeline = page.locator(".calendar-timeline-scroll")
        const initial = await timeline.evaluate((element) => element.scrollTop)
        for (const bound of ["00", "23"] as const) {
          await timeline.evaluate((element, bound) => {
            element.scrollTop = bound === "00" ? 0 : element.scrollHeight
          }, bound)
          await timeline.screenshot({
            path: join(directory, `${name}-timeline-${bound}.png`),
            animations: "disabled",
          })
        }
        await timeline.evaluate((element, initial) => {
          element.scrollTop = initial
        }, initial)
      }
      const hasScroll = await page
        .locator(".main-scroll, [role=dialog]")
        .evaluateAll((elements) => {
          const overflowing = elements.filter(
            (element) => element.scrollHeight > element.clientHeight + 1,
          )
          overflowing.forEach((element) => {
            element.scrollTop = element.scrollHeight
          })
          return overflowing.length > 0
        })
      if (hasScroll)
        await page.screenshot({
          path: join(directory, `${name}-bottom.png`),
          animations: "disabled",
        })
      expect(shape.documentWidth, name).toBeLessThanOrEqual(width)
      expect(
        shape.overflowing.filter(({ tag }) => tag === "INPUT" || tag === "TEXTAREA"),
        name,
      ).toEqual([])
    }
  await page.setViewportSize({ width: 1440, height: 900 })
}
export function registerTaskTimeFailureTests(): void {
  test("retains an edited replan after a second browser changes a related task", async ({
    page,
    context,
    request,
  }) => {
    const candidate = itemSchema.parse(
      await (
        await request.post("/api/items", {
          data: {
            requestId: randomUUID(),
            title: "并发版本任务",
            estimatedMinutes: 60,
            scheduledStartAt: "2026-09-10T03:00:00.000Z",
            scheduledEndAt: "2026-09-10T04:00:00.000Z",
            scheduleTimezone: "Asia/Shanghai",
          },
        })
      ).json(),
    )
    const input = {
      type: "replan",
      requestId: randomUUID(),
      originalText: "fixture stale scope",
      startDate: DATE,
      endDate: "2026-09-11",
      timezone: "Asia/Shanghai",
      lockedItemIds: [],
    }
    const created = taskPlanRunSchema.parse(
      await (await request.post("/api/task-plans", { data: input })).json(),
    )
    await waitRun(request, created.id)
    await page.goto(`/task-plans?mode=replan&run=${created.id}`)
    await expect(page.getByRole("button", { name: "编辑提案" })).toBeVisible()
    await page.getByRole("button", { name: "编辑提案" }).click()
    await page.getByLabel("变更 1 原因").fill("用户保存的调整理由，在发生版本冲突时必须保留。")
    await page.getByRole("button", { name: "保存修改" }).click()
    await expect(page.getByRole("button", { name: "确认并写入" })).toBeVisible()
    const draft = await readRun(request, created.id)
    const second = await context.newPage()
    await second.goto("/todos?view=active")
    await second
      .locator(".task-row")
      .filter({ hasText: candidate.title })
      .getByRole("button", { name: "更多操作" })
      .click()
    await second.getByRole("menuitem", { name: "编辑待办" }).click()
    await second.getByLabel("标题", { exact: true }).fill("另一窗口已修改任务")
    await second.getByRole("button", { name: "保存修改", exact: true }).click()
    await expect(second.getByRole("dialog")).toHaveCount(0)
    await second.close()
    const response = page.waitForResponse((response) =>
      response.url().endsWith(`/${created.id}/confirm`),
    )
    await page.getByRole("button", { name: "确认并写入" }).click()
    const rejected = await response
    expect(rejected.status()).toBe(409)
    expect(z.object({ code: z.string() }).parse(await rejected.json()).code).toBe("TASK_PLAN_STALE")
    await expect(page.getByRole("alert").last()).toBeVisible()
    expect((await readRun(request, created.id)).proposal).toEqual(draft.proposal)
    await capture(page, "replan-conflict-retained")
  })

  test("cancels pending generation and preserves original text after provider and network failures", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const created = taskPlanRunSchema.parse(
      await (
        await request.post("/api/task-plans", {
          data: {
            type: "capture",
            requestId: randomUUID(),
            originalText: "fixture-slow 每个工作日检查反馈",
            referenceDate: DATE,
            timezone: "Asia/Shanghai",
          },
        })
      ).json(),
    )
    await page.goto(`/task-plans?run=${created.id}`)
    await expect(page.getByRole("button", { name: "取消生成" })).toBeVisible()
    await capture(page, "capture-generating")
    await page.getByRole("button", { name: "取消生成" }).click()
    releaseFixtureResponses()
    await expect(page.getByText("已取消", { exact: true }).last()).toBeVisible()
    await capture(page, "capture-cancelled")
    expect((await readRun(request, created.id)).status).toBe("cancelled")
    const failed = taskPlanRunSchema.parse(
      await (
        await request.post("/api/task-plans", {
          data: {
            type: "capture",
            requestId: randomUUID(),
            originalText: "fixture-unavailable 保留手动输入",
            referenceDate: DATE,
            timezone: "Asia/Shanghai",
          },
        })
      ).json(),
    )
    expect((await waitRun(request, failed.id)).status).toBe("failed")
    await page.goto(`/task-plans?run=${failed.id}`)
    await expect(
      page.getByText("fixture-unavailable 保留手动输入", { exact: true }).last(),
    ).toBeVisible()
    await capture(page, "capture-unavailable")
    await page.getByText("不用 AI，手动拆分记录", { exact: true }).click()
    await page.getByLabel("手动任务标题").fill("失败后手动创建仍可用")
    await page.getByRole("button", { name: "手动保存到收集箱" }).click()
    await expect(page.getByText("已保存，可继续记录下一项。", { exact: true })).toBeVisible()
    expect((await items(request)).some((item) => item.title === "失败后手动创建仍可用")).toBe(true)
    await page.goto("/task-plans")
    await page.getByLabel("原始记录").fill("断网后仍保留的中文记录")
    await page.route("**/api/task-plans", (route) =>
      route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue(),
    )
    await page.getByRole("button", { name: "生成可编辑预览" }).click()
    await expect(page.getByRole("alert").last()).toBeVisible()
    await expect(page.getByLabel("原始记录")).toHaveValue("断网后仍保留的中文记录")
    await page.unroute("**/api/task-plans")
  })
}

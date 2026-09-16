import { randomUUID } from "node:crypto"
import type { APIRequestContext, Locator, Page } from "@playwright/test"
import { z } from "zod"
import { itemDetailSchema } from "../../src/shared/items.js"
import { expect, items, test } from "../helpers/task-time.js"

// Playwright 的 dragTo 对原生 HTML5 拖放不可靠：需要显式派发带同一个
// DataTransfer 的事件序列，才等价于用户真的把卡片拖到时间轴格子上。
async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await source.dispatchEvent("dragstart", { dataTransfer })
  await target.dispatchEvent("dragover", { dataTransfer })
  await target.dispatchEvent("drop", { dataTransfer })
}

const today = "2026-09-10"
test.beforeEach(async ({ request }) => {
  for (const item of await items(request))
    expect((await request.delete(`/api/items/${item.id}`)).ok()).toBe(true)
  expect(
    (
      await request.post("/api/onboarding", {
        data: {
          workspaceName: "拖动验收",
          aiNickname: "Fixture",
          userName: "验收",
          timezone: "Asia/Shanghai",
        },
      })
    ).ok(),
  ).toBe(true)
})

async function createTask(
  request: APIRequestContext,
  title: string,
): Promise<{ readonly id: string }> {
  const created = await request.post("/api/items", {
    data: { requestId: randomUUID(), title, priority: "medium", dueDate: today },
  })
  expect(created.ok()).toBe(true)
  return z.object({ id: z.string() }).parse(await created.json())
}

test("dragging a task that has no estimate onto the timeline gives it a 30-minute block", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  const title = "从没填过耗时的拖动任务"
  const task = await createTask(request, title)
  try {
    await page.goto("/calendar")
    const source = page.locator(".calendar-backlog article").filter({ hasText: title }).first()
    await expect(source).toBeVisible()
    // 清单里就该说清楚会按默认值估算，而不是让用户以为必须去补一个数字。
    await expect(source).toContainText("耗时未填，按 30 分钟算")

    // When：把任务拖到 14:00 这一格。
    await dragOnto(
      page,
      source,
      page.getByRole("button", { name: `${today} 14:00，拖放到这里安排` }),
    )

    // Then：块落在 14:00–14:30，长度就是默认时长。
    await expect(page.getByRole("button", { name: `编辑 ${title}，14:00 至 14:30` })).toBeVisible()
    const scheduled = itemDetailSchema.parse(
      await (await request.get(`/api/items/${task.id}`)).json(),
    )
    expect(scheduled.scheduledStartAt).toBe("2026-09-10T06:00:00.000Z")
    expect(scheduled.scheduledEndAt).toBe("2026-09-10T06:30:00.000Z")
  } finally {
    await request.delete(`/api/items/${task.id}`)
  }
})

test("dragging the lower edge lengthens the block without typing a number", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  const title = "拖动边缘加长的任务"
  const task = await createTask(request, title)
  try {
    await page.goto("/calendar")
    await dragOnto(
      page,
      page.locator(".calendar-backlog article").filter({ hasText: title }).first(),
      page.getByRole("button", { name: `${today} 14:00，拖放到这里安排` }),
    )
    const event = page.getByRole("button", { name: `编辑 ${title}，14:00 至 14:30` })
    await expect(event).toBeVisible()

    // When：把下边缘往下拖 30px（时间轴 1 分钟 ≈ 1px，吸附 15 分钟）。
    const handle = page.locator(".calendar-event__resize").first()
    // 必须先 hover 再取坐标：hover 会把元素滚进视口，之前取的坐标会失效。
    await handle.hover()
    const box = await handle.boundingBox()
    if (box === null) throw new Error("Missing resize handle box")
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 6 })
    await page.mouse.up()

    // Then：块变成 14:00–15:00，并且真的写进了库。
    await expect(page.getByRole("button", { name: `编辑 ${title}，14:00 至 15:00` })).toBeVisible()
    await expect
      .poll(async () => {
        const item = itemDetailSchema.parse(
          await (await request.get(`/api/items/${task.id}`)).json(),
        )
        return item.scheduledEndAt
      })
      .toBe("2026-09-10T07:00:00.000Z")
    // 用户从未填过预计耗时，字段保持为空。
    const item = itemDetailSchema.parse(await (await request.get(`/api/items/${task.id}`)).json())
    expect(item.estimatedMinutes).toBeNull()
  } finally {
    await request.delete(`/api/items/${task.id}`)
  }
})

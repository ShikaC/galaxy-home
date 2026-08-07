import { expect, type Page, test } from "@playwright/test"

async function ensureOnboarding(page: Page) {
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
}

test.describe("reminder banner", () => {
  test("shows a missed reminder, snoozes it, then dismisses the next one", async ({
    page,
    request,
  }) => {
    await ensureOnboarding(page)
    const notifications = await request.get("/api/notifications")
    expect(notifications.ok()).toBe(true)
    const due = (await notifications.json()) as readonly { id: string; kind: string }[]
    for (const notification of due) {
      if (notification.kind !== "weekly_review") continue
      expect((await request.post(`/api/notifications/${notification.id}/dismiss`)).ok()).toBe(true)
    }
    await page.reload()
    const banner = page.locator(".reminder-banner")
    await expect(banner.getByText("今天最想推进什么？")).toBeVisible()
    await banner.getByRole("button", { name: /30 分钟后/ }).click()
    await expect(banner.getByText("今天有什么值得留下？")).toBeVisible()
    await banner.getByRole("button", { name: "今天不再提醒" }).click()
    await expect(page.locator(".reminder-banner")).toHaveCount(0)
  })
})

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

test("capture can place a note on today in one step", async ({ page }) => {
  await ensureOnboarding(page)
  const title = `今日随手记 ${Date.now().toString().slice(-6)}`
  await page.getByRole("button", { name: "随手记" }).first().click()
  await page.getByLabel("标题").fill(title)
  await page.getByRole("button", { name: "放进今天" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("article").filter({ hasText: title })).toBeVisible()
})

import { expect, type Page, test } from "../helpers/e2e.js"

async function ensureOnboarding(page: Page) {
  await page.goto("/")
  const welcome = page.getByRole("heading", { name: "布置你的工作空间" })
  const home = page.getByRole("heading", { level: 1, name: /上午好|下午好|晚上好|夜深了/ })
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
  await page.getByRole("button", { name: "随手记", exact: true }).first().click()
  await page.getByLabel("标题").fill(title)
  await page.getByRole("button", { name: "放进今天" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("article").filter({ hasText: title })).toBeVisible()
})

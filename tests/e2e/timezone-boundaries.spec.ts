import { expect, test } from "../helpers/e2e.js"

test("workspace timezone follows the browser day boundary", async ({ page }) => {
  await page.clock.setSystemTime(new Date("2026-08-05T03:59:00.000Z"))
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

  await page.getByRole("link", { name: "设置", exact: true }).click()
  await page.getByLabel("时区").selectOption("America/New_York")
  await page.getByRole("button", { name: "保存个人设置" }).click()
  await expect(page.getByText("已保存", { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "工作台", exact: true }).click()
  await expect(page.locator(".daily-heading__date")).toContainText("8月4日星期二")

  await page.clock.fastForward("02:00")
  await expect(page.locator(".daily-heading__date")).toContainText("8月5日星期三")
})

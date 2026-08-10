import { expect, test } from "@playwright/test"

test("workspace timezone follows the browser day boundary", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-05T03:59:00.000Z") })
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

  await page.getByRole("link", { name: "设置", exact: true }).click()
  await page.getByLabel("时区").selectOption("America/New_York")
  await page.getByRole("button", { name: "保存个人设置" }).click()
  await expect(page.getByText("已保存", { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "首页", exact: true }).click()
  await expect(page.getByText("8月4日星期二", { exact: true })).toBeVisible()

  await page.clock.fastForward("02:00")
  await expect(page.getByText("8月5日星期三", { exact: true })).toBeVisible()
})

import { expect, test } from "@playwright/test"

test("narrow viewport keeps the category heading visible", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 900 })
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

  await page.getByRole("link", { name: "待办", exact: true }).click()
  await expect(page.getByRole("heading", { name: "待办" })).toBeVisible()
  const categoryHeading = page.locator(".filter-nav__heading strong")
  await expect(categoryHeading).toHaveText("分类")
  await expect(categoryHeading).toBeVisible()
})

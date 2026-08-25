import { expect, test } from "@playwright/test"

test.use({ viewport: { width: 1274, height: 720 }, deviceScaleFactor: 1.5 })

test("short Chinese descriptions avoid orphan lines at 150 percent scaling", async ({ page }) => {
  await page.goto("/")
  const welcome = page.getByRole("heading", { name: "欢迎来到银河居所" })
  const home = page.getByRole("heading", { name: "今日空间" })
  await expect(welcome.or(home)).toBeVisible()
  if (await welcome.isVisible()) {
    await page.getByLabel("个人空间名称").fill("银河居所")
    await page.getByLabel("AI 助手昵称").fill("星伴")
    await page.getByLabel("AI 对你的称呼").fill("你")
    await page.getByRole("button", { name: "进入我的空间" }).click()
  }
  await expect(home).toBeVisible()
  const description = page.getByText("把正在推进的周期项目置顶后，会出现在这里。", {
    exact: true,
  })
  await expect(description).toBeVisible()

  const lineLengths = await description.evaluate((element) => {
    const text = element.firstChild
    if (!(text instanceof Text)) return []
    const lines = new Map<number, number>()
    for (let index = 0; index < text.length; index += 1) {
      const range = document.createRange()
      range.setStart(text, index)
      range.setEnd(text, index + 1)
      const top = Math.round(range.getBoundingClientRect().top)
      lines.set(top, (lines.get(top) ?? 0) + 1)
    }
    return [...lines.values()]
  })

  expect(lineLengths.length).toBeGreaterThan(1)
  expect(Math.min(...lineLengths)).toBeGreaterThanOrEqual(4)
})

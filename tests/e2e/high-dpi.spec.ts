import { expect, test } from "../helpers/e2e.js"

test.use({ viewport: { width: 1274, height: 720 }, deviceScaleFactor: 1.5 })

test("short Chinese descriptions avoid orphan lines at 150 percent scaling", async ({ page }) => {
  await page.goto("/")
  const welcome = page.getByRole("heading", { name: "布置你的工作空间" })
  const home = page.getByRole("heading", { level: 1, name: /上午好|下午好|晚上好|夜深了/ })
  await expect(welcome.or(home)).toBeVisible()
  if (await welcome.isVisible()) {
    await page.getByLabel("个人空间名称").fill("银河居所")
    await page.getByLabel("AI 助手昵称").fill("星伴")
    await page.getByLabel("AI 对你的称呼").fill("你")
    await page.getByRole("button", { name: "进入我的空间" }).click()
  }
  await expect(home).toBeVisible()
  const description = page.getByText("从一句话开始，理清思路、拆解计划，或者找到下一步。", {
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

  expect(lineLengths.length).toBeGreaterThan(0)
  expect(Math.min(...lineLengths)).toBeGreaterThanOrEqual(4)
})

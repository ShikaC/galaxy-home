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

test("capture, organize, complete, and review one real item", async ({ page }) => {
  const suffix = Date.now().toString().slice(-7)
  const itemTitle = `真实链路验收 ${suffix}`
  const categoryName = `验收分类 ${suffix}`

  await ensureOnboarding(page)
  await page.getByRole("link", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "分类与短语" }).click()
  await page.getByLabel("分类名称").fill(categoryName)
  await page.getByLabel("分类名称").press("Enter")
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "待办", exact: true }).click()
  await page.getByRole("button", { name: "随手记" }).click()
  await page.getByLabel("标题").fill(itemTitle)
  await page.getByLabel("备注（可选）").fill("从捕捉一路走到回顾")
  await page.getByRole("button", { name: "保存到收集箱" }).click()

  let item = page.getByRole("article").filter({ hasText: itemTitle })
  await expect(item).toBeVisible()
  await item.getByRole("button", { name: "更多操作" }).click()
  await item.getByRole("menuitem", { name: "整理分类与项目" }).click()
  await page.getByLabel(categoryName).check()
  await page.getByRole("button", { name: "保存整理" }).click()

  await page.getByRole("button", { name: categoryName }).click()
  item = page.getByRole("article").filter({ hasText: itemTitle })
  await expect(item).toHaveCount(1)
  const actions = item.getByRole("button", { name: "更多操作" })
  await expect(actions).toBeVisible()
  await actions.click()
  await item.getByRole("menuitem", { name: "加入今日待办" }).click()
  item = page.getByRole("article").filter({ hasText: itemTitle })
  await expect(item).toHaveCount(1)
  const updatedActions = item.getByRole("button", { name: "更多操作" })
  await expect(updatedActions).toBeVisible()
  await updatedActions.click()
  await item.getByRole("menuitem", { name: "设为今日重点" }).click()

  await page.getByRole("link", { name: "首页", exact: true }).click()
  item = page.getByRole("article").filter({ hasText: itemTitle })
  await expect(item.getByText("今日重点")).toBeVisible()
  await item.getByRole("button", { name: `完成 ${itemTitle}` }).click()

  await page.getByRole("link", { name: "回顾", exact: true }).click()
  await page.getByRole("button", { name: "本地生成" }).click()
  await expect(page.getByText(itemTitle, { exact: true })).toBeVisible()
})

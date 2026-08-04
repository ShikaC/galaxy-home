import { expect, test } from "@playwright/test"

test("manual work remains complete without an AI key", async ({ page }, testInfo) => {
  const suffix = Date.now().toString().slice(-7)
  const itemTitle = `端到端阅读清单 ${suffix}`
  const projectName = `端到端阅读节奏 ${suffix}`

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

  await page.getByRole("button", { name: "随手记" }).first().click()
  await page.getByLabel("标题").fill(itemTitle)
  await page.getByLabel("备注（可选）").fill("选择三本书并安排第一次阅读")
  await page.getByRole("button", { name: "保存到收集箱" }).click()

  await page.getByRole("link", { name: "待办", exact: true }).click()
  let item = page.getByRole("article").filter({ hasText: itemTitle })
  await expect(item).toBeVisible()
  await item.getByRole("button", { name: "更多操作" }).click()
  await item.getByRole("menuitem", { name: "加入今日待办" }).click()
  item = page.getByRole("article").filter({ hasText: itemTitle })
  await item.getByRole("button", { name: "更多操作" }).click()
  await item.getByRole("menuitem", { name: "设为今日重点" }).click()

  await page.getByRole("link", { name: "首页", exact: true }).click()
  item = page.getByRole("article").filter({ hasText: itemTitle })
  await expect(item.getByText("今日重点")).toBeVisible()
  await item.getByRole("button", { name: `完成 ${itemTitle}` }).click()
  await expect(page.getByText(/今日已完成 \d+ 项/)).toBeVisible()

  await page.getByRole("button", { name: /打开 星伴/ }).click()
  await expect(page.getByRole("heading", { name: "AI 尚未配置" })).toBeVisible()
  await expect(page.getByText("待办、习惯、项目手动推进和回顾仍可正常使用。")).toBeVisible()
  await page.getByRole("button", { name: "关闭 AI 助手" }).click()

  await page.getByRole("link", { name: "项目", exact: true }).click()
  await page.getByRole("button", { name: "新项目" }).click()
  await page.getByLabel("项目名称").fill(projectName)
  await page.getByLabel("最终希望达到的结果").fill("每周完成三次阅读并留下笔记")
  await page.getByLabel("当前阶段").fill("准备第一周")
  await page.getByLabel("当前任务").fill("选出第一本书")
  await page.getByLabel("下一任务").fill("安排第一次阅读")
  await page.getByRole("button", { name: "创建项目" }).click()
  await page.getByRole("link", { name: new RegExp(projectName) }).click()

  await page.getByLabel("实际成果（可选）").fill("已经选好书")
  await page.getByLabel("遇到的阻碍（可选）").fill("晚间容易分心")
  await page.getByLabel("新的下一任务（可选）").fill("准备阅读笔记模板")
  await page.getByRole("button", { name: "手动完成" }).click()

  await expect(page.getByText("安排第一次阅读", { exact: true })).toBeVisible()
  await expect(page.getByText("准备阅读笔记模板", { exact: true })).toBeVisible()
  await expect(page.getByText("成果：已经选好书")).toBeVisible()
  await expect(page.getByText("阻碍：晚间容易分心")).toBeVisible()
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("project-flow.png") })
})

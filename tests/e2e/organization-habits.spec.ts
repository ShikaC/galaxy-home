import { expect, test } from "@playwright/test"

test("an item stays synchronized across two categories", async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-7)
  const firstCategory = `生活 ${suffix}`
  const secondCategory = `本周 ${suffix}`
  const itemTitle = `整理衣柜 ${suffix}`
  await request.post("/api/onboarding", {
    data: {
      workspaceName: "银河居所",
      aiNickname: "星伴",
      userName: "小河",
      timezone: "Asia/Shanghai",
    },
  })

  await page.goto("/settings")
  await page.getByRole("button", { name: "分类与短语" }).click()
  await page.getByLabel("分类名称").fill(firstCategory)
  await page.getByLabel("分类名称").press("Enter")
  await expect(page.getByText(firstCategory, { exact: true })).toBeVisible()
  await page.getByLabel("分类名称").fill(secondCategory)
  await page.getByLabel("分类名称").press("Enter")
  await expect(page.getByText(secondCategory, { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "待办", exact: true }).click()
  await page.getByRole("button", { name: "随手记" }).click()
  await page.getByLabel("标题").fill(itemTitle)
  await page.getByRole("button", { name: "保存到收集箱" }).click()
  let item = page.getByRole("article").filter({ hasText: itemTitle })
  await item.getByRole("button", { name: "更多操作" }).click()
  await item.getByRole("menuitem", { name: "整理分类与项目" }).click()
  await page.getByLabel(firstCategory).check()
  await page.getByLabel(secondCategory).check()
  await page.getByRole("button", { name: "保存整理" }).click()

  await page.getByRole("button", { name: firstCategory }).click()
  item = page.getByRole("article").filter({ hasText: itemTitle })
  await expect(item).toBeVisible()
  await page.getByRole("button", { name: secondCategory }).click()
  item = page.getByRole("article").filter({ hasText: itemTitle })
  await item.getByRole("button", { name: `完成 ${itemTitle}` }).click()
  await page.getByRole("button", { name: firstCategory }).click()
  await expect(page.getByRole("article").filter({ hasText: itemTitle })).toHaveCount(0)
  await page.getByRole("button", { name: "已完成" }).click()
  await expect(page.getByRole("button", { name: `重新打开 ${itemTitle}` })).toBeVisible()
})

test("a count habit supports over-completion, undo, and corrected leave", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString().slice(-7)
  const habitName = `喝水 ${suffix}`
  await request.post("/api/onboarding", {
    data: {
      workspaceName: "银河居所",
      aiNickname: "星伴",
      userName: "小河",
      timezone: "Asia/Shanghai",
    },
  })
  await page.goto("/habits")
  await page.getByRole("button", { name: "新习惯" }).click()
  await page.getByLabel("习惯名称").fill(habitName)
  await page.getByRole("button", { name: "次数目标型" }).click()
  await page.getByLabel("每日目标次数").fill("2")
  await page.getByRole("button", { name: "创建习惯" }).click()

  const habit = page.getByRole("article").filter({ hasText: habitName })
  await habit.getByRole("button", { name: `记录 ${habitName}` }).click()
  await habit.getByRole("button", { name: `记录 ${habitName}` }).click()
  await habit.getByRole("button", { name: `记录 ${habitName}` }).click()
  await expect(habit.getByText("3/2", { exact: true })).toBeVisible()
  await habit.getByRole("button", { name: `撤销 ${habitName} 最近一次记录` }).click()
  await expect(habit.getByText("2/2", { exact: true })).toBeVisible()

  await page.getByRole("combobox").selectOption({ label: habitName })
  await page.getByLabel("完成次数").fill("0")
  await page.getByLabel("临时请假").check()
  await page.getByRole("button", { name: "保存修正" }).click()
  await expect(page.getByText("已标记为修正记录")).toBeVisible()
  await expect(page.getByRole("heading", { name: "本周趋势" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "本月趋势" })).toBeVisible()
})

import { expect, test } from "../helpers/e2e.js"

// 筛选状态统一由 URL 承载：刷新不丢、链接可分享，切换视图也不会把其它
// 筛选条件顺手抹掉。此前 priority 是本地 useState，刷新即回到「全部」。
test("priority filter lives in the URL and survives view switches", async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-7)
  const highTitle = `高优先级待办 ${suffix}`
  const lowTitle = `低优先级待办 ${suffix}`

  await request.post("/api/onboarding", {
    data: {
      workspaceName: "银河居所",
      aiNickname: "星伴",
      userName: "小河",
      timezone: "Asia/Shanghai",
    },
  })
  await request.post("/api/items", { data: { priority: "high", title: highTitle } })
  await request.post("/api/items", { data: { priority: "low", title: lowTitle } })

  // 带参数直接进入，就应该是过滤后的视图。
  await page.goto("/todos?priority=high")
  await expect(page.getByRole("article").filter({ hasText: highTitle })).toBeVisible()
  await expect(page.getByRole("article").filter({ hasText: lowTitle })).toHaveCount(0)

  // 刷新后仍保留——这一条是本地状态做不到的。
  await page.reload()
  await expect(page.getByRole("article").filter({ hasText: highTitle })).toBeVisible()
  await expect(page.getByRole("article").filter({ hasText: lowTitle })).toHaveCount(0)

  // 切换视图不应丢掉优先级筛选。
  await page.getByRole("button", { name: "全部活跃", exact: true }).click()
  await expect(page).toHaveURL(/priority=high/)
  await expect(page.getByRole("article").filter({ hasText: lowTitle })).toHaveCount(0)

  // 选回「全部」时参数被清掉，而不是留下 priority=all 这种无意义状态。
  await page.getByLabel("按优先级筛选").selectOption("all")
  await expect(page.getByRole("article").filter({ hasText: lowTitle })).toBeVisible()
  await expect(page).not.toHaveURL(/priority=/)
})

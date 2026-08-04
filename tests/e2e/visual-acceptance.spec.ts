import { expect, type Page, test } from "@playwright/test"

const onboarding = {
  workspaceName: "银河居所",
  aiNickname: "星伴",
  userName: "小河",
  timezone: "Asia/Shanghai",
} as const

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true)
}

async function ensureOnboarding(page: Page) {
  await page.goto("/")
  const welcome = page.getByRole("heading", { name: "欢迎来到银河居所" })
  const home = page.getByRole("heading", { name: "今日空间" })
  await expect(welcome.or(home)).toBeVisible()
  if (await welcome.isVisible()) {
    await page.getByLabel("个人空间名称").fill(onboarding.workspaceName)
    await page.getByLabel("AI 助手昵称").fill(onboarding.aiNickname)
    await page.getByLabel("AI 对你的称呼").fill(onboarding.userName)
    await page.getByRole("button", { name: "进入我的空间" }).click()
  }
  await expect(home).toBeVisible()
}

test("primary views remain readable with long content and rendered analytics", async ({
  page,
  request,
}, testInfo) => {
  const suffix = Date.now().toString().slice(-7)
  const longItemTitle = `长文本验收 ${suffix}：整理一份包含多个限定条件、执行顺序、复核节点与后续行动的完整清单，确保信息在紧凑桌面视口中自然换行且不会挤出内容区域`
  const longHabitName = `长习惯验收 ${suffix}：分次补充饮水并在每次专注结束后记录完成情况`

  await ensureOnboarding(page)
  const itemResponse = await request.post("/api/items", {
    data: {
      title: longItemTitle,
      notes: "这是一段用于验证卡片高度、按钮位置与中文换行的补充说明。",
      categoryIds: [],
      projectIds: [],
    },
  })
  expect(itemResponse.ok()).toBe(true)
  const habitResponse = await request.post("/api/habits", {
    data: {
      name: longHabitName,
      type: "count",
      targetCount: 8,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [],
    },
  })
  expect(habitResponse.ok()).toBe(true)

  const routes = [
    { path: "/", heading: "今日空间" },
    { path: "/todos", heading: "待办" },
    { path: "/projects", heading: "周期项目" },
    { path: "/habits", heading: "习惯" },
    { path: "/review", heading: "回顾" },
    { path: "/settings", heading: "设置" },
  ] as const
  for (const route of routes) {
    await page.goto(route.path)
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }

  await page.goto("/todos")
  const longItem = page.getByRole("article").filter({ hasText: longItemTitle })
  await expect(longItem).toBeVisible()
  const taskBodyBox = await longItem.locator(".task-row__body").boundingBox()
  const taskActionsTrigger = longItem.getByRole("button", { name: "更多操作" })
  const taskActionsBox = await taskActionsTrigger.boundingBox()
  expect(taskBodyBox?.width).toBeGreaterThan(280)
  expect(taskBodyBox).not.toBeNull()
  expect(taskActionsBox).not.toBeNull()
  if (taskBodyBox && taskActionsBox) {
    expect(taskBodyBox.x + taskBodyBox.width).toBeLessThanOrEqual(taskActionsBox.x)
  }
  for (const phrase of ["执行顺序", "复核节点", "紧凑桌面视口"]) {
    const phraseGroup = longItem.locator(".text-phrase", { hasText: phrase })
    await expect(phraseGroup).toHaveCount(1)
    await expect(phraseGroup).toHaveCSS("white-space", "nowrap")
  }
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("todos-long-content.png") })

  await taskActionsTrigger.click()
  const organizeTrigger = longItem.getByRole("menuitem", { name: "整理分类与项目" })
  await expect(organizeTrigger).toBeVisible()
  const taskMenuBox = await longItem.getByRole("menu", { name: "待办操作" }).boundingBox()
  const expandedTaskBodyBox = await longItem.locator(".task-row__body").boundingBox()
  expect(taskMenuBox).not.toBeNull()
  expect(expandedTaskBodyBox).not.toBeNull()
  if (taskMenuBox && expandedTaskBodyBox) {
    expect(taskMenuBox.y).toBeGreaterThanOrEqual(expandedTaskBodyBox.y + expandedTaskBodyBox.height)
  }
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("task-actions-menu.png") })
  await organizeTrigger.click()
  const organizeDialog = page.getByRole("dialog", { name: "决定它接下来去哪里" })
  await expect(organizeDialog).toBeVisible()
  await expect(page.locator("main.main-scroll")).toHaveAttribute("inert", "")
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("organize-dialog.png") })
  await page.keyboard.press("Escape")
  await expect(organizeTrigger).toBeFocused()

  await page.goto("/habits")
  await expect(page.getByRole("article").filter({ hasText: longHabitName })).toBeVisible()
  await expect(page.locator("svg.recharts-surface")).toHaveCount(2)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("habits-analytics.png") })

  await page.goto("/review")
  await expect(page.getByRole("heading", { name: "每日收获" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "每周回顾" })).toBeVisible()
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("review.png") })

  await page.goto("/settings")
  await page.getByRole("button", { name: "数据与回收站" }).click()
  await expect(page.getByRole("heading", { name: "本地数据" })).toBeVisible()
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("settings-data.png") })
})

test("drawers and dialogs trap focus, disable the background, and restore focus", async ({
  page,
}, testInfo) => {
  await ensureOnboarding(page)

  const captureTrigger = page.getByRole("button", { name: "随手记" }).first()
  await captureTrigger.click()
  const captureDialog = page.getByRole("dialog", { name: "先把这件事放下来" })
  await expect(captureDialog).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null))
    .toBe(true)
  await expect(page.locator("main.main-scroll")).toHaveAttribute("inert", "")
  expect((await captureDialog.boundingBox())?.width).toBeLessThan(561)
  await page.getByRole("button", { name: "关闭随手记" }).focus()
  await page.keyboard.press("Shift+Tab")
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null))
    .toBe(true)
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("capture-dialog.png") })
  await page.keyboard.press("Escape")
  await expect(captureTrigger).toBeFocused()

  const drawerTrigger = page.getByRole("button", { name: "打开 星伴" })
  await drawerTrigger.click()
  const drawer = page.getByRole("dialog", { name: "星伴 AI 助手" })
  await expect(drawer).toBeVisible()
  await expect(page.locator("main.main-scroll")).toHaveAttribute("inert", "")
  expect((await drawer.boundingBox())?.width).toBeLessThan(361)
  await expect(page.getByRole("heading", { name: "AI 尚未配置" })).toBeVisible()
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("ai-drawer.png") })
  await page.keyboard.press("Escape")
  await expect(drawerTrigger).toBeFocused()

  await page.goto("/design-system")
  await expect(page.getByText("保存失败，请重试")).toBeVisible()
  await expect(page.locator(".skeleton")).toHaveCount(1)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("design-system.png") })

  const dialogTrigger = page.getByRole("button", { name: "打开对话框" })
  await dialogTrigger.click()
  const showcaseDialog = page.getByRole("dialog", { name: "确认这项更改" })
  await expect(showcaseDialog).toBeVisible()
  await expect(page.locator("#root")).toHaveAttribute("inert", "")
  expect((await showcaseDialog.boundingBox())?.width).toBeLessThan(561)
  await page.keyboard.press("Escape")
  await expect(dialogTrigger).toBeFocused()

  const showcaseDrawerTrigger = page.getByRole("button", { name: "打开抽屉" })
  await showcaseDrawerTrigger.click()
  const showcaseDrawer = page.getByRole("dialog", { name: "示例 AI 抽屉" })
  await expect(showcaseDrawer).toBeVisible()
  expect((await showcaseDrawer.boundingBox())?.width).toBeLessThan(361)
  await page.keyboard.press("Escape")
  await expect(showcaseDrawerTrigger).toBeFocused()
})

import { z } from "zod"
import { type APIRequestContext, E2E_LOCAL_DATE, expect, type Page, test } from "../helpers/e2e.js"

async function removeItemsByTitle(request: APIRequestContext, title: string): Promise<void> {
  const response = await request.get(`/api/items?view=inbox&localDate=${E2E_LOCAL_DATE}`)
  if (!response.ok()) return
  const items = z
    .array(z.object({ id: z.string(), title: z.string() }))
    .parse(await response.json())
  for (const item of items.filter((entry) => entry.title === title))
    await request.delete(`/api/items/${item.id}`)
}

async function enterWorkspace(page: Page): Promise<void> {
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
  await expect(home).toBeVisible()
}

test("快速记录直接进入收集箱", async ({ page, request }) => {
  await enterWorkspace(page)
  const title = `快速记录-${Date.now().toString().slice(-7)}`
  try {
    await page.getByLabel("快速记下一件事").fill(title)
    await page.getByLabel("保存快速记录").click()
    await expect(page.getByText("已放入收集箱")).toBeVisible()
    await expect(page.getByLabel("快速记下一件事")).toHaveValue("")

    await page.getByRole("link", { name: "任务", exact: true }).click()
    await expect(page.getByRole("article").filter({ hasText: title })).toBeVisible()
  } finally {
    // 本文件先于 workspace.spec.ts 运行，遗留任务会挤掉首页收集箱的前七项。
    await removeItemsByTitle(request, title)
  }
})

test("搜索可以直达任务详情", async ({ page, request }) => {
  await enterWorkspace(page)
  const title = `搜索直达-${Date.now().toString().slice(-7)}`
  const created = await request.post("/api/items", { data: { title } })
  expect(created.ok()).toBe(true)
  const item = await created.json()
  try {
    await page.getByRole("button", { name: "全局搜索" }).first().click()
    const input = page.getByRole("textbox", { name: "搜索空间" })
    await input.fill(title)
    await page.locator(".search-result").filter({ hasText: title }).first().click()

    await expect(page).toHaveURL(new RegExp(`item=${item.id}`))
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("标题", { exact: true })).toHaveValue(title)

    await page.keyboard.press("Escape")
    await expect(page).not.toHaveURL(/item=/)
  } finally {
    await removeItemsByTitle(request, title)
  }
})

test("待办视图在刷新与历史返回后保持", async ({ page }) => {
  await enterWorkspace(page)
  await page.getByRole("link", { name: "任务", exact: true }).click()
  await page.getByRole("button", { name: "已完成", exact: true }).click()
  await expect(page).toHaveURL(/view=completed/)
  await expect(page.getByRole("heading", { level: 2, name: "已完成", exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole("heading", { level: 2, name: "已完成", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "全部活跃", exact: true }).click()
  await expect(page).toHaveURL(/view=active/)
  // 等视图切换写回界面再返回，对应用户看到结果后再点浏览器返回。
  await expect(page.getByRole("heading", { level: 2, name: "全部活跃", exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/view=completed/)
  await expect(page.getByRole("heading", { level: 2, name: "已完成", exact: true })).toBeVisible()
})

test("任务查询失败后可以重新加载", async ({ page }) => {
  await enterWorkspace(page)
  await page.route("**/api/items?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "UNAVAILABLE", message: "测试服务暂时不可用" }),
    }),
  )
  await page.getByRole("link", { name: "任务", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("测试服务暂时不可用")

  await page.unroute("**/api/items?**")
  await page.getByRole("button", { name: "重新加载" }).click()
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("移动端路由与 AI 保持可用宽度", async ({ page }) => {
  await enterWorkspace(page)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ["/", "/todos", "/calendar", "/projects", "/habits", "/review"]) {
    await page.goto(path)
    await expect(page.locator("main h1")).toBeVisible()
    await expect
      .poll(() =>
        page
          .locator(".main-scroll")
          .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      )
      .toBe(true)
    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible()
  }

  await page.goto("/")
  await page.getByRole("button", { name: "打开 AI 助手", exact: true }).click()
  const drawer = page.locator(".ai-drawer")
  await expect(drawer).toBeVisible()
  const drawerWidth = (await drawer.boundingBox())?.width ?? 0
  expect(drawerWidth).toBeGreaterThan(380)
  await page.keyboard.press("Escape")
  await expect(drawer).not.toBeVisible()
})

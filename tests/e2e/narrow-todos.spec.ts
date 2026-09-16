import { expect, test } from "../helpers/e2e.js"

test("narrow viewport keeps the category heading visible", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 900 })
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

  await page.getByRole("link", { name: "任务", exact: true }).click()
  await expect(page.getByRole("heading", { name: "待办" })).toBeVisible()
  const categoryHeading = page.locator(".filter-nav__heading strong")
  await expect(categoryHeading).toHaveText("分类")
  await expect(categoryHeading).toBeVisible()
})

test("tablet viewport keeps route content inside the main surface", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 720 })
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
  expect(
    await page
      .locator(".workspace-grid")
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
  ).toBe(1)

  const routes = [
    { path: "/", heading: /上午好|下午好|晚上好|夜深了/ },
    { path: "/task-plans", heading: "AI 任务规划" },
    { path: "/notes", heading: "知识笔记" },
    { path: "/projects", heading: "项目空间" },
    { path: "/todos", heading: "待办" },
    { path: "/habits", heading: "习惯" },
    { path: "/review", heading: "回顾" },
    { path: "/settings", heading: "设置" },
  ] as const
  for (const route of routes) {
    await page.goto(route.path)
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible()
    const overflow = await page.locator(".main-scroll").evaluate((main) => {
      const boundary = main.getBoundingClientRect()
      return [...main.querySelectorAll(".page *")]
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            className: element.className,
            id: element.id,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            width: rect.width,
          }
        })
        .filter(
          ({ height, id, left, right, width }) =>
            !id.startsWith("DndLiveRegion-") &&
            (width > 0 || height > 0) &&
            (left < boundary.left - 1 || right > boundary.right + 1),
        )
    })
    expect(overflow, `${route.path} contains clipped descendants`).toEqual([])
  }

  await page.goto("/settings")
  expect(
    await page
      .locator(".settings-layout")
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
  ).toBe(1)
})

import AxeBuilder from "@axe-core/playwright"
import { type APIRequestContext, expect, type Locator, type Page, test } from "../helpers/e2e.js"

// 无障碍门禁：把 axe 接到真实渲染的页面上，避免只靠人工审查导致回归。
// 只跑 WCAG 2.0/2.1/2.2 的 A 与 AA 规则；axe 的 best-practice 规则不在此列，
// 它们不属于合规口径，放进来会让门禁变成风格争论。
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]
const THEME_STORAGE_KEY = "galaxy:theme"

const onboarding = {
  workspaceName: "银河居所",
  aiNickname: "星伴",
  userName: "小河",
  timezone: "Asia/Shanghai",
} as const

type Surface = {
  readonly name: string
  readonly path: string
}

const SURFACES: readonly Surface[] = [
  { name: "首页", path: "/" },
  { name: "待办", path: "/todos" },
  { name: "日历", path: "/calendar" },
  { name: "任务规划", path: "/task-plans" },
  { name: "笔记", path: "/notes" },
  { name: "项目", path: "/projects" },
  { name: "习惯", path: "/habits" },
  { name: "回顾", path: "/review" },
  { name: "设置", path: "/settings" },
]

const THEMES = [
  { label: "拂晓", value: "dawn" },
  { label: "夜间", value: "night" },
] as const

type Analysis = Awaited<ReturnType<AxeBuilder["analyze"]>>

const heading = (page: Page): Locator => page.locator("h1").first()

function report(violations: Analysis["violations"]): string {
  return violations
    .map((violation) => {
      const shown = violation.nodes.slice(0, 3).map((node) => {
        const summary = (node.failureSummary ?? "").split("\n").filter(Boolean).join("\n          ")
        return `      ${node.target.join(" ")}\n          ${summary}`
      })
      const more =
        violation.nodes.length > 3 ? `\n      …另有 ${violation.nodes.length - 3} 处` : ""
      return [
        `  [${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}`,
        `    ${violation.helpUrl}`,
        ...shown,
      ]
        .join("\n")
        .concat(more)
    })
    .join("\n\n")
}

async function expectNoViolations(page: Page, context: string, scope?: string) {
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS)
  const results = await (scope === undefined ? builder : builder.include(scope)).analyze()
  if (results.violations.length > 0)
    throw new Error(
      `${context} 存在 ${results.violations.length} 类无障碍违规：\n\n${report(results.violations)}\n`,
    )
  return results
}

/** 走真实 API 建一份有内容的工作区：空列表和有内容的列表是两套 UI，都要扫。 */
async function seedWorkspace(request: APIRequestContext) {
  await request.post("/api/onboarding", { data: onboarding })
  await request.post("/api/items", {
    data: { title: "整理季度复盘材料", priority: "high", estimatedMinutes: 45 },
  })
  await request.post("/api/items", { data: { title: "回复客户反馈", notes: "先看上周的三条投诉" } })
  await request.post("/api/projects", {
    data: {
      name: "把回顾流程定下来",
      desiredOutcome: "每周五能直接产出可用的周回顾",
      stageTitle: "梳理现有材料",
      currentTask: "导出最近四周的记录",
    },
  })
  await request.post("/api/habits", {
    data: {
      name: "读书 20 分钟",
      type: "check",
      targetCount: 1,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [],
    },
  })
  await request.post("/api/notes", {
    data: { title: "本周想法", content: "把重复出现的判断沉淀成清单。", pinned: true },
  })
}

// 同一 worker 里只种一次；两个 viewport 项目各自持有独立数据目录，互不影响。
let seeded = false
async function ensureSeeded(request: APIRequestContext) {
  if (seeded) return
  await seedWorkspace(request)
  seeded = true
}

/** 让页面以指定主题启动：主题存在 localStorage，首屏内联脚本会据此设置 data-theme。 */
async function startWithTheme(page: Page, theme: string) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string)
    },
    [THEME_STORAGE_KEY, theme] as const,
  )
}

for (const theme of THEMES) {
  test(`${theme.label}主题下九个主页面没有 WCAG A/AA 违规`, async ({ page, request }) => {
    await ensureSeeded(request)
    await startWithTheme(page, theme.value)
    for (const surface of SURFACES) {
      await page.goto(surface.path)
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.value)
      await expect(heading(page)).toBeVisible()
      await expectNoViolations(page, `${theme.label}主题 · ${surface.name}（${surface.path}）`)
    }
  })
}

test("随手记弹窗与 AI 面板在两种主题下都没有 WCAG A/AA 违规", async ({ page, request }) => {
  await ensureSeeded(request)
  for (const theme of THEMES) {
    await startWithTheme(page, theme.value)
    await page.goto("/todos")
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.value)
    await expect(heading(page)).toBeVisible()

    // 用快捷键而不是工具栏按钮：按钮在不同宽度下取舍不同，快捷键两边都在。
    await page.keyboard.press("ControlOrMeta+k")
    await expect(page.getByRole("dialog").first()).toBeVisible()
    await expectNoViolations(page, `${theme.label}主题 · 随手记弹窗`, "[role=dialog]")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)

    await page.keyboard.press("ControlOrMeta+j")
    await expect(page.getByRole("complementary", { name: /AI 助手/ }).first()).toBeVisible()
    await expectNoViolations(page, `${theme.label}主题 · AI 面板`, "aside[aria-label$='AI 助手']")
    await page.keyboard.press("Escape")
  }
})

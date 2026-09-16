export const PALETTE_COMMANDS = [
  {
    id: "plans",
    hint: "从知识到行动",
    keywords: ["计划", "规划", "plan", "agent"],
    kind: "navigate",
    label: "从笔记做计划",
    path: "/task-plans?mode=plan",
  },
  {
    id: "notes",
    hint: "知识",
    keywords: ["笔记", "知识", "notes"],
    kind: "navigate",
    label: "打开知识笔记",
    path: "/notes",
  },
  {
    id: "capture",
    hint: "⌘N",
    keywords: ["记", "随手", "捕捉", "inbox", "capture"],
    kind: "capture",
    label: "记下随手记",
  },
  {
    id: "todos",
    hint: "收集箱",
    keywords: ["待办", "todos", "收集"],
    kind: "navigate",
    label: "打开待办",
    path: "/todos",
  },
  {
    id: "projects",
    hint: "周期",
    keywords: ["项目", "projects"],
    kind: "navigate",
    label: "打开项目",
    path: "/projects",
  },
  {
    id: "habits",
    hint: "打卡",
    keywords: ["习惯", "habits"],
    kind: "navigate",
    label: "打开习惯",
    path: "/habits",
  },
  {
    id: "review",
    hint: "回顾",
    keywords: ["回顾", "收获", "review"],
    kind: "navigate",
    label: "打开回顾",
    path: "/review",
  },
  {
    id: "settings",
    hint: "设置",
    keywords: ["设置", "settings", "主题"],
    kind: "navigate",
    label: "打开设置",
    path: "/settings",
  },
  {
    id: "ai",
    hint: "侧栏",
    keywords: ["ai", "助手", "星伴", "对话"],
    kind: "ai",
    label: "打开 AI 助手",
  },
  {
    id: "theme",
    hint: "外观",
    keywords: ["主题", "夜间", "拂晓", "theme", "dark", "light"],
    kind: "theme",
    label: "切换夜间 / 拂晓",
  },
] as const

export type PaletteCommand = (typeof PALETTE_COMMANDS)[number]
export type PaletteCommandKind = PaletteCommand["kind"]

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function matchingCommands(query: string): readonly PaletteCommand[] {
  const needle = normalize(query)
  if (needle === "") return PALETTE_COMMANDS
  return PALETTE_COMMANDS.filter((command) => {
    if (normalize(command.label).includes(needle)) return true
    return command.keywords.some((keyword) => keyword.includes(needle) || needle.includes(keyword))
  })
}

// 首页问候语的唯一实现。标题文案同时被 E2E 断言，改动前先看
// tests/e2e 里的 `/上午好|下午好|晚上好|夜深了/` 匹配。
const DAY_START_HOUR = 6
const AFTERNOON_START_HOUR = 12
const EVENING_START_HOUR = 18

const DEFAULT_USER_NAME = "你"
const NO_NAME_SUFFIX = "欢迎回到你的空间"

export function hourInTimeZone(now: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now)
  return Number.parseInt(formatted, 10)
}

export function greetingForHour(hour: number): string {
  if (hour < 0 || hour > 23) throw new RangeError("hour must be 0-23")
  if (hour < DAY_START_HOUR) return "夜深了"
  if (hour < AFTERNOON_START_HOUR) return "上午好"
  if (hour < EVENING_START_HOUR) return "下午好"
  return "晚上好"
}

export function greetingLine(greeting: string, userName: string | undefined): string {
  const name = userName?.trim() ?? ""
  if (name === "" || name === DEFAULT_USER_NAME) return `${greeting}，${NO_NAME_SUFFIX}`
  return `${greeting}，${name}`
}

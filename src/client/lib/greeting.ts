export function greetingForHour(hour: number): string {
  if (hour < 0 || hour > 23) throw new RangeError("hour must be 0-23")
  if (hour < 5) return "夜深了"
  if (hour < 11) return "早上好"
  if (hour < 13) return "中午好"
  if (hour < 18) return "下午好"
  return "晚上好"
}

export function formatSkyGreeting(phrase: string, userName: string): string {
  const name = userName.trim()
  if (name === "" || name === "你") return phrase
  return `${phrase}，${name}`
}

export function hourInTimeZone(now: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now)
  return Number.parseInt(formatted, 10)
}

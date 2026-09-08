export const MORNING_FOCUS_CLAUSE = "或保留一个足够小的今日重点。" as const

export type MorningReminderSituation = {
  readonly completedTodayCount: number
  readonly focusTitle: string | null
  readonly inboxCount: number
  readonly primaryCount: number
}

export function morningReminderCopy(situation: MorningReminderSituation): {
  readonly detail: string
  readonly title: string
} {
  if (situation.focusTitle !== null) {
    return {
      title: "今日重点已就位",
      detail: `专注推进「${situation.focusTitle}」即可，不必再另找一件。`,
    }
  }
  if (situation.primaryCount > 0) {
    return {
      title: "今天的主要待办已安排",
      detail: "从首页挑一件推进即可；想换重点时可在待办里重新设置。",
    }
  }
  if (situation.completedTodayCount > 0) {
    return {
      title: "今天已经推进过了",
      detail:
        situation.inboxCount > 0
          ? "想再做一件可以从收集箱挑，也可以先停在这里。"
          : "想再做一件就随手记下，也可以先停在这里。",
    }
  }
  if (situation.inboxCount === 0) {
    return {
      title: "今天最想推进什么？",
      detail: `记下此刻想到的一件事，${MORNING_FOCUS_CLAUSE}`,
    }
  }
  return {
    title: "今天最想推进什么？",
    detail: `从收集箱选择一件，${MORNING_FOCUS_CLAUSE}`,
  }
}

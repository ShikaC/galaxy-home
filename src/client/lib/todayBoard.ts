export function todayEmptyCopy(input: {
  readonly completedCount: number
  readonly secondaryCount: number
}): {
  readonly description: string
  readonly title: string
} {
  if (input.completedCount > 0) {
    return {
      title: "今天的主要待办已经做完",
      description: "想再做一件可以从收集箱挑，也可以先停在这里。",
    }
  }
  if (input.secondaryCount === 0) {
    return {
      title: "今天还很轻",
      description: "空间还是空的。记下此刻想到的一件事。",
    }
  }
  return {
    title: "今天还很轻",
    description: "从收集箱挑一件，或记下下一步。",
  }
}

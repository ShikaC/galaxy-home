export function awaitingNextStage(project: {
  readonly currentTask: object | null
  readonly nextTask: object | null
}): boolean {
  return project.currentTask === null && project.nextTask === null
}

export function pinnedProjectCue(project: {
  readonly currentTask: { readonly title: string } | null
  readonly nextTask: object | null
}): string {
  if (project.currentTask !== null) return project.currentTask.title
  if (awaitingNextStage(project)) return "开始下一阶段"
  return "等待设置当前任务"
}

export function completedStageTaskSummary(count: number): string | null {
  if (count <= 3) return null
  return `${count} 项已完成任务`
}

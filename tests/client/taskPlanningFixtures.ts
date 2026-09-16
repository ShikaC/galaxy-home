import type { TaskPlanRun } from "../../src/shared/taskPlanning.js"

export const captureRun: TaskPlanRun = {
  id: crypto.randomUUID(),
  promptVersion: "task-plan-v1",
  input: {
    requestId: crypto.randomUUID(),
    type: "capture",
    originalText: "每个工作日检查客户反馈，周五提交方案。",
    referenceDate: "2026-09-10",
    timezone: "Asia/Shanghai",
  },
  status: "awaiting_confirmation",
  draftRevision: 2,
  baseSnapshot: null,
  proposal: {
    kind: "capture",
    tasks: [
      {
        draftId: crypto.randomUUID(),
        title: "周五提交方案",
        notes: null,
        priority: "high",
        dueDate: "2026-09-11",
        estimatedMinutes: 60,
      },
    ],
    series: [],
    ambiguities: [],
  },
  attempts: [],
  sources: [],
  existingItems: [],
  results: [],
  error: null,
  createdAt: "2026-09-10T01:00:00.000Z",
  updatedAt: "2026-09-10T01:00:00.000Z",
  executionMs: null,
}

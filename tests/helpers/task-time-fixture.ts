import { randomUUID } from "node:crypto"
import { createServer, type Server } from "node:http"
import { z } from "zod"
import { calendarSnapshotSchema } from "../../src/shared/calendar.js"
import {
  taskPlanInputSchema,
  taskPlanInputText,
  taskPlanProposalSchema,
} from "../../src/shared/taskPlanning.js"

const requestSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
})
const contextSchema = z.object({
  input: taskPlanInputSchema,
  calendar: calendarSnapshotSchema.nullable(),
})
const pending = new Set<() => void>()
export function releaseFixtureResponses(): void {
  for (const resolve of pending) resolve()
  pending.clear()
}
export async function startFixture(): Promise<{ readonly server: Server; readonly port: number }> {
  const server = createServer(async (request, response) => {
    let body = ""
    for await (const chunk of request) body += chunk
    const messages = requestSchema.safeParse(JSON.parse(body))
    const user = messages.success
      ? messages.data.messages.find((message) => message.role === "user")
      : undefined
    let value: unknown = null
    try {
      value = JSON.parse(user?.content ?? "null")
    } catch {
      value = null
    }
    const parsed = contextSchema.safeParse(value)
    if (!parsed.success) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ choices: [{ message: { content: "{}" } }] }))
      return
    }
    const { input, calendar } = parsed.data
    if (taskPlanInputText(input).includes("fixture-unavailable")) {
      response.writeHead(503)
      response.end("fixture unavailable")
      return
    }
    if (taskPlanInputText(input).includes("fixture-slow"))
      await new Promise<void>((resolve) => pending.add(resolve))
    const proposal =
      input.type === "capture"
        ? {
            kind: "capture",
            tasks: [
              {
                draftId: randomUUID(),
                title: "周五提交方案",
                notes: null,
                priority: "high",
                dueDate: "2026-09-11",
                estimatedMinutes: 60,
              },
            ],
            series: [
              {
                draftId: randomUUID(),
                title: "检查客户反馈",
                notes: null,
                priority: "medium",
                timezone: input.timezone,
                startDate: input.referenceDate,
                rule: {
                  frequency: "weekly",
                  interval: 1,
                  weekdays: [1, 2, 3, 4, 5],
                  untilDate: null,
                },
                estimatedMinutes: 15,
                dueTime: "09:30",
              },
            ],
            ambiguities: [],
          }
        : {
            kind: "replan",
            changes: (calendar?.items ?? [])
              .filter((item) => item.scheduledStartAt !== null || item.estimatedMinutes !== null)
              .map((item) => {
                // 收窄在闭包内不保持，先取出重排专属字段。
                const lockedItemIds = input.type === "replan" ? input.lockedItemIds : []
                const before =
                  item.scheduledStartAt === null ||
                  item.scheduledEndAt === null ||
                  item.scheduleTimezone === null
                    ? null
                    : {
                        startAt: item.scheduledStartAt,
                        endAt: item.scheduledEndAt,
                        timezone: item.scheduleTimezone,
                      }
                if (
                  item.isFixed ||
                  item.status !== "active" ||
                  lockedItemIds.includes(item.id) ||
                  (taskPlanInputText(input).includes("fixture stale scope") &&
                    item.title !== "并发版本任务")
                )
                  return {
                    action: "keep",
                    itemId: item.id,
                    before,
                    after: before,
                    reason: "固定会议或已完成工作保持原安排。",
                  }
                const date = item.recurrenceDate ?? "2026-09-10"
                const startAt =
                  item.recurrenceDate != null
                    ? `${date}T01:00:00.000Z`
                    : item.title === "整理客户意见并核对证据"
                      ? "2026-09-10T05:00:00.000Z"
                      : "2026-09-10T06:00:00.000Z"
                const endAt = new Date(
                  Date.parse(startAt) + (item.estimatedMinutes ?? 60) * 60_000,
                ).toISOString()
                return {
                  action: "move",
                  itemId: item.id,
                  expectedVersion: item.version,
                  before,
                  after: {
                    startAt,
                    endAt,
                    // 收窄在闭包内不保持；此分支本就只在 replan 输入下生成。
                    timezone: input.type === "replan" ? input.timezone : "UTC",
                  },
                  reason: "原时段与临时会议重叠；下午有连续六十分钟空闲并早于周五截止。",
                }
              }),
            unresolvedConflicts: [],
          }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(taskPlanProposalSchema.parse(proposal)) } }],
        usage: { prompt_tokens: 400, completion_tokens: 200 },
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string")
    throw new Error("Fixture did not acquire port")
  return { server, port: address.port }
}

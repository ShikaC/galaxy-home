import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ScheduleChange, WorkWindowRule } from "../../shared/calendar.js"
import { itemSchema } from "../../shared/items.js"
import { apiRequest, jsonBody } from "./api.js"

type CalendarRange = {
  readonly startDate: string
  readonly endDate: string
  readonly timezone: string
  readonly workWindow: readonly WorkWindowRule[]
}

async function invalidateCalendarData(client: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["calendar"] }),
    client.invalidateQueries({ queryKey: ["items"] }),
  ])
}

export function useCalendarActions(range: CalendarRange) {
  const client = useQueryClient()
  const scheduleItem = useMutation({
    mutationFn: (change: ScheduleChange) =>
      apiRequest("/api/calendar/schedule", itemSchema, {
        method: "POST",
        body: jsonBody({ ...range, changes: [change] }),
      }),
    onSuccess: () => invalidateCalendarData(client),
  })
  const createFixedMeeting = useMutation({
    mutationFn: (input: {
      readonly requestId: string
      readonly title: string
      readonly scheduledStartAt: string
      readonly scheduledEndAt: string
    }) =>
      apiRequest("/api/items", itemSchema, {
        method: "POST",
        body: jsonBody({
          requestId: input.requestId,
          title: input.title,
          categoryIds: [],
          projectIds: [],
          scheduledStartAt: input.scheduledStartAt,
          scheduledEndAt: input.scheduledEndAt,
          scheduleTimezone: range.timezone,
          isFixed: true,
        }),
      }),
    onSuccess: () => invalidateCalendarData(client),
  })
  return { scheduleItem, createFixedMeeting }
}

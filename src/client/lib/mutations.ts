import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Item } from "../../shared/items.js"
import { useAppTime } from "../components/AppContext.js"
import { apiRequest, apiVoid, jsonBody } from "./api.js"
import { itemSchema } from "./schemas.js"

type ItemStatusChange = Readonly<{
  readonly id: string
  readonly expectedVersion: number
  readonly status: "active" | "completed" | "archived"
}>

const TASK_QUERY_PREFIXES = [
  ["items"],
  ["item-detail"],
  ["calendar"],
  ["task-series"],
  ["projects"],
] as const

export async function invalidateTaskQueries(client: QueryClient): Promise<void> {
  await Promise.all(TASK_QUERY_PREFIXES.map((queryKey) => client.invalidateQueries({ queryKey })))
}

export function useItemStatusMutation(
  onStatusChanged?: (item: Item, change: ItemStatusChange) => void,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion, status }: ItemStatusChange) =>
      apiRequest(`/api/items/${id}`, itemSchema, {
        method: "PATCH",
        body: jsonBody({ expectedVersion, status }),
      }),
    onSuccess: (item, change) => {
      onStatusChanged?.(item, change)
      return invalidateTaskQueries(client)
    },
  })
}

export function useTodayMutation() {
  const client = useQueryClient()
  const { today } = useAppTime()
  return useMutation({
    mutationFn: ({
      id,
      expectedVersion,
      focus,
      secondary = false,
    }: {
      readonly id: string
      readonly expectedVersion: number
      readonly focus: boolean
      readonly secondary?: boolean
    }) =>
      apiVoid(`/api/items/${id}/today`, {
        method: "PUT",
        body: jsonBody({
          localDate: today,
          expectedVersion,
          isFocus: focus,
          isSecondary: secondary,
        }),
      }),
    onSuccess: () => invalidateTaskQueries(client),
  })
}

export function useHabitMutation(action: "record" | "undo") {
  const client = useQueryClient()
  const { today } = useAppTime()
  return useMutation({
    mutationFn: (id: string) =>
      apiVoid(`/api/habits/${id}/${action}`, {
        method: "POST",
        body: jsonBody({ localDate: today }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["habits"] })
      void client.invalidateQueries({ queryKey: ["habit-day"] })
      void client.invalidateQueries({ queryKey: ["habit-summaries"] })
    },
  })
}

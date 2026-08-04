import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAppTime } from "../components/AppContext.js"
import { apiRequest, apiVoid, jsonBody } from "./api.js"
import { itemSchema } from "./schemas.js"

export function useItemStatusMutation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      readonly id: string
      readonly status: "active" | "completed" | "archived"
    }) =>
      apiRequest(`/api/items/${id}`, itemSchema, { method: "PATCH", body: jsonBody({ status }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["items"] }),
  })
}

export function useTodayMutation() {
  const client = useQueryClient()
  const { today } = useAppTime()
  return useMutation({
    mutationFn: ({
      id,
      focus,
      secondary = false,
    }: {
      readonly id: string
      readonly focus: boolean
      readonly secondary?: boolean
    }) =>
      apiVoid(`/api/items/${id}/today`, {
        method: "PUT",
        body: jsonBody({ localDate: today, isFocus: focus, isSecondary: secondary }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["items"] }),
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
      void client.invalidateQueries({ queryKey: ["habit-summaries"] })
    },
  })
}

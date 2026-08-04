import { useQuery } from "@tanstack/react-query"
import { apiRequest, localDate } from "./api.js"
import {
  gainsSchema,
  habitsSchema,
  itemsSchema,
  metaSchema,
  projectsSchema,
  quoteSchema,
  reviewsSchema,
} from "./schemas.js"

export const queryKeys = {
  meta: ["meta"] as const,
  items: (view: string) => ["items", view, localDate()] as const,
  habits: ["habits", localDate()] as const,
  projects: ["projects"] as const,
  gains: ["gains"] as const,
  reviews: ["reviews"] as const,
  quote: ["quote", localDate()] as const,
}

export function useMeta() {
  return useQuery({ queryKey: queryKeys.meta, queryFn: () => apiRequest("/api/meta", metaSchema) })
}
export function useItems(view: "active" | "inbox" | "today" | "completed" | "archived") {
  return useQuery({
    queryKey: queryKeys.items(view),
    queryFn: () => apiRequest(`/api/items?view=${view}&localDate=${localDate()}`, itemsSchema),
  })
}
export function useHabits() {
  return useQuery({
    queryKey: queryKeys.habits,
    queryFn: () => apiRequest(`/api/habits?localDate=${localDate()}`, habitsSchema),
  })
}
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => apiRequest("/api/projects", projectsSchema),
  })
}
export function useGains(date?: string) {
  return useQuery({
    queryKey: [...queryKeys.gains, date],
    queryFn: () =>
      apiRequest(`/api/gains${date === undefined ? "" : `?localDate=${date}`}`, gainsSchema),
  })
}
export function useReviews() {
  return useQuery({
    queryKey: queryKeys.reviews,
    queryFn: () => apiRequest("/api/reviews", reviewsSchema),
  })
}
export function useQuote() {
  return useQuery({
    queryKey: queryKeys.quote,
    queryFn: () => apiRequest(`/api/quote?localDate=${localDate()}`, quoteSchema.nullable()),
  })
}

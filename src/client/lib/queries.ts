import { useQuery } from "@tanstack/react-query"
import { useAppTime } from "../components/AppContext.js"
import { apiRequest } from "./api.js"
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
  items: (view: string, date: string) => ["items", view, date] as const,
  habits: (date: string) => ["habits", date] as const,
  projects: ["projects"] as const,
  gains: ["gains"] as const,
  reviews: ["reviews"] as const,
  quote: (date: string) => ["quote", date] as const,
}

export function useMeta() {
  return useQuery({ queryKey: queryKeys.meta, queryFn: () => apiRequest("/api/meta", metaSchema) })
}
export function useItems(view: "active" | "inbox" | "today" | "completed" | "archived") {
  const { today } = useAppTime()
  return useQuery({
    queryKey: queryKeys.items(view, today),
    queryFn: () => apiRequest(`/api/items?view=${view}&localDate=${today}`, itemsSchema),
  })
}
export function useHabits() {
  const { today } = useAppTime()
  return useQuery({
    queryKey: queryKeys.habits(today),
    queryFn: () => apiRequest(`/api/habits?localDate=${today}`, habitsSchema),
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
  const { today } = useAppTime()
  return useQuery({
    queryKey: queryKeys.quote(today),
    queryFn: () => apiRequest(`/api/quote?localDate=${today}`, quoteSchema.nullable()),
  })
}

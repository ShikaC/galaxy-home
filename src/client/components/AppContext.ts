import { createContext, useContext } from "react"

type AppActions = {
  readonly openCapture: () => void
  readonly openSearch: () => void
  readonly openAi: (conversationId?: string) => void
}

type AppTime = {
  readonly timezone: string
  readonly today: string
}

export const AppActionsContext = createContext<AppActions | null>(null)
export const AppTimeContext = createContext<AppTime | null>(null)

export function useAppActions(): AppActions {
  const value = useContext(AppActionsContext)
  if (value === null) throw new Error("App actions are unavailable")
  return value
}

export function useAppTime(): AppTime {
  const value = useContext(AppTimeContext)
  if (value === null) throw new Error("Workspace time is unavailable")
  return value
}

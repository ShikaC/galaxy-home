import { createContext, useContext } from "react"

type AppActions = {
  readonly openCapture: () => void
  readonly openSearch: () => void
  readonly openAi: () => void
}

export const AppActionsContext = createContext<AppActions | null>(null)

export function useAppActions(): AppActions {
  const value = useContext(AppActionsContext)
  if (value === null) throw new Error("App actions are unavailable")
  return value
}

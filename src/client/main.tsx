import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router/dom"
import { router } from "./router.js"
import "./styles/tokens.css"
import "./styles/base.css"
import "./styles/components.css"
import "./styles/feedback.css"
import "./styles/showcase.css"
import "./styles/layout.css"
import "./styles/product.css"
import "./styles/overlays.css"
import "./styles/settings.css"

const environment = import.meta.env as {
  readonly DEV: boolean
  readonly VITE_DISABLE_REACT_DEVTOOLS?: string
}
const enableDevTools = environment.DEV && environment.VITE_DISABLE_REACT_DEVTOOLS !== "1"
if (enableDevTools) {
  void import("react-grab")
  void import("react-scan")
}

const rootElement = document.getElementById("root")
if (rootElement === null) {
  throw new TypeError("Missing #root application mount")
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 }, mutations: { retry: false } },
})

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)

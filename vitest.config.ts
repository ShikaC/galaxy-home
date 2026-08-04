import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export const vitestConfig = defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
})

export default vitestConfig

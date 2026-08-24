import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export const vitestConfig = defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: "client",
          include: ["tests/client/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts"],
        },
      },
      {
        test: {
          name: "node",
          include: ["tests/integration/**/*.test.ts", "tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
})

export default vitestConfig

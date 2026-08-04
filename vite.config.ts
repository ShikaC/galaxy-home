import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const webPort = Number(process.env["VITE_PORT"] ?? 5173)
const apiPort = Number(process.env["VITE_API_PORT"] ?? 3001)

export const viteConfig = defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
  build: {
    outDir: "dist/client",
    sourcemap: true,
  },
})

export default viteConfig

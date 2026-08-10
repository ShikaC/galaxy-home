#!/usr/bin/env node
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const desktopWebPort = process.env.VITE_PORT ?? "5180"
const desktopApiPort = process.env.API_PORT ?? process.env.VITE_API_PORT ?? "3010"
const env = {
  ...process.env,
  API_PORT: desktopApiPort,
  VITE_API_PORT: desktopApiPort,
  VITE_PORT: desktopWebPort,
}
delete env.RUSTUP_TOOLCHAIN

const child = spawn("npx", ["tauri", ...args], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})

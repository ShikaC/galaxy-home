#!/usr/bin/env node
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { createConnection } from "node:net"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { assertSupportedNodeRuntime, npmInvocation, runtimeEnv } from "./node-runtime.mjs"

assertSupportedNodeRuntime()

const identifier = "app.galaxyhome.desktop"
const root = join(dirname(fileURLToPath(import.meta.url)), "..")

/** Dedicated ports so `npm run desktop` can run alongside browser `npm run dev` on 5173/3001. */
const webPort = Number(process.env["VITE_PORT"] ?? 5180)
const apiPort = Number(process.env["API_PORT"] ?? process.env["VITE_API_PORT"] ?? 3010)

function defaultDataDir() {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", identifier)
  }
  if (process.platform === "win32") {
    return join(process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"), identifier)
  }
  return join(process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share"), identifier)
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}

const dataDir = process.env["GALAXY_DATA_DIR"] ?? defaultDataDir()
mkdirSync(dataDir, { recursive: true })

if (await portInUse(webPort)) {
  console.error(
    `桌面开发端口 ${webPort} 已被占用。请先结束占用进程，或设置 VITE_PORT / API_PORT 后重试。\n（浏览器开发默认仍是 5173/3001，桌面默认 5180/3010，可并行。）`,
  )
  process.exit(1)
}
if (await portInUse(apiPort)) {
  console.error(
    `桌面 API 端口 ${apiPort} 已被占用。请先结束占用进程，或设置 API_PORT / VITE_API_PORT 后重试。`,
  )
  process.exit(1)
}

console.log(`桌面开发：Web http://127.0.0.1:${webPort}  API :${apiPort}`)
console.log(`数据目录：${dataDir}`)

const npm = npmInvocation(["run", "dev"])
const child = spawn(npm.command, npm.args, {
  cwd: root,
  env: {
    ...runtimeEnv(),
    GALAXY_DATA_DIR: dataDir,
    VITE_PORT: String(webPort),
    VITE_API_PORT: String(apiPort),
    API_PORT: String(apiPort),
    VITE_DISABLE_REACT_DEVTOOLS: process.env["VITE_DISABLE_REACT_DEVTOOLS"] ?? "1",
  },
  stdio: "inherit",
  shell: process.platform === "win32" && npm.command === "npm.cmd",
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})

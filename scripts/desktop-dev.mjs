#!/usr/bin/env node
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const identifier = "app.galaxyhome.desktop"
const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function defaultDataDir() {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", identifier)
  }
  if (process.platform === "win32") {
    return join(process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"), identifier)
  }
  return join(process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share"), identifier)
}

const dataDir = process.env["GALAXY_DATA_DIR"] ?? defaultDataDir()
mkdirSync(dataDir, { recursive: true })

const child = spawn("npm", ["run", "dev"], {
  cwd: root,
  env: { ...process.env, GALAXY_DATA_DIR: dataDir },
  stdio: "inherit",
  shell: process.platform === "win32",
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})

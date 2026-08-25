#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { assertSupportedNodeRuntime, runtimeEnv } from "./node-runtime.mjs"

assertSupportedNodeRuntime()

async function reserveTestPorts() {
  const servers = []
  try {
    for (let index = 0; index < 4; index += 1) {
      const server = createServer()
      await new Promise((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      servers.push(server)
    }
    const ports = servers.map((server) => {
      const address = server.address()
      if (address === null || typeof address === "string")
        throw new Error("Playwright launcher did not reserve a TCP port")
      return address.port
    })
    if (ports.length !== 4) throw new Error("Playwright launcher did not reserve four TCP ports")
    return ports
  } finally {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve, reject) => {
            server.close((error) => (error === undefined ? resolve() : reject(error)))
          }),
      ),
    )
  }
}

const [compactApiPort, compactWebPort, wideApiPort, wideWebPort] = await reserveTestPorts()
if (
  compactApiPort === undefined ||
  compactWebPort === undefined ||
  wideApiPort === undefined ||
  wideWebPort === undefined
)
  throw new Error("Playwright launcher received an incomplete port set")

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const cli = join(root, "node_modules", "@playwright", "test", "cli.js")
const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], {
  cwd: root,
  env: runtimeEnv({
    ...process.env,
    GALAXY_E2E_COMPACT_API_PORT: String(compactApiPort),
    GALAXY_E2E_COMPACT_WEB_PORT: String(compactWebPort),
    GALAXY_E2E_WIDE_API_PORT: String(wideApiPort),
    GALAXY_E2E_WIDE_WEB_PORT: String(wideWebPort),
  }),
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})

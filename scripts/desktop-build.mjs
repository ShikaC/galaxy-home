#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { assertSupportedNodeRuntime, npmInvocation, runtimeEnv } from "./node-runtime.mjs"

assertSupportedNodeRuntime()

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: runtimeEnv(),
    stdio: "inherit",
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const npm = npmInvocation(["run", "build"])
run(npm.command, npm.args)
run(process.execPath, [join(root, "scripts", "prepare-desktop-resources.mjs")])

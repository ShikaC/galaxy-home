#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { pruneProductionDependencyArtifacts } from "./desktop-resource-pruning.mjs"
import { assertSupportedNodeRuntime, npmInvocation, runtimeEnv } from "./node-runtime.mjs"

assertSupportedNodeRuntime()

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dest = join(root, "src-tauri", "resources", "app")
const dist = join(root, "dist")
const readme = `此目录由 \`npm run desktop:prepare\` / \`tauri build\` 的 beforeBuildCommand 填充运行时 dist 与生产依赖。开发请用 \`npm run desktop\`。
`

if (!existsSync(join(dist, "server", "index.js")) || !existsSync(join(dist, "client", "index.html"))) {
  console.error("缺少 dist/server 或 dist/client，请先运行 npm run build")
  process.exit(1)
}

rmSync(dest, { force: true, recursive: true })
mkdirSync(dest, { recursive: true })
writeFileSync(join(dest, "README.md"), readme)
cpSync(dist, join(dest, "dist"), { recursive: true })
cpSync(join(root, "db"), join(dest, "db"), { recursive: true })
cpSync(join(root, "package.json"), join(dest, "package.json"))
cpSync(join(root, "package-lock.json"), join(dest, "package-lock.json"))

const npm = npmInvocation(["ci", "--omit=dev"])
const install = spawnSync(npm.command, npm.args, {
  cwd: dest,
  env: runtimeEnv(),
  stdio: "inherit",
  shell: process.platform === "win32" && npm.command === "npm.cmd",
})
if (install.status !== 0) {
  process.exit(install.status ?? 1)
}

const removedDirectories = pruneProductionDependencyArtifacts(join(dest, "node_modules"))
console.log(`已移除 ${removedDirectories} 个生产依赖非运行时目录`)

console.log(`桌面运行时资源已写入 ${dest}`)

#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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
cpSync(join(root, "package.json"), join(dest, "package.json"))
cpSync(join(root, "package-lock.json"), join(dest, "package-lock.json"))

const install = spawnSync("npm", ["ci", "--omit=dev"], {
  cwd: dest,
  stdio: "inherit",
  shell: process.platform === "win32",
})
if (install.status !== 0) {
  process.exit(install.status ?? 1)
}

console.log(`桌面运行时资源已写入 ${dest}`)

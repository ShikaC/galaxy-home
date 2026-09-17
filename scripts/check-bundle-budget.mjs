#!/usr/bin/env node
// 首屏体积门禁。CI 在 npm run build 之后跑；本地跑前也要先 build。
//
// 为什么按 index.html 判定而不是按“最大的 chunk”：真正的首屏成本是浏览器在
// 解析 HTML 时必须下载的全部资源，包括 Vite 注入的 modulepreload。只看 index.js
// 会漏掉被 eager import 进来的库。
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const clientDirectory = join(root, "dist", "client")
const indexPath = join(clientDirectory, "index.html")
const budgetPath = join(root, "bundle-budget.json")

if (!existsSync(indexPath)) {
  console.error(`找不到 ${indexPath}，请先运行 npm run build`)
  process.exit(1)
}

const budget = JSON.parse(readFileSync(budgetPath, "utf8"))
const html = readFileSync(indexPath, "utf8")
// src/href 同时覆盖 <script type=module>、<link rel=modulepreload> 和样式表
const referenced = new Set(
  [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]),
)

function gzipSize(assetPath) {
  const file = join(clientDirectory, assetPath.replace(/^\/+/, ""))
  if (!existsSync(file)) throw new Error(`index.html 引用了不存在的资源：${assetPath}`)
  return gzipSync(readFileSync(file), { level: 9 }).byteLength
}

const entries = [...referenced].map((assetPath) => ({
  assetPath,
  name: assetPath.split("/").pop() ?? assetPath,
  bytes: gzipSize(assetPath),
}))

const sumOf = (predicate) =>
  entries.filter(predicate).reduce((total, entry) => total + entry.bytes, 0)

const measured = {
  firstScreenJavaScript: sumOf((entry) => entry.name.endsWith(".js")),
  firstScreenCss: sumOf((entry) => entry.name.endsWith(".css")),
  largestEagerChunk: entries.reduce((max, entry) => Math.max(max, entry.bytes), 0),
}

const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
const failures = []

console.log("首屏资源（来自 dist/client/index.html 的 script / modulepreload / stylesheet）")
for (const entry of [...entries].sort((a, b) => b.bytes - a.bytes).slice(0, 10))
  console.log(`  ${kilobytes(entry.bytes).padStart(9)}  ${entry.name}`)
if (entries.length > 10) console.log(`  … 另有 ${entries.length - 10} 个更小的资源`)

console.log("")
for (const [key, limitKb] of Object.entries(budget)) {
  const actual = measured[key]
  if (actual === undefined) throw new Error(`bundle-budget.json 含未知预算项：${key}`)
  const limit = limitKb * 1024
  const ratio = limit === 0 ? 0 : actual / limit
  const status = actual > limit ? "超出" : ratio > 0.95 ? "接近上限" : "ok"
  console.log(
    `${status.padEnd(5)} ${key}: ${kilobytes(actual)} / 上限 ${limitKb} KB（${(ratio * 100).toFixed(0)}%）`,
  )
  if (actual > limit)
    failures.push(`${key} 超出预算：实际 ${kilobytes(actual)}，上限 ${limitKb} KB`)
}

const chunkCount = entries.filter((entry) => entry.name.endsWith(".js")).length
console.log(`\n首屏 JS 请求数：${chunkCount}`)

if (failures.length > 0) {
  console.error("\n体积门禁未通过：")
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error(
    "\n先判断是不是某个库被 eager import 了：新依赖应走路由级 lazy()，" +
      "确认合理后再上调 bundle-budget.json 并在提交信息里说明原因。",
  )
  process.exit(1)
}
console.log("\n体积门禁通过。")

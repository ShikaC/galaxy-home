import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

const pathDelimiter = process.platform === "win32" ? ";" : ":"
const minimumNodeMajor = 24

export function assertSupportedNodeRuntime(version = process.versions.node) {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10)
  if (!Number.isInteger(major) || major < minimumNodeMajor) {
    throw new Error(`桌面命令需要 Node.js ≥${minimumNodeMajor}，当前为 ${version}`)
  }
}

export function runtimeEnv(base = process.env) {
  const runtimeDirectory = dirname(process.execPath)
  const inheritedPathKey = process.platform === "win32" && base.Path !== undefined ? "Path" : "PATH"
  const inheritedPath = base[inheritedPathKey] ?? ""
  return {
    ...base,
    [inheritedPathKey]: `${runtimeDirectory}${pathDelimiter}${inheritedPath}`,
  }
}

function resolveNpmCli() {
  const inherited = process.env.npm_execpath
  if (inherited !== undefined && inherited !== "") return inherited
  if (process.platform !== "win32") return undefined

  const lookup = "where.exe"
  try {
    const candidates = execFileSync(lookup, ["npm"], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate !== "")
    for (const candidate of candidates) {
      const cli = join(dirname(candidate), "node_modules", "npm", "bin", "npm-cli.js")
      if (existsSync(cli)) return cli
    }
  } catch {
    return undefined
  }
  return undefined
}

export function npmInvocation(args) {
  const npmCli = resolveNpmCli()
  return npmCli === undefined
    ? { command: process.platform === "win32" ? "npm.cmd" : "npm", args }
    : { command: process.execPath, args: [npmCli, ...args] }
}

export function tauriCliPath(root) {
  return join(root, "node_modules", "@tauri-apps", "cli", "tauri.js")
}

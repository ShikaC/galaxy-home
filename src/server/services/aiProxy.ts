import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { EnvHttpProxyAgent } from "undici"
import { isLoopbackAddress } from "./aiEndpoint.js"

const execute = promisify(execFile)
type ProxyEnvironment = Readonly<
  Partial<
    Record<
      "http_proxy" | "HTTP_PROXY" | "https_proxy" | "HTTPS_PROXY" | "no_proxy" | "NO_PROXY",
      string
    >
  >
>

export function resolveAiProxyOptions(environment: ProxyEnvironment, systemSettings: string) {
  const httpProxy = environment.http_proxy ?? environment.HTTP_PROXY
  const httpsProxy = environment.https_proxy ?? environment.HTTPS_PROXY
  const noProxy = environment.no_proxy ?? environment.NO_PROXY
  if (httpProxy !== undefined || httpsProxy !== undefined)
    return {
      httpProxy: httpProxy ?? "",
      httpsProxy: httpsProxy ?? httpProxy ?? "",
      noProxy: noProxy ?? "",
    }

  const field = (name: string) =>
    new RegExp(`^\\s*${name}\\s*:\\s*(\\S+)\\s*$`, "m").exec(systemSettings)?.[1]
  const systemProxy = (protocol: "HTTP" | "HTTPS") => {
    if (field(`${protocol}Enable`) !== "1") return ""
    const host = field(`${protocol}Proxy`)
    const port = Number(field(`${protocol}Port`))
    if (host === undefined || !Number.isInteger(port) || port < 1 || port > 65535) return ""
    return `http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${port}`
  }
  const exceptions = /ExceptionsList\s*:\s*<array>\s*\{([^}]*)\}/m.exec(systemSettings)?.[1]
  const systemBypass = Array.from(
    exceptions?.matchAll(/\d+\s*:\s*(\S+)/g) ?? [],
    (match) => match[1],
  )
    .filter((value) => value !== undefined && !value.includes("/") && value !== "<local>")
    .join(",")
  return {
    httpProxy: systemProxy("HTTP"),
    httpsProxy: systemProxy("HTTPS"),
    noProxy: noProxy ?? systemBypass,
  }
}

let dispatcher: Promise<EnvHttpProxyAgent> | undefined

async function createDispatcher() {
  let systemSettings = ""
  const hasEnvironmentProxy = ["http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY"].some(
    (key) => process.env[key] !== undefined,
  )
  if (process.platform === "darwin" && !hasEnvironmentProxy) {
    // Desktop launches do not inherit a terminal's proxy environment.
    const result = await execute("/usr/sbin/scutil", ["--proxy"], { timeout: 2_000 })
    systemSettings = result.stdout
  }
  return new EnvHttpProxyAgent(resolveAiProxyOptions(process.env, systemSettings))
}

export async function getAiDispatcher(url: string) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "")
  // Local model requests must never leave the machine through a remote proxy.
  if (host === "localhost" || isLoopbackAddress(host)) return undefined
  dispatcher ??= createDispatcher().catch((error: unknown) => {
    dispatcher = undefined
    throw error
  })
  return dispatcher
}

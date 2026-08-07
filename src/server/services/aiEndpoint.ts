import { lookup as defaultLookup } from "node:dns/promises"
import { isIP, isIPv4, isIPv6 } from "node:net"

export class AiInvalidEndpointError extends Error {
  readonly name = "AiInvalidEndpointError"
  readonly code = "AI_INVALID_ENDPOINT"
  constructor(
    message = "AI 服务地址无效：请使用 HTTPS 公网地址，或本机 loopback（如 http://127.0.0.1）",
  ) {
    super(message)
  }
}

type Lookup = (
  hostname: string,
  options: { readonly all: true; readonly family?: 0 | 4 | 6 },
) => Promise<readonly { readonly address: string; readonly family: number }[]>

function ipv4ToInt(ip: string): number {
  const [a = 0, b = 0, c = 0, d = 0] = ip.split(".").map((part) => Number(part))
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
}

function inCidr(ip: string, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffff_ffff << (32 - prefix)) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

export function isLoopbackAddress(ip: string): boolean {
  if (isIPv4(ip)) return inCidr(ip, "127.0.0.0", 8)
  if (!isIPv6(ip)) return false
  const normalized = ip.toLowerCase()
  if (normalized === "::1") return true
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length)
    return isIPv4(mapped) ? isLoopbackAddress(mapped) : false
  }
  return false
}

export function isBlockedAddress(ip: string): boolean {
  if (isLoopbackAddress(ip)) return false
  if (isIPv4(ip)) {
    return (
      inCidr(ip, "0.0.0.0", 8) ||
      inCidr(ip, "10.0.0.0", 8) ||
      inCidr(ip, "100.64.0.0", 10) ||
      inCidr(ip, "169.254.0.0", 16) ||
      inCidr(ip, "172.16.0.0", 12) ||
      inCidr(ip, "192.168.0.0", 16) ||
      inCidr(ip, "224.0.0.0", 4) ||
      inCidr(ip, "240.0.0.0", 4)
    )
  }
  if (isIPv6(ip)) {
    const normalized = ip.toLowerCase()
    if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true
    if (normalized.startsWith("fe80")) return true
    if (normalized.startsWith("ff")) return true
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length)
      return isIPv4(mapped) ? isBlockedAddress(mapped) : true
    }
    return false
  }
  return true
}

function assertParsedEndpoint(urlString: string): URL {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new AiInvalidEndpointError("AI 服务地址不是合法 URL")
  }
  if (url.username !== "" || url.password !== "") {
    throw new AiInvalidEndpointError("AI 服务地址不能包含用户名或密码")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AiInvalidEndpointError("AI 服务地址仅支持 http 或 https")
  }
  if (url.hostname === "") throw new AiInvalidEndpointError("AI 服务地址缺少主机名")
  return url
}

export async function assertSafeAiEndpoint(
  urlString: string,
  lookup: Lookup = defaultLookup,
): Promise<void> {
  if (urlString.trim() === "") return
  const url = assertParsedEndpoint(urlString)
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const literalFamily = isIP(host)
  if (literalFamily !== 0) {
    if (isLoopbackAddress(host)) return
    if (url.protocol !== "https:") {
      throw new AiInvalidEndpointError("非本机 AI 服务地址必须使用 HTTPS")
    }
    if (isBlockedAddress(host)) {
      throw new AiInvalidEndpointError("AI 服务地址不能指向内网、链路本地或保留地址")
    }
    return
  }
  const hostname = host.toLowerCase()
  if (hostname === "localhost") {
    return
  }
  if (url.protocol !== "https:") {
    throw new AiInvalidEndpointError("非本机 AI 服务地址必须使用 HTTPS")
  }
  let addresses: readonly { readonly address: string; readonly family: number }[]
  try {
    addresses = await lookup(hostname, { all: true })
  } catch {
    throw new AiInvalidEndpointError("无法解析 AI 服务主机名")
  }
  if (addresses.length === 0) throw new AiInvalidEndpointError("无法解析 AI 服务主机名")
  for (const { address } of addresses) {
    if (isLoopbackAddress(address) || isBlockedAddress(address)) {
      throw new AiInvalidEndpointError("AI 服务地址不能解析到内网、本机或保留地址")
    }
  }
}

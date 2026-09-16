import type { ZodType } from "zod"
import { z } from "zod"
import { ERROR_CODES, type ErrorCode, errorCodeSchema } from "../../shared/errorCodes.js"

const errorSchema = z.object({ code: z.string(), message: z.string() })
const capabilityHashKey = "capability"

export class ApiError extends Error {
  readonly name = "ApiError"
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export async function throwApiError(response: Response): Promise<never> {
  const parsed = errorSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new ApiError(ERROR_CODES.NETWORK_ERROR, "请求失败，请稍后再试")
  const code = errorCodeSchema.safeParse(parsed.data.code)
  throw new ApiError(code.success ? code.data : ERROR_CODES.INTERNAL_ERROR, parsed.data.message)
}

export async function bootstrapApiCapability(): Promise<void> {
  const capability = new URLSearchParams(window.location.hash.slice(1)).get(capabilityHashKey)
  if (capability === null || capability === "") return
  const response = await fetch("/api/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Galaxy-Capability": capability },
  })
  if (!response.ok) await throwApiError(response)
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
}

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json")
  const response = await fetch(path, { ...init, headers })
  if (!response.ok) await throwApiError(response)
  return schema.parse(await response.json())
}

export async function apiVoid(path: string, init?: RequestInit): Promise<void> {
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json")
  const response = await fetch(path, { ...init, headers })
  if (!response.ok) await throwApiError(response)
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value)
}

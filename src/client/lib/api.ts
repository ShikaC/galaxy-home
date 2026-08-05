import type { ZodType } from "zod"
import { z } from "zod"

const errorSchema = z.object({ code: z.string(), message: z.string() })

export class ApiError extends Error {
  readonly name = "ApiError"
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function throwApiError(response: Response): Promise<never> {
  const parsed = errorSchema.safeParse(await response.json().catch(() => null))
  throw new ApiError(
    parsed.success ? parsed.data.code : "NETWORK_ERROR",
    parsed.success ? parsed.data.message : "请求失败，请稍后再试",
  )
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

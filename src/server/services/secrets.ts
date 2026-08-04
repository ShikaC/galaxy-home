import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { z } from "zod"
import type { AiConfigInput } from "../../shared/app.js"

const storedConfigSchema = z.object({
  chatBaseUrl: z.string(),
  chatModel: z.string(),
  apiKey: z.string(),
  transcriptionBaseUrl: z.string(),
  transcriptionModel: z.string(),
  updatedAt: z.string(),
})

export type AiConfigStatus = {
  readonly chatBaseUrl: string
  readonly chatModel: string
  readonly hasApiKey: boolean
  readonly transcriptionBaseUrl: string
  readonly transcriptionModel: string
  readonly configured: boolean
}

function emptyConfig(): z.infer<typeof storedConfigSchema> {
  return {
    chatBaseUrl: "",
    chatModel: "",
    apiKey: "",
    transcriptionBaseUrl: "",
    transcriptionModel: "",
    updatedAt: new Date(0).toISOString(),
  }
}

export function readSecretConfig(path: string): z.infer<typeof storedConfigSchema> {
  if (!existsSync(path)) return emptyConfig()
  return storedConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")))
}

export function getAiConfigStatus(path: string): AiConfigStatus {
  const config = readSecretConfig(path)
  return {
    chatBaseUrl: config.chatBaseUrl,
    chatModel: config.chatModel,
    hasApiKey: config.apiKey !== "",
    transcriptionBaseUrl: config.transcriptionBaseUrl,
    transcriptionModel: config.transcriptionModel,
    configured: config.chatBaseUrl !== "" && config.chatModel !== "" && config.apiKey !== "",
  }
}

export function writeSecretConfig(path: string, input: AiConfigInput): AiConfigStatus {
  mkdirSync(dirname(path), { recursive: true })
  const current = readSecretConfig(path)
  writeFileSync(
    path,
    JSON.stringify(
      {
        ...input,
        apiKey: input.apiKey === "" ? current.apiKey : input.apiKey,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
  return getAiConfigStatus(path)
}

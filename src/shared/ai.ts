import { z } from "zod"

export const aiReferenceSchema = z
  .object({
    type: z.enum([
      "page",
      "item",
      "category",
      "project",
      "habit",
      "gain",
      "review",
      "conversation",
      "memory",
    ]),
    id: z.string().nullable(),
    label: z.string(),
  })
  .readonly()

export type AiReference = z.infer<typeof aiReferenceSchema>

export const aiMessageSchema = z
  .object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    references: z.array(aiReferenceSchema).readonly(),
    createdAt: z.string(),
  })
  .readonly()

export type AiMessage = z.infer<typeof aiMessageSchema>

export const aiMessagesSchema = z.array(aiMessageSchema).readonly()

export const aiMemoryKindSchema = z.enum(["preference", "goal", "background"])
export type AiMemoryKind = z.infer<typeof aiMemoryKindSchema>
export const aiMemorySchema = z
  .object({
    id: z.string().uuid(),
    content: z.string(),
    kind: aiMemoryKindSchema,
    confirmedAt: z.string(),
    updatedAt: z.string(),
  })
  .readonly()

export type AiMemory = z.infer<typeof aiMemorySchema>

export const createAiMemoryInputSchema = z
  .object({
    content: z.string().trim().min(1).max(5_000),
    kind: aiMemoryKindSchema,
    confirmed: z.literal(true),
  })
  .readonly()

export const aiChatInputSchema = z
  .object({
    conversationId: z.string().uuid().nullable(),
    content: z.string().trim().min(1).max(20_000),
    currentPath: z.string().trim().min(1).max(300).default("/"),
    currentLabel: z.string().trim().min(1).max(40).default("当前页"),
  })
  .readonly()

export const aiChatResponseSchema = z
  .object({ conversationId: z.string().uuid(), message: aiMessageSchema })
  .readonly()

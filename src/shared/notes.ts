import { z } from "zod"

export const noteInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().max(50_000).default(""),
  pinned: z.boolean().default(false),
})

export const noteSchema = noteInputSchema
  .extend({
    id: z.uuid(),
    archived: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .readonly()

export const notesSchema = z.array(noteSchema).readonly()
export type Note = z.infer<typeof noteSchema>

import { randomUUID } from "node:crypto"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { ERROR_CODES } from "../../shared/errorCodes.js"
import { noteInputSchema, noteSchema } from "../../shared/notes.js"
import { type AppContext, getAppClock } from "../context.js"

const parametersSchema = z.object({ id: z.string().uuid() })
const updateSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  content: z.string().max(50_000).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
})
const selectNote = `SELECT id, title, content, pinned, archived,
  created_at AS createdAt, updated_at AS updatedAt FROM workspace_notes`
const rowSchema = noteSchema
  .unwrap()
  .extend({
    pinned: z.number().transform(Boolean),
    archived: z.number().transform(Boolean),
  })
  .transform((row) => noteSchema.parse(row))

export function registerNoteRoutes(app: FastifyInstance, context: AppContext): void {
  const { database } = context
  const clock = getAppClock(context)
  app.get("/api/notes", (request) => {
    const { archived } = z
      .object({ archived: z.enum(["true", "false"]).default("false") })
      .parse(request.query)
    return database
      .prepare(`${selectNote} WHERE archived = ? ORDER BY pinned DESC, updated_at DESC`)
      .all(archived === "true" ? 1 : 0)
      .map((row) => rowSchema.parse(row))
  })
  app.post("/api/notes", (request, reply) => {
    const input = noteInputSchema.parse(request.body)
    const id = randomUUID()
    const now = clock.now().toISOString()
    database
      .prepare(`INSERT INTO workspace_notes (id, title, content, pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, input.title, input.content, Number(input.pinned), now, now)
    return reply
      .code(201)
      .send(rowSchema.parse(database.prepare(`${selectNote} WHERE id = ?`).get(id)))
  })
  app.patch("/api/notes/:id", (request, reply) => {
    const { id } = parametersSchema.parse(request.params)
    const input = updateSchema.parse(request.body)
    const row = database.prepare(`${selectNote} WHERE id = ?`).get(id)
    if (row === undefined)
      return reply.code(404).send({ code: ERROR_CODES.NOTE_NOT_FOUND, message: "这篇笔记已不存在" })
    const previous = rowSchema.parse(row)
    database
      .prepare(
        `UPDATE workspace_notes SET title = ?, content = ?, pinned = ?, archived = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        input.title ?? previous.title,
        input.content ?? previous.content,
        Number(input.pinned ?? previous.pinned),
        Number(input.archived ?? previous.archived),
        clock.now().toISOString(),
        id,
      )
    return rowSchema.parse(database.prepare(`${selectNote} WHERE id = ?`).get(id))
  })
}

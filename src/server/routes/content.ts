import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { createGainInputSchema } from "../../shared/app.js"
import type { AppContext } from "../context.js"
import {
  createGain,
  createQuote,
  getDailyQuote,
  listGains,
  listQuotes,
  nextDailyQuote,
  updateGain,
  updateQuote,
} from "../repositories/content.js"
import { generateLocalReview, listReviews } from "../repositories/reviews.js"
import { searchWorkspace } from "../repositories/search.js"
import { moveToTrash } from "../repositories/trash.js"

const dateSchema = z.object({ localDate: z.string() })
const searchSchema = z.object({ q: z.string().max(200) })
const reviewSchema = z.object({ weekStart: z.string(), weekEnd: z.string() })
const idSchema = z.object({ id: z.string().uuid() })
const gainUpdateSchema = z.object({ content: z.string().trim().min(1).max(5_000) })
const quoteInputSchema = z.object({
  content: z.string().trim().min(1).max(500),
  enabled: z.boolean().default(true),
})

export function registerContentRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/api/quote", (request) =>
    getDailyQuote(context.database, dateSchema.parse(request.query).localDate),
  )
  app.post("/api/quote/next", (request) =>
    nextDailyQuote(context.database, dateSchema.parse(request.body).localDate),
  )
  app.get("/api/quotes", () => listQuotes(context.database))
  app.post("/api/quotes", (request, reply) =>
    reply
      .code(201)
      .send(createQuote(context.database, quoteInputSchema.parse(request.body).content)),
  )
  app.patch("/api/quotes/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const body = quoteInputSchema.parse(request.body)
    updateQuote(context.database, id, body.content, body.enabled)
    return reply.code(204).send()
  })
  app.delete("/api/quotes/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    moveToTrash(context.database, "quote", id, "每日短语")
    return reply.code(204).send()
  })
  app.get("/api/gains", (request) =>
    listGains(context.database, dateSchema.partial().parse(request.query).localDate),
  )
  app.post("/api/gains", (request, reply) => {
    const input = createGainInputSchema.parse(request.body)
    return reply.code(201).send(createGain(context.database, input.localDate, input.content))
  })
  app.patch("/api/gains/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    updateGain(context.database, id, gainUpdateSchema.parse(request.body).content)
    return reply.code(204).send()
  })
  app.delete("/api/gains/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    moveToTrash(context.database, "gain", id, "每日收获")
    return reply.code(204).send()
  })
  app.get("/api/reviews", () => listReviews(context.database))
  app.post("/api/reviews/generate", (request, reply) => {
    const input = reviewSchema.parse(request.body)
    return reply
      .code(201)
      .send(generateLocalReview(context.database, input.weekStart, input.weekEnd))
  })
  app.get("/api/search", (request) =>
    searchWorkspace(context.database, searchSchema.parse(request.query).q),
  )
}

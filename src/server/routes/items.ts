import type { FastifyInstance } from "fastify"
import { z } from "zod"
import {
  categoryIdSchema,
  createCategoryInputSchema,
  createItemInputSchema,
  itemViewSchema,
  projectIdSchema,
  updateItemInputSchema,
} from "../../shared/items.js"
import { calendarDateSchema, ianaTimezoneSchema } from "../../shared/taskCore.js"
import { type AppContext, getAppClock } from "../context.js"
import { createCategory, reorderCategoryItems, updateCategory } from "../repositories/categories.js"
import {
  copyItem,
  createItem,
  getItemDetail,
  listItems,
  setTodayItem,
  updateItem,
} from "../repositories/items.js"
import { convertItemToProject } from "../repositories/projects.js"
import { getSettings } from "../repositories/settings.js"
import { clearTodayItem, reorderTodayItems } from "../repositories/todayItems.js"
import { moveToTrash } from "../repositories/trash.js"
import { replenishRecurrenceAfterItemMutation } from "../services/recurrenceMaterializer.js"
import { localClock } from "../services/time.js"

const querySchema = z.object({
  view: itemViewSchema.default("active"),
  localDate: calendarDateSchema,
  timezone: ianaTimezoneSchema.optional(),
  categoryId: z.uuid().optional(),
  projectId: z.uuid().optional(),
})
const idSchema = z.object({ id: z.uuid() })
const todaySchema = z.object({
  localDate: calendarDateSchema,
  isFocus: z.boolean(),
  isSecondary: z.boolean(),
  expectedVersion: z.number().int().positive().optional(),
})
const reorderSchema = z.object({ localDate: z.string(), itemIds: z.array(z.uuid()) })
const categoryReorderSchema = z.object({ categoryIds: z.array(z.uuid()) })
const itemReorderSchema = z.object({ itemIds: z.array(z.uuid()) })
const localDateSchema = z.object({
  localDate: calendarDateSchema,
  expectedVersion: z.coerce.number().int().positive().optional(),
})

export function registerItemRoutes(app: FastifyInstance, context: AppContext): void {
  const clock = getAppClock(context)
  app.get("/api/items", (request) => {
    const query = querySchema.parse(request.query)
    return listItems(context.database, {
      view: query.view,
      localDate: query.localDate,
      timezone: query.timezone ?? getSettings(context.database).timezone,
      ...(query.categoryId === undefined
        ? {}
        : { categoryId: categoryIdSchema.parse(query.categoryId) }),
      ...(query.projectId === undefined
        ? {}
        : { projectId: projectIdSchema.parse(query.projectId) }),
    })
  })
  app.post("/api/items", (request, reply) => {
    const localDate = localClock(clock.now(), getSettings(context.database).timezone).date
    const item = createItem(
      context.database,
      createItemInputSchema.parse(request.body),
      localDate,
      clock.now(),
    )
    return reply.code(201).send(item)
  })
  app.get("/api/items/:id", (request) => {
    const localDate = localClock(clock.now(), getSettings(context.database).timezone).date
    return getItemDetail(context.database, idSchema.parse(request.params).id, localDate)
  })
  app.patch("/api/items/:id", (request) => {
    const { id } = idSchema.parse(request.params)
    const localDate = localClock(clock.now(), getSettings(context.database).timezone).date
    const item = updateItem(
      context.database,
      id,
      updateItemInputSchema.parse(request.body),
      localDate,
      clock.now(),
    )
    replenishRecurrenceAfterItemMutation(context.database, id, clock.now())
    return item
  })
  app.post("/api/items/:id/copy", (request, reply) =>
    reply
      .code(201)
      .send(
        copyItem(
          context.database,
          idSchema.parse(request.params).id,
          localClock(clock.now(), getSettings(context.database).timezone).date,
        ),
      ),
  )
  app.post("/api/items/:id/convert-to-project", (request, reply) =>
    reply.code(201).send(convertItemToProject(context.database, idSchema.parse(request.params).id)),
  )
  app.put("/api/items/:id/today", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const body = todaySchema.parse(request.body)
    if (body.isSecondary)
      setTodayItem(context.database, {
        itemId: z.uuid().brand("ItemId").parse(id),
        localDate: body.localDate,
        isFocus: false,
        isSecondary: true,
        ...(body.expectedVersion === undefined ? {} : { expectedVersion: body.expectedVersion }),
      })
    else
      setTodayItem(context.database, {
        itemId: z.uuid().brand("ItemId").parse(id),
        localDate: body.localDate,
        isFocus: body.isFocus,
        isSecondary: false,
        ...(body.expectedVersion === undefined ? {} : { expectedVersion: body.expectedVersion }),
      })
    return reply.code(204).send()
  })
  app.post("/api/categories", (request, reply) =>
    reply
      .code(201)
      .send(createCategory(context.database, createCategoryInputSchema.parse(request.body))),
  )
  app.patch("/api/categories/:id", (request) =>
    updateCategory(
      context.database,
      idSchema.parse(request.params).id,
      createCategoryInputSchema.parse(request.body),
    ),
  )
  app.put("/api/categories/reorder", (request, reply) => {
    const body = categoryReorderSchema.parse(request.body)
    const statement = context.database.prepare(
      "UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?",
    )
    const now = clock.now().toISOString()
    body.categoryIds.forEach((categoryId, index) => {
      statement.run(index, now, categoryId)
    })
    return reply.code(204).send()
  })
  app.put("/api/categories/:id/items/reorder", (request, reply) => {
    reorderCategoryItems(
      context.database,
      idSchema.parse(request.params).id,
      itemReorderSchema.parse(request.body).itemIds,
    )
    return reply.code(204).send()
  })
  app.delete("/api/categories/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    moveToTrash(context.database, "category", id, "分类", clock.now())
    return reply.code(204).send()
  })
  app.put("/api/today/reorder", (request, reply) => {
    const body = reorderSchema.parse(request.body)
    reorderTodayItems(context.database, body.localDate, body.itemIds)
    return reply.code(204).send()
  })
  app.delete("/api/items/:id/today", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const { localDate, expectedVersion } = localDateSchema.parse(request.query)
    clearTodayItem(context.database, id, localDate, expectedVersion)
    return reply.code(204).send()
  })
  app.delete("/api/items/:id", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const item = listItems(context.database, {
      view: "active",
      localDate: localClock(clock.now(), getSettings(context.database).timezone).date,
    }).find((value) => value.id === id)
    moveToTrash(context.database, "item", id, item?.title ?? "已删除待办", clock.now())
    return reply.code(204).send()
  })
}

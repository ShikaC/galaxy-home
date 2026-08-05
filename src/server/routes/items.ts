import type { FastifyInstance } from "fastify"
import { z } from "zod"
import {
  createCategoryInputSchema,
  createItemInputSchema,
  itemViewSchema,
  updateItemInputSchema,
} from "../../shared/items.js"
import { type AppContext, getAppClock } from "../context.js"
import {
  createCategory,
  reorderCategoryItems,
  replaceItemCategories,
  updateCategory,
} from "../repositories/categories.js"
import { copyItem, createItem, listItems, setTodayItem, updateItem } from "../repositories/items.js"
import { replaceItemProjects } from "../repositories/projectRelations.js"
import { convertItemToProject } from "../repositories/projects.js"
import { getSettings } from "../repositories/settings.js"
import { reorderTodayItems } from "../repositories/todayItems.js"
import { moveToTrash } from "../repositories/trash.js"
import { localClock } from "../services/time.js"

const querySchema = z.object({
  view: itemViewSchema.default("active"),
  localDate: z.string(),
  categoryId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
})
const idSchema = z.object({ id: z.string().uuid() })
const todaySchema = z.object({
  localDate: z.string(),
  isFocus: z.boolean(),
  isSecondary: z.boolean(),
})
const categoriesSchema = z.object({ categoryIds: z.array(z.string().uuid()) })
const projectsSchema = z.object({ projectIds: z.array(z.string().uuid()) })
const reorderSchema = z.object({ localDate: z.string(), itemIds: z.array(z.string().uuid()) })
const categoryReorderSchema = z.object({ categoryIds: z.array(z.string().uuid()) })
const itemReorderSchema = z.object({ itemIds: z.array(z.string().uuid()) })
const localDateSchema = z.object({ localDate: z.string() })

export function registerItemRoutes(app: FastifyInstance, context: AppContext): void {
  const clock = getAppClock(context)
  app.get("/api/items", (request) => {
    const query = querySchema.parse(request.query)
    return listItems(context.database, {
      view: query.view,
      localDate: query.localDate,
      ...(query.categoryId === undefined
        ? {}
        : { categoryId: z.string().uuid().brand("CategoryId").parse(query.categoryId) }),
      ...(query.projectId === undefined
        ? {}
        : { projectId: z.string().uuid().brand("ProjectId").parse(query.projectId) }),
    })
  })
  app.post("/api/items", (request, reply) => {
    const localDate = localClock(clock.now(), getSettings(context.database).timezone).date
    return reply
      .code(201)
      .send(createItem(context.database, createItemInputSchema.parse(request.body), localDate))
  })
  app.patch("/api/items/:id", (request) => {
    const { id } = idSchema.parse(request.params)
    const localDate = localClock(clock.now(), getSettings(context.database).timezone).date
    return updateItem(context.database, id, updateItemInputSchema.parse(request.body), localDate)
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
  app.put("/api/items/:id/categories", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const body = categoriesSchema.parse(request.body)
    replaceItemCategories(
      context.database,
      z.string().uuid().brand("ItemId").parse(id),
      body.categoryIds.map((value) => z.string().uuid().brand("CategoryId").parse(value)),
    )
    return reply.code(204).send()
  })
  app.put("/api/items/:id/projects", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const body = projectsSchema.parse(request.body)
    replaceItemProjects(
      context.database,
      z.string().uuid().brand("ItemId").parse(id),
      body.projectIds.map((value) => z.string().uuid().brand("ProjectId").parse(value)),
    )
    return reply.code(204).send()
  })
  app.put("/api/items/:id/today", (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const body = todaySchema.parse(request.body)
    if (body.isSecondary)
      setTodayItem(context.database, {
        itemId: z.string().uuid().brand("ItemId").parse(id),
        localDate: body.localDate,
        isFocus: false,
        isSecondary: true,
      })
    else
      setTodayItem(context.database, {
        itemId: z.string().uuid().brand("ItemId").parse(id),
        localDate: body.localDate,
        isFocus: body.isFocus,
        isSecondary: false,
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
    const { localDate } = localDateSchema.parse(request.query)
    context.database
      .prepare("DELETE FROM today_items WHERE item_id = ? AND local_date = ?")
      .run(id, localDate)
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

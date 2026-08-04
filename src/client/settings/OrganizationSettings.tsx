import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { quoteSchema } from "../../shared/app.js"
import { categorySchema } from "../../shared/items.js"
import { Button } from "../components/ui/Button.js"
import { IconButton } from "../components/ui/IconButton.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"

const quotesSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      content: z.string(),
      enabled: z.number(),
      is_system: z.number(),
    }),
  )
  .readonly()

export function OrganizationSettings() {
  const meta = useMeta()
  const client = useQueryClient()
  const quotes = useQuery({
    queryKey: ["quotes"],
    queryFn: () => apiRequest("/api/quotes", quotesSchema),
  })
  const [categoryName, setCategoryName] = useState("")
  const [color, setColor] = useState("#26734d")
  const [quote, setQuote] = useState("")
  const refreshMeta = () => client.invalidateQueries({ queryKey: queryKeys.meta })
  const createCategory = useMutation({
    mutationFn: () =>
      apiRequest("/api/categories", categorySchema, {
        method: "POST",
        body: jsonBody({ name: categoryName, color, icon: "tag" }),
      }),
    onSuccess: () => {
      setCategoryName("")
      void refreshMeta()
    },
  })
  const removeCategory = useMutation({
    mutationFn: (id: string) => apiVoid(`/api/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void refreshMeta()
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  const moveCategory = async (index: number, delta: number) => {
    const categories = [...(meta.data?.categories ?? [])]
    const other = index + delta
    if (other < 0 || other >= categories.length) return
    const current = categories[index]
    const target = categories[other]
    if (current === undefined || target === undefined) return
    categories[index] = target
    categories[other] = current
    await apiVoid("/api/categories/reorder", {
      method: "PUT",
      body: jsonBody({ categoryIds: categories.map((entry) => entry.id) }),
    })
    await refreshMeta()
  }
  const createQuote = useMutation({
    mutationFn: () =>
      apiRequest("/api/quotes", quoteSchema, {
        method: "POST",
        body: jsonBody({ content: quote }),
      }),
    onSuccess: () => {
      setQuote("")
      void client.invalidateQueries({ queryKey: ["quotes"] })
    },
  })
  const toggleQuote = useMutation({
    mutationFn: (value: {
      readonly id: string
      readonly content: string
      readonly enabled: boolean
    }) => apiVoid(`/api/quotes/${value.id}`, { method: "PATCH", body: jsonBody(value) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["quotes"] }),
  })
  const removeQuote = useMutation({
    mutationFn: (id: string) => apiVoid(`/api/quotes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["quotes"] })
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  return (
    <section className="settings-section">
      <header>
        <h2>分类与每日短语</h2>
        <p>分类保持单层；条目可以同时属于多个分类。</p>
      </header>
      <div className="settings-split">
        <div>
          <h3>自定义分类</h3>
          <form
            className="inline-create"
            onSubmit={(event) => {
              event.preventDefault()
              createCategory.mutate()
            }}
          >
            <input
              aria-label="分类颜色"
              onChange={(event) => setColor(event.target.value)}
              type="color"
              value={color}
            />
            <input
              aria-label="分类名称"
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="例如：家务"
              value={categoryName}
            />
            <Button disabled={!categoryName.trim()} size="compact" type="submit">
              <Plus size={15} />
              添加
            </Button>
          </form>
          <div className="settings-list">
            {meta.data?.categories.map((category, index) => (
              <div key={category.id}>
                <span className="color-swatch" style={{ background: category.color }} />
                <strong>{category.name}</strong>
                <IconButton
                  disabled={index === 0}
                  label="上移分类"
                  onClick={() => void moveCategory(index, -1)}
                >
                  <ArrowUp size={15} />
                </IconButton>
                <IconButton
                  disabled={index === (meta.data?.categories.length ?? 0) - 1}
                  label="下移分类"
                  onClick={() => void moveCategory(index, 1)}
                >
                  <ArrowDown size={15} />
                </IconButton>
                <IconButton label="删除分类" onClick={() => removeCategory.mutate(category.id)}>
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3>每日短语</h3>
          <form
            className="inline-create"
            onSubmit={(event) => {
              event.preventDefault()
              createQuote.mutate()
            }}
          >
            <input
              aria-label="新增每日短语"
              onChange={(event) => setQuote(event.target.value)}
              placeholder="写下一句短语"
              value={quote}
            />
            <Button disabled={!quote.trim()} size="compact" type="submit">
              <Plus size={15} />
              添加
            </Button>
          </form>
          <div className="settings-list quote-settings">
            {quotes.data?.map((entry) => (
              <div key={entry.id}>
                <label>
                  <input
                    checked={entry.enabled === 1}
                    onChange={() =>
                      toggleQuote.mutate({
                        id: entry.id,
                        content: entry.content,
                        enabled: entry.enabled !== 1,
                      })
                    }
                    type="checkbox"
                  />
                  <span>{entry.content}</span>
                </label>
                <IconButton label="删除短语" onClick={() => removeQuote.mutate(entry.id)}>
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

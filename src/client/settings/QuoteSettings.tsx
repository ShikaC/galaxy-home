import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { quoteSchema } from "../../shared/app.js"
import { Button } from "../components/ui/Button.js"
import { IconButton } from "../components/ui/IconButton.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"

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
type QuoteRow = z.infer<typeof quotesSchema>[number]

export function QuoteSettings() {
  const client = useQueryClient()
  const quotes = useQuery({
    queryKey: ["quotes"],
    queryFn: () => apiRequest("/api/quotes", quotesSchema),
  })
  const [content, setContent] = useState("")
  const [editing, setEditing] = useState<QuoteRow | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: ["quotes"] })
  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/quotes", quoteSchema, { method: "POST", body: jsonBody({ content }) }),
    onSuccess: () => {
      setContent("")
      void refresh()
    },
  })
  const update = useMutation({
    mutationFn: (quote: QuoteRow) =>
      apiVoid(`/api/quotes/${quote.id}`, {
        method: "PATCH",
        body: jsonBody({ content: quote.content, enabled: quote.enabled === 1 }),
      }),
    onSuccess: () => {
      setEditing(null)
      void refresh()
      void client.invalidateQueries({ queryKey: ["quote"] })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiVoid(`/api/quotes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void refresh()
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  return (
    <div>
      <h3>每日短语</h3>
      <form
        className="inline-create"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <input
          aria-label="新增每日短语"
          onChange={(event) => setContent(event.target.value)}
          placeholder="写下一句短语"
          value={content}
        />
        <Button disabled={!content.trim()} size="compact" type="submit">
          <Plus size={15} />
          添加
        </Button>
      </form>
      <div className="settings-list quote-settings">
        {quotes.data?.map((quote) => {
          const isEditing = editing?.id === quote.id
          return (
            <div key={quote.id}>
              {isEditing && editing !== null ? (
                <>
                  <input
                    aria-label="编辑每日短语"
                    onChange={(event) => setEditing({ ...editing, content: event.target.value })}
                    value={editing.content}
                  />
                  <IconButton label="保存短语" onClick={() => update.mutate(editing)}>
                    <Check size={15} />
                  </IconButton>
                  <IconButton label="取消编辑" onClick={() => setEditing(null)}>
                    <X size={15} />
                  </IconButton>
                </>
              ) : (
                <>
                  <label>
                    <input
                      checked={quote.enabled === 1}
                      onChange={() =>
                        update.mutate({ ...quote, enabled: quote.enabled === 1 ? 0 : 1 })
                      }
                      type="checkbox"
                    />
                    <span>{quote.content}</span>
                  </label>
                  <IconButton label="编辑短语" onClick={() => setEditing(quote)}>
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton label="删除短语" onClick={() => remove.mutate(quote.id)}>
                    <Trash2 size={15} />
                  </IconButton>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

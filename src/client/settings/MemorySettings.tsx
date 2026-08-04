import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { EmptyState } from "../components/ui/EmptyState.js"
import { IconButton } from "../components/ui/IconButton.js"
import { apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"

export function MemorySettings() {
  const meta = useMeta()
  const client = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.meta })
  const save = useMutation({
    mutationFn: (id: string) =>
      apiVoid(`/api/ai/memories/${id}`, { method: "PATCH", body: jsonBody({ content }) }),
    onSuccess: () => {
      setEditing(null)
      void refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiVoid(`/api/ai/memories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void refresh()
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  const memories = meta.data?.memories ?? []
  return (
    <section className="settings-section">
      <header>
        <h2>AI 长期记忆</h2>
        <p>只有经你确认的偏好、目标和背景才会出现在这里；会话历史不会自动成为记忆。</p>
      </header>
      {memories.length === 0 ? (
        <EmptyState
          description="以后确认保存的记忆会集中显示在这里。"
          icon={Pencil}
          title="还没有长期记忆"
        />
      ) : (
        <div className="settings-list">
          {memories.map((memory) => {
            const id = memory.id
            const text = memory.content
            return (
              <div key={id}>
                {editing === id ? (
                  <input
                    aria-label="编辑 AI 记忆"
                    onChange={(event) => setContent(event.target.value)}
                    value={content}
                  />
                ) : (
                  <span>{text}</span>
                )}
                <IconButton
                  label={editing === id ? "保存记忆" : "编辑记忆"}
                  onClick={() => {
                    if (editing === id) save.mutate(id)
                    else {
                      setEditing(id)
                      setContent(text)
                    }
                  }}
                >
                  <Pencil size={15} />
                </IconButton>
                <IconButton label="删除记忆" onClick={() => remove.mutate(id)}>
                  <Trash2 size={15} />
                </IconButton>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

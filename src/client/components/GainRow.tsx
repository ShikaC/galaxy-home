import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Pencil, Trash2, X } from "lucide-react"
import { useState } from "react"
import type { Gain } from "../../shared/app.js"
import { apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys } from "../lib/queries.js"
import { IconButton } from "./ui/IconButton.js"

export function GainRow({ gain }: { readonly gain: Gain }) {
  const client = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(gain.content)
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.gains })
  const save = useMutation({
    mutationFn: () =>
      apiVoid(`/api/gains/${gain.id}`, { method: "PATCH", body: jsonBody({ content }) }),
    onSuccess: () => {
      setEditing(false)
      void refresh()
    },
  })
  const remove = useMutation({
    mutationFn: () => apiVoid(`/api/gains/${gain.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void refresh()
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  return (
    <article className="gain-row">
      <time>
        {gain.localDate} ·{" "}
        {new Date(gain.createdAt).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </time>
      {editing ? (
        <textarea
          aria-label="编辑收获原文"
          onChange={(event) => setContent(event.target.value)}
          rows={2}
          value={content}
        />
      ) : (
        <p>{gain.content}</p>
      )}
      <div>
        {editing ? (
          <>
            <IconButton label="保存修改" onClick={() => save.mutate()}>
              <Check size={16} />
            </IconButton>
            <IconButton
              label="取消修改"
              onClick={() => {
                setEditing(false)
                setContent(gain.content)
              }}
            >
              <X size={16} />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton label="编辑收获" onClick={() => setEditing(true)}>
              <Pencil size={16} />
            </IconButton>
            <IconButton label="删除收获" onClick={() => remove.mutate()}>
              <Trash2 size={16} />
            </IconButton>
          </>
        )}
      </div>
    </article>
  )
}

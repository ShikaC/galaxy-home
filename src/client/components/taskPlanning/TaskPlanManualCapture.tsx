import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { submitCapture } from "../../lib/capture.js"
import { Button } from "../ui/Button.js"
import { TextField } from "../ui/Field.js"

export function TaskPlanManualCapture({
  originalText,
  today,
}: {
  readonly originalText: string
  readonly today: string
}) {
  const cache = useQueryClient()
  const [title, setTitle] = useState("")
  const request = useRef({ id: crypto.randomUUID(), title: "" })
  const save = useMutation({
    mutationFn: () => {
      if (request.current.title !== title) request.current = { id: crypto.randomUUID(), title }
      return submitCapture({
        title,
        notes: originalText,
        requestId: request.current.id,
        localDate: today,
        placeOnToday: false,
      })
    },
    onSuccess: async () => {
      setTitle("")
      request.current = { id: crypto.randomUUID(), title: "" }
      await cache.invalidateQueries({ queryKey: ["items"] })
    },
  })
  return (
    <details className="task-plan-manual">
      <summary>不用 AI，手动拆分记录</summary>
      <p>
        从原文中逐项填写标题，保存到收集箱。原文会作为备注保留，之后可在任务详情补充重复规则与安排。
      </p>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim() && !save.isPending) save.mutate()
        }}
      >
        <TextField
          label="手动任务标题"
          required
          maxLength={240}
          value={title}
          disabled={save.isPending}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" disabled={!title.trim()} loading={save.isPending}>
          手动保存到收集箱
        </Button>
        {save.error ? (
          <p role="alert">{save.error.message} 标题仍保留，直接重试会复用此次保存标识。</p>
        ) : null}
        {save.isSuccess ? <p role="status">已保存，可继续记录下一项。</p> : null}
      </form>
    </details>
  )
}

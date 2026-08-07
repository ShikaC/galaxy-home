import { useMutation } from "@tanstack/react-query"
import { Check, X } from "lucide-react"
import { useEffect, useState } from "react"
import type { AiMemoryKind } from "../../shared/ai.js"
import { aiMemoryKindSchema, aiMemorySchema } from "../../shared/ai.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { Button } from "./ui/Button.js"

export function AiMemoryConfirmation({
  content,
  initialKind = "preference",
  onCancel,
  onSaved,
}: {
  readonly content: string
  readonly initialKind?: AiMemoryKind
  readonly onCancel: () => void
  readonly onSaved: () => void
}) {
  const [kind, setKind] = useState<AiMemoryKind>(initialKind)
  useEffect(() => {
    setKind(initialKind)
  }, [initialKind])
  const save = useMutation({
    mutationFn: () =>
      apiRequest("/api/ai/memories", aiMemorySchema, {
        method: "POST",
        body: jsonBody({ content, kind, confirmed: true }),
      }),
    onSuccess: onSaved,
  })
  return (
    <section aria-label="确认长期记忆" className="memory-confirmation">
      <strong>保存为长期记忆？</strong>
      <p>{content}</p>
      <label>
        <span>类型</span>
        <select
          onChange={(event) => setKind(aiMemoryKindSchema.parse(event.target.value))}
          value={kind}
        >
          <option value="preference">偏好</option>
          <option value="goal">目标</option>
          <option value="background">重要背景</option>
        </select>
      </label>
      <div>
        <Button onClick={onCancel} size="compact" variant="ghost">
          <X size={14} />
          取消
        </Button>
        <Button loading={save.isPending} onClick={() => save.mutate()} size="compact">
          <Check size={14} />
          确认保存
        </Button>
      </div>
      {save.isError ? <p className="inline-error">{save.error.message}</p> : null}
    </section>
  )
}

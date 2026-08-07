import { useMutation, useQueryClient } from "@tanstack/react-query"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { itemSchema } from "../../shared/items.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { useMeta } from "../lib/queries.js"
import { Button } from "./ui/Button.js"
import { TextArea, TextField } from "./ui/Field.js"
import { IconButton } from "./ui/IconButton.js"
import { DialogSurface } from "./ui/ModalSurface.js"
import { VoiceCapture } from "./VoiceCapture.js"

export function CaptureDialog({
  onClose,
  open,
}: {
  readonly onClose: () => void
  readonly open: boolean
}) {
  const client = useQueryClient()
  const meta = useMeta()
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  useEffect(() => {
    if (!open) {
      setTitle("")
      setNotes("")
    }
  }, [open])
  const capture = useMutation({
    mutationFn: () =>
      apiRequest("/api/items", itemSchema, {
        method: "POST",
        body: jsonBody({ title, notes: notes || undefined, categoryIds: [], projectIds: [] }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["items"] })
      onClose()
    },
  })
  if (!open) return null
  return (
    <DialogSurface ariaLabelledBy="capture-title" onClose={onClose}>
      <header className="dialog__header">
        <div>
          <p className="eyebrow">随手记</p>
          <h2 id="capture-title">先把这件事放下来</h2>
        </div>
        <IconButton label="关闭随手记" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          capture.mutate()
        }}
      >
        <TextField
          autoFocus
          label="标题"
          maxLength={240}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="此刻不想忘记什么？"
          value={title}
        />
        <TextArea
          label="备注（可选）"
          maxLength={10_000}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          value={notes}
        />
        <VoiceCapture
          configured={meta.data?.ai.configured ?? false}
          onText={(text) => setTitle(text)}
        />
        {capture.isError ? <p className="inline-error">{capture.error.message}</p> : null}
        <footer className="dialog__actions">
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button disabled={!title.trim()} loading={capture.isPending} type="submit">
            保存到收集箱
          </Button>
        </footer>
      </form>
    </DialogSurface>
  )
}

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowUp, Check, Plus, Rows3 } from "lucide-react"
import { useState } from "react"
import { apiRequest, jsonBody } from "../lib/api.js"
import { invalidateTaskQueries } from "../lib/mutations.js"
import { itemSchema } from "../lib/schemas.js"
import { useAppActions } from "./AppContext.js"
import { IconButton } from "./ui/IconButton.js"

export function InlineCapture() {
  const actions = useAppActions()
  const client = useQueryClient()
  const [title, setTitle] = useState("")
  const [requestId, setRequestId] = useState<string | null>(null)
  const capture = useMutation({
    mutationFn: (input: { readonly value: string; readonly requestId: string }) =>
      apiRequest("/api/items", itemSchema, {
        method: "POST",
        body: jsonBody({ title: input.value, requestId: input.requestId }),
      }),
    onSuccess: async () => {
      setTitle("")
      setRequestId(null)
      await invalidateTaskQueries(client)
      await client.invalidateQueries({ queryKey: ["search"] })
    },
  })
  const submit = () => {
    const value = title.trim()
    if (value === "" || capture.isPending) return
    // 同一草稿重试复用请求标识，网络结果未知时不会重复创建。
    const nextRequestId = requestId ?? crypto.randomUUID()
    setRequestId(nextRequestId)
    capture.mutate({ value, requestId: nextRequestId })
  }
  return (
    <div className="inline-capture">
      <form
        className="inline-capture__form"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Plus aria-hidden="true" className="inline-capture__mark" size={17} />
        <input
          aria-label="快速记下一件事"
          autoComplete="off"
          disabled={capture.isPending}
          maxLength={240}
          onChange={(event) => {
            setTitle(event.target.value)
            setRequestId(null)
            capture.reset()
          }}
          placeholder="记下一件事，回车放入收集箱"
          value={title}
        />
        <IconButton
          disabled={title.trim() === ""}
          label="保存快速记录"
          loading={capture.isPending}
          type="submit"
        >
          <ArrowUp aria-hidden="true" size={17} />
        </IconButton>
        <IconButton label="打开详细录入" onClick={actions.openCapture}>
          <Rows3 aria-hidden="true" size={16} />
        </IconButton>
      </form>
      <p aria-live="polite" className="inline-capture__feedback">
        {capture.isError ? (
          <span className="inline-error">{capture.error.message}</span>
        ) : capture.isSuccess ? (
          <span className="inline-capture__done">
            <Check aria-hidden="true" size={13} />
            已放入收集箱
          </span>
        ) : null}
      </p>
    </div>
  )
}

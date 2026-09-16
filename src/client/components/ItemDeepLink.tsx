import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import { itemIdSchema } from "../../shared/items.js"
import { apiRequest } from "../lib/api.js"
import { itemDetailSchema } from "../lib/schemas.js"
import { OrganizeDialog } from "./OrganizeDialog.js"
import { Button } from "./ui/Button.js"
import { DialogSurface } from "./ui/ModalSurface.js"
import { QueryFeedback } from "./ui/QueryFeedback.js"

export function ItemDeepLink() {
  const [parameters, setParameters] = useSearchParams()
  const requested = parameters.get("item")
  const parsed = requested === null ? null : itemIdSchema.safeParse(requested)
  const itemId = parsed?.success === true ? parsed.data : null
  const detail = useQuery({
    queryKey: ["items", "detail", itemId],
    queryFn: ({ signal }) =>
      apiRequest(`/api/items/${encodeURIComponent(itemId ?? "")}`, itemDetailSchema, { signal }),
    enabled: itemId !== null,
  })
  const close = () =>
    setParameters(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete("item")
        return next
      },
      { replace: true },
    )
  if (itemId === null) return null
  if (detail.data !== undefined)
    return <OrganizeDialog item={detail.data} mode="edit" onClose={close} />
  return (
    <DialogSurface ariaLabel="读取待办" onClose={close}>
      <QueryFeedback
        error={detail.error}
        pending={detail.isPending}
        retry={() => void detail.refetch()}
      />
      <div className="dialog__actions">
        <Button onClick={close} variant="ghost">
          关闭
        </Button>
      </div>
    </DialogSurface>
  )
}

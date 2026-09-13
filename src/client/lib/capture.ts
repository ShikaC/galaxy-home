import type { Item } from "../../shared/items.js"
import { apiRequest, jsonBody } from "./api.js"
import { itemSchema } from "./schemas.js"

export type CaptureDestination = "inbox" | "today" | "secondary"

export type CaptureDraft = {
  readonly localDate: string
  readonly notes: string
  readonly placeOnToday: boolean
  readonly requestId: string
  readonly title: string
}

export type CaptureResult = {
  readonly destination: CaptureDestination
  readonly item: Item
}

export async function submitCapture(draft: CaptureDraft): Promise<CaptureResult> {
  const item = await apiRequest("/api/items", itemSchema, {
    method: "POST",
    body: jsonBody({
      title: draft.title,
      notes: draft.notes || undefined,
      categoryIds: [],
      projectIds: [],
      requestId: draft.requestId,
      ...(draft.placeOnToday
        ? {
            today: {
              localDate: draft.localDate,
              isFocus: false,
              isSecondary: false,
            },
          }
        : {}),
    }),
  })
  return { destination: draft.placeOnToday ? "today" : "inbox", item }
}

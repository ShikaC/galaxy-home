import type { Item } from "../../shared/items.js"
import { ApiError, apiRequest, apiVoid, jsonBody } from "./api.js"
import { itemSchema } from "./schemas.js"

export type CaptureDestination = "inbox" | "today" | "secondary"

export type CaptureDraft = {
  readonly localDate: string
  readonly notes: string
  readonly placeOnToday: boolean
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
    }),
  })
  if (!draft.placeOnToday) return { destination: "inbox", item }
  try {
    await apiVoid(`/api/items/${item.id}/today`, {
      method: "PUT",
      body: jsonBody({ localDate: draft.localDate, isFocus: false, isSecondary: false }),
    })
    return { destination: "today", item }
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "TODAY_LIMIT") throw error
    await apiVoid(`/api/items/${item.id}/today`, {
      method: "PUT",
      body: jsonBody({ localDate: draft.localDate, isFocus: false, isSecondary: true }),
    })
    return { destination: "secondary", item }
  }
}

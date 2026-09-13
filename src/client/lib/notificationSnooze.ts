import { z } from "zod"

const pendingSchema = z.object({ scheduledAt: z.string(), requestId: z.uuid() }).readonly()
type PendingSnooze = z.infer<typeof pendingSchema>
const memory = new Map<string, PendingSnooze>()
const key = (eventId: string) => `galaxy:pending-snooze:${eventId}`

function readPending(eventId: string): PendingSnooze | undefined {
  try {
    const value = localStorage.getItem(key(eventId))
    return value === null ? memory.get(eventId) : pendingSchema.parse(JSON.parse(value))
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return memory.get(eventId)
  }
}

export function snoozeRequestId(reminder: {
  readonly id: string
  readonly scheduledAt: string
}): string {
  const pending = readPending(reminder.id)
  if (pending?.scheduledAt === reminder.scheduledAt) return pending.requestId
  const next = { scheduledAt: reminder.scheduledAt, requestId: crypto.randomUUID() }
  memory.set(reminder.id, next)
  try {
    localStorage.setItem(key(reminder.id), JSON.stringify(next))
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
  return next.requestId
}

export function clearPendingSnooze(eventId: string, requestId: string): void {
  if (readPending(eventId)?.requestId !== requestId) return
  memory.delete(eventId)
  try {
    localStorage.removeItem(key(eventId))
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
}

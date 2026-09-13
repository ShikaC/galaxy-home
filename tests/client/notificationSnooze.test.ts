import { afterEach, expect, it, vi } from "vitest"
import { clearPendingSnooze, snoozeRequestId } from "../../src/client/lib/notificationSnooze.js"

afterEach(() => {
  localStorage.clear()
})
it("restores the pending request identity after a module reload", async () => {
  // Given
  const reminder = { id: crypto.randomUUID(), scheduledAt: "2026-09-10T08:00:00.000Z" }
  const original = snoozeRequestId(reminder)
  vi.resetModules()
  // When
  const restarted = await import("../../src/client/lib/notificationSnooze.js")
  const replay = restarted.snoozeRequestId(reminder)
  // Then
  expect(replay).toBe(original)
})
it("creates a fresh intent after an acknowledged or newly scheduled reminder", () => {
  // Given
  const reminder = { id: crypto.randomUUID(), scheduledAt: "2026-09-10T08:00:00.000Z" }
  const original = snoozeRequestId(reminder)
  clearPendingSnooze(reminder.id, original)
  // When
  const fresh = snoozeRequestId(reminder)
  const later = snoozeRequestId({ ...reminder, scheduledAt: "2026-09-10T08:30:00.000Z" })
  // Then
  expect(fresh).not.toBe(original)
  expect(later).not.toBe(fresh)
})

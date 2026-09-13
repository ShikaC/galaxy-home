import { afterEach, describe, expect, it, vi } from "vitest"
import { mirrorDueReminderToSystem } from "../../src/client/lib/desktopNotify.js"

const notificationPlugin = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }))
vi.mock("@tauri-apps/plugin-notification", () => notificationPlugin)

afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe("desktop notification mirroring", () => {
  it("keeps the in-app fallback usable when the Windows notification API fails", async () => {
    notificationPlugin.isPermissionGranted.mockRejectedValueOnce(
      new Error("system notification unavailable"),
    )

    await expect(
      mirrorDueReminderToSystem({
        id: crypto.randomUUID(),
        title: "待办提醒：整理",
        detail: "截止时间 2026/8/12 09:00",
        scheduledAt: "2026-08-12T01:00:00.000Z",
      }),
    ).resolves.toBeUndefined()
    expect(notificationPlugin.requestPermission).not.toHaveBeenCalled()
    expect(notificationPlugin.sendNotification).not.toHaveBeenCalled()
  })
})

it("remembers a successful notification across module reloads and sends a snoozed occurrence again", async () => {
  // Given
  notificationPlugin.isPermissionGranted.mockResolvedValue(true)
  const reminder = {
    id: crypto.randomUUID(),
    title: "客户反馈",
    detail: "开始安排",
    scheduledAt: "2026-09-10T09:00:00.000Z",
  }
  await mirrorDueReminderToSystem(reminder)
  vi.resetModules()
  const restarted = await import("../../src/client/lib/desktopNotify.js")
  // When
  await restarted.mirrorDueReminderToSystem(reminder)
  await restarted.mirrorDueReminderToSystem({
    ...reminder,
    scheduledAt: "2026-09-10T09:30:00.000Z",
  })
  // Then
  expect(notificationPlugin.sendNotification).toHaveBeenCalledTimes(2)
})
it("does not mark denied or failed delivery as delivered", async () => {
  // Given
  notificationPlugin.isPermissionGranted.mockResolvedValueOnce(false).mockResolvedValue(true)
  notificationPlugin.requestPermission.mockResolvedValueOnce("denied")
  const reminder = {
    id: crypto.randomUUID(),
    title: "客户反馈",
    detail: "开始安排",
    scheduledAt: "2026-09-10T09:00:00.000Z",
  }
  await mirrorDueReminderToSystem(reminder)
  notificationPlugin.sendNotification.mockImplementationOnce(() => {
    throw new Error("Unavailable")
  })
  await mirrorDueReminderToSystem(reminder)
  // When
  await mirrorDueReminderToSystem(reminder)
  await mirrorDueReminderToSystem(reminder)
  // Then
  expect(notificationPlugin.sendNotification).toHaveBeenCalledTimes(2)
})
it("coalesces simultaneous attempts for the same scheduled event", async () => {
  // Given
  notificationPlugin.isPermissionGranted.mockResolvedValue(true)
  const reminder = {
    id: crypto.randomUUID(),
    title: "客户反馈",
    detail: "开始安排",
    scheduledAt: "2026-09-10T09:00:00.000Z",
  }
  // When
  await Promise.all([mirrorDueReminderToSystem(reminder), mirrorDueReminderToSystem(reminder)])
  // Then
  expect(notificationPlugin.sendNotification).toHaveBeenCalledTimes(1)
})

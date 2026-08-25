import { afterEach, describe, expect, it, vi } from "vitest"
import { mirrorDueReminderToSystem } from "../../src/client/lib/desktopNotify.js"

const notificationPlugin = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }))
vi.mock("@tauri-apps/plugin-notification", () => notificationPlugin)

afterEach(() => vi.clearAllMocks())

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
      }),
    ).resolves.toBeUndefined()
    expect(notificationPlugin.requestPermission).not.toHaveBeenCalled()
    expect(notificationPlugin.sendNotification).not.toHaveBeenCalled()
  })
})

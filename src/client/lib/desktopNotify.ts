import { isTauri } from "@tauri-apps/api/core"

export async function mirrorDueReminderToSystem(reminder: {
  readonly id: string
  readonly title: string
  readonly detail: string
}): Promise<void> {
  if (!isTauri()) return
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    )
    let granted = await isPermissionGranted()
    if (!granted) {
      granted = (await requestPermission()) === "granted"
    }
    if (!granted) return
    sendNotification({
      title: reminder.title,
      body: reminder.detail,
    })
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
}

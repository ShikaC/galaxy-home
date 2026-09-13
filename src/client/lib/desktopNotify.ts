import { isTauri } from "@tauri-apps/api/core"

type SystemReminder = {
  readonly id: string
  readonly scheduledAt: string
  readonly title: string
  readonly detail: string
}

const pending = new Map<string, Promise<void>>()
const submitted = new Map<string, string>()
const storageKey = (id: string) => `galaxy:system-reminder:${id}`

function lastSubmission(id: string): string | null {
  try {
    return localStorage.getItem(storageKey(id)) ?? submitted.get(id) ?? null
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return submitted.get(id) ?? null
  }
}

async function submitReminder(reminder: SystemReminder): Promise<void> {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    )
    const granted = (await isPermissionGranted()) || (await requestPermission()) === "granted"
    if (!granted) return
    sendNotification({ title: reminder.title, body: reminder.detail })
    submitted.set(reminder.id, reminder.scheduledAt)
    localStorage.setItem(storageKey(reminder.id), reminder.scheduledAt)
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
}

export async function mirrorDueReminderToSystem(reminder: SystemReminder): Promise<void> {
  if (!isTauri() || lastSubmission(reminder.id) === reminder.scheduledAt) return
  const identity = `${reminder.id}:${reminder.scheduledAt}`
  const existing = pending.get(identity)
  if (existing !== undefined) return existing
  const submission = submitReminder(reminder)
  pending.set(identity, submission)
  try {
    await submission
  } finally {
    pending.delete(identity)
  }
}

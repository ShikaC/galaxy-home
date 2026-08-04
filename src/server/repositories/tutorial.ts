import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"

export type TutorialState = { readonly guideDismissed: boolean }

export function getTutorialState(database: DatabaseSync): TutorialState {
  const row = z
    .object({ guide_dismissed: z.number().int() })
    .parse(database.prepare("SELECT guide_dismissed FROM tutorial_state WHERE id = 1").get())
  return { guideDismissed: row.guide_dismissed === 1 }
}

export function dismissTutorialGuide(database: DatabaseSync): void {
  database
    .prepare("UPDATE tutorial_state SET guide_dismissed = 1, updated_at = ? WHERE id = 1")
    .run(new Date().toISOString())
}

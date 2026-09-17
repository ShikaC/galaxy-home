import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { moveToTrash } from "./trash.js"

const countSchema = z.object({ count: z.number() })
const tutorialItemSchema = z.object({ id: z.uuid(), title: z.string() })
const tutorialHabitSchema = z.object({ id: z.uuid(), name: z.string() })

export type TutorialState = {
  readonly exampleCount: number
  readonly guideDismissed: boolean
}

function countActiveTutorialExamples(database: DatabaseSync): number {
  const items = countSchema.parse(
    database
      .prepare("SELECT COUNT(*) AS count FROM items WHERE is_tutorial = 1 AND deleted_at IS NULL")
      .get(),
  )
  const habits = countSchema.parse(
    database
      .prepare("SELECT COUNT(*) AS count FROM habits WHERE is_tutorial = 1 AND deleted_at IS NULL")
      .get(),
  )
  return items.count + habits.count
}

export function getTutorialState(database: DatabaseSync): TutorialState {
  const row = z
    .object({ guide_dismissed: z.number().int() })
    .parse(database.prepare("SELECT guide_dismissed FROM tutorial_state WHERE id = 1").get())
  return {
    exampleCount: countActiveTutorialExamples(database),
    guideDismissed: row.guide_dismissed === 1,
  }
}

export function dismissTutorialGuide(database: DatabaseSync): void {
  database
    .prepare("UPDATE tutorial_state SET guide_dismissed = 1, updated_at = ? WHERE id = 1")
    .run(new Date().toISOString())
}

export function clearTutorialExamples(database: DatabaseSync, now = new Date()): void {
  const items = z
    .array(tutorialItemSchema)
    .parse(
      database
        .prepare("SELECT id, title FROM items WHERE is_tutorial = 1 AND deleted_at IS NULL")
        .all(),
    )
  const habits = z
    .array(tutorialHabitSchema)
    .parse(
      database
        .prepare("SELECT id, name FROM habits WHERE is_tutorial = 1 AND deleted_at IS NULL")
        .all(),
    )
  for (const item of items) {
    moveToTrash(database, "item", item.id, item.title, now)
  }
  for (const habit of habits) {
    moveToTrash(database, "habit", habit.id, habit.name, now)
  }
}

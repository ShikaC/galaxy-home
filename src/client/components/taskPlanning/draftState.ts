import { z } from "zod"
import {
  captureProposalSchema,
  captureSeriesDraftSchema,
  captureTaskDraftSchema,
  replanChangeSchema,
  replanProposalSchema,
  taskPlanProposalSchema,
} from "../../../shared/taskPlanning.js"

const draftSlot = z.object({ startAt: z.string(), endAt: z.string(), timezone: z.string() })
const draftCapture = captureProposalSchema.unwrap().extend({
  tasks: z.array(
    captureTaskDraftSchema.unwrap().extend({
      title: z.string(),
      notes: z.string().nullable(),
      dueDate: z.string().nullable(),
      estimatedMinutes: z.number().nullable(),
    }),
  ),
  series: z.array(
    captureSeriesDraftSchema.unwrap().extend({
      title: z.string(),
      notes: z.string().nullable(),
      startDate: z.string(),
      dueTime: z.string().nullable(),
      estimatedMinutes: z.number().nullable(),
    }),
  ),
})
const [keep, move, create] = replanChangeSchema.options
const draftReplan = replanProposalSchema.unwrap().extend({
  changes: z.array(
    z.discriminatedUnion("action", [
      keep.unwrap().extend({ reason: z.string() }),
      move.unwrap().extend({ after: draftSlot, reason: z.string() }),
      create.unwrap().extend({ title: z.string(), after: draftSlot, reason: z.string() }),
    ]),
  ),
})

export const taskPlanEditorStateSchema = z.object({
  proposal: z.discriminatedUnion("kind", [draftCapture, draftReplan]).nullable(),
  baseline: z.object({
    proposal: taskPlanProposalSchema.nullable(),
    revision: z.number().int(),
    fingerprint: z.string().nullable(),
  }),
})

import { type PlanInput, planInputSchema } from "../../shared/planning.js"

export function planRequest(
  previous: PlanInput | null,
  candidate: PlanInput,
  sameSource = true,
): PlanInput {
  const input = planInputSchema.parse(candidate)
  if (sameSource && previous) {
    const prior = planInputSchema.parse(previous)
    if (JSON.stringify({ ...prior, requestId: "" }) === JSON.stringify({ ...input, requestId: "" }))
      return prior
  }
  return { ...input, requestId: crypto.randomUUID() }
}

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { parseArgs } from "node:util"
import { evaluationCases } from "./cases.js"
import { retrievalBenchmark } from "./retrievalBenchmark.js"
import { evaluateCase } from "./runner.js"

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    secrets: { type: "string" },
    repetitions: { type: "string", default: "1" },
    output: { type: "string", default: ".omo/evidence/evaluation/latest.json" },
    filter: { type: "string" },
  },
})
const repetitions = Number(values.repetitions)
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10)
  throw new Error("repetitions must be an integer from 1 to 10")
if (values.live && !values.secrets)
  throw new Error(
    "Live evaluations require --secrets /absolute/path/to/secrets.json. Fixture mode never calls a provider.",
  )
const mode = values.live ? "live" : "fixture"
const cases = evaluationCases.filter(
  (scenario) => values.filter === undefined || scenario.id.includes(values.filter),
)
if (cases.length === 0) throw new Error("No evaluation cases match the filter")
const results: Awaited<ReturnType<typeof evaluateCase>>[] = []
for (const scenario of cases) {
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const result = await evaluateCase(scenario, mode, values.secrets ?? "", repetition)
    results.push(result)
    process.stdout.write(`${result.passed ? "PASS" : "FAIL"} ${result.id} #${repetition}\n`)
  }
}
const duration = results.map((result) => result.durationMs).sort((a, b) => a - b)
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode,
  dataset: "workspace-actions-30-v1",
  promptVersion: "workspace-plan-v1",
  unmeasured: [
    "general semantic correctness",
    "real user effectiveness",
    "prompt injection resistance",
  ],
  checkSemantics:
    "null means not exercised; topic and live injection title checks are lexical heuristics, not semantic or security guarantees",
  evaluationScope:
    "Seeded synthetic SQLite tasks; deterministic state and topic/citation graders. Does not measure general semantic correctness or real-user effectiveness.",
  cases: cases.length,
  repetitions,
  trials: results.length,
  passed: results.filter((result) => result.passed).length,
  trialPassRate: results.filter((result) => result.passed).length / results.length,
  allRepetitionsPassRate:
    cases.filter((scenario) =>
      results.filter((result) => result.id === scenario.id).every((result) => result.passed),
    ).length / cases.length,
  p50Ms: duration[Math.max(0, Math.ceil(duration.length * 0.5) - 1)],
  p95Ms: duration[Math.max(0, Math.ceil(duration.length * 0.95) - 1)],
  inputTokens: results.every((result) =>
    result.attempts.every((attempt) => attempt.inputTokens !== null),
  )
    ? results.reduce(
        (sum, result) =>
          sum + result.attempts.reduce((tokens, attempt) => tokens + (attempt.inputTokens ?? 0), 0),
        0,
      )
    : null,
  outputTokens: results.every((result) =>
    result.attempts.every((attempt) => attempt.outputTokens !== null),
  )
    ? results.reduce(
        (sum, result) =>
          sum +
          result.attempts.reduce((tokens, attempt) => tokens + (attempt.outputTokens ?? 0), 0),
        0,
      )
    : null,
  cost: null,
  retrieval: retrievalBenchmark(),
  results,
}
const output = resolve(values.output)
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`\n${mode}: ${report.passed}/${report.trials} passed. Report: ${output}\n`)
if (report.passed !== report.trials) process.exitCode = 1

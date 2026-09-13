import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig } from "@playwright/test"

const root = import.meta.dirname
const evidence = join(root, ".omo/evidence/task-core/scenario")
const data =
  process.env["GALAXY_TASK_SCENARIO_DATA_DIR"] ??
  mkdtempSync(join(tmpdir(), "galaxy-task-scenario-"))
process.env["GALAXY_TASK_SCENARIO_DATA_DIR"] = data
const receiptPath = join(data, "qa-receipt.json")
const apiPort = Number(process.env["GALAXY_E2E_COMPACT_API_PORT"] ?? 53417)
const webPort = Number(process.env["GALAXY_E2E_COMPACT_WEB_PORT"] ?? 53418)
const sourceFiles = readdirSync(join(root, "src"), { recursive: true })
  .filter((path) => /\.(ts|tsx|css)$/.test(path))
  .sort()
const sourceDigest = createHash("sha256")
for (const path of sourceFiles)
  sourceDigest.update(path).update(readFileSync(join(root, "src", path)))
mkdirSync(evidence, { recursive: true })
if (!existsSync(receiptPath))
  writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        sourceFingerprint: sourceDigest.digest("hex"),
        sourceFileCount: sourceFiles.length,
        data,
        apiPort,
        webPort,
        clock: "2026-09-10T01:00:00.000Z",
        provider: "synthetic local HTTP fixture",
      },
      null,
      2,
    ),
  )
writeFileSync(join(evidence, "environment.json"), readFileSync(receiptPath))
export default defineConfig({
  testDir: join(root, "tests/e2e"),
  testMatch: "task-time-*.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  outputDir: join(evidence, "test-results"),
  reporter: [["list"], ["json", { outputFile: join(evidence, "results.json") }]],
  use: {
    actionTimeout: 15_000,
    baseURL: `http://127.0.0.1:${webPort}`,
    timezoneId: "Asia/Shanghai",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    cwd: root,
    // Wait for the API process as well as Vite. `npm run dev` starts both
    // concurrently, and the browser can otherwise begin before migrations
    // finish, making the first API request fail intermittently.
    url: `http://127.0.0.1:${apiPort}/api/items?view=active&localDate=2026-09-10`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      API_PORT: String(apiPort),
      VITE_API_PORT: String(apiPort),
      VITE_PORT: String(webPort),
      GALAXY_DATA_DIR: data,
      GALAXY_CLOCK_NOW: "2026-09-10T01:00:00.000Z",
      VITE_DISABLE_REACT_DEVTOOLS: "1",
    },
  },
})

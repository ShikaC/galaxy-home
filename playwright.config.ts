import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig, devices } from "@playwright/test"

const compactDataDirectory = mkdtempSync(join(tmpdir(), "galaxy-home-e2e-compact-"))
const wideDataDirectory = mkdtempSync(join(tmpdir(), "galaxy-home-e2e-wide-"))

function configuredPort(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`Playwright environment ${name} is not a valid TCP port`)
  return port
}

const compactApiPort = configuredPort("GALAXY_E2E_COMPACT_API_PORT", 3011)
const compactWebPort = configuredPort("GALAXY_E2E_COMPACT_WEB_PORT", 5183)
const wideApiPort = configuredPort("GALAXY_E2E_WIDE_API_PORT", 3012)
const wideWebPort = configuredPort("GALAXY_E2E_WIDE_WEB_PORT", 5184)

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: ".omo/evidence/playwright-report" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${compactWebPort}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-compact",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${compactWebPort}`,
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "desktop-wide",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${wideWebPort}`,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      env: {
        API_PORT: String(compactApiPort),
        VITE_API_PORT: String(compactApiPort),
        VITE_PORT: String(compactWebPort),
        GALAXY_DATA_DIR: compactDataDirectory,
        GALAXY_CLOCK_NOW: "2026-08-05T14:00:00.000Z",
        VITE_DISABLE_REACT_DEVTOOLS: "1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `http://127.0.0.1:${compactWebPort}`,
    },
    {
      command: "npm run dev",
      env: {
        API_PORT: String(wideApiPort),
        VITE_API_PORT: String(wideApiPort),
        VITE_PORT: String(wideWebPort),
        GALAXY_DATA_DIR: wideDataDirectory,
        GALAXY_CLOCK_NOW: "2026-08-05T14:00:00.000Z",
        VITE_DISABLE_REACT_DEVTOOLS: "1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `http://127.0.0.1:${wideWebPort}`,
    },
  ],
})

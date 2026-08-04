import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig, devices } from "@playwright/test"

const e2eDataDirectory = mkdtempSync(join(tmpdir(), "galaxy-home-e2e-"))

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
    baseURL: "http://127.0.0.1:5183",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-compact",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
    {
      name: "desktop-wide",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `API_PORT=3011 VITE_API_PORT=3011 VITE_PORT=5183 GALAXY_DATA_DIR=${e2eDataDirectory} VITE_DISABLE_REACT_DEVTOOLS=1 npm run dev`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:5183",
  },
})

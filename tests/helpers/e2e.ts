import { test as base, expect } from "@playwright/test"

export { type APIRequestContext, expect, type Locator, type Page } from "@playwright/test"
export const E2E_LOCAL_DATE = "2026-08-05"
export const test = base.extend<{ readonly apiReady: undefined }>({
  apiReady: [
    async ({ request }, use) => {
      await expect
        .poll(
          async () => {
            try {
              return (await request.get("/api/health")).status()
            } catch {
              return 0
            }
          },
          { timeout: 15000 },
        )
        .toBe(200)
      await use(undefined)
    },
    { auto: true },
  ],
  page: async ({ page, request }, use) => {
    await page.clock.install({ time: new Date("2026-08-05T14:00:00.000Z") })
    const settings = await request.patch("/api/settings", { data: { timezone: "Asia/Shanghai" } })
    if (!settings.ok()) throw new Error("Could not reset fixture timezone")
    await use(page)
  },
})

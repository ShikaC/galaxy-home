import type { Page } from "@playwright/test"

export async function expandFormDisclosure(page: Page, label: string): Promise<void> {
  await page.locator("summary").filter({ hasText: label }).click()
}

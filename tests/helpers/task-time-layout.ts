import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page } from "@playwright/test"

export async function assertTaskTimeLayout(page: Page, state: string, name: string): Promise<void> {
  const evidence: Record<string, unknown> = { state, name }
  if (state === "reminder-snooze-error") {
    const alert = page.locator(".reminder-banner").getByRole("alert")
    await expect(alert).toBeVisible()
    await expect(alert).toContainText("操作结果未确认")
    evidence["reminderAlert"] = await alert.boundingBox()
  }
  if (state === "task-detail-subtask") {
    const title = page.locator(".subtask-row__title").first()
    const shape = await title.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      rowHeight: element.closest(".subtask-row")?.getBoundingClientRect().height ?? 0,
    }))
    expect(
      shape.width,
      "subtask text must have room for horizontal Chinese reading",
    ).toBeGreaterThanOrEqual(120)
    expect(shape.height, "scenario subtask title must fit within three lines").toBeLessThanOrEqual(
      shape.lineHeight * 3,
    )
    expect(shape.rowHeight, "scenario subtask row must remain scannable").toBeLessThanOrEqual(
      shape.lineHeight * 5,
    )
    evidence["subtask"] = shape
  }
  if (state === "series-create" || state === "series-manage") {
    const fields = await page
      .locator(".task-repeat-fields .field__control")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect()
          const field = element.closest(".field")?.getBoundingClientRect()
          const style = getComputedStyle(element)
          const canvas = document.createElement("canvas").getContext("2d")
          if (canvas === null) throw new Error("Text measurement unavailable")
          canvas.font = style.font
          return {
            label: element.closest(".field")?.querySelector(".field__label")?.textContent,
            fitsField:
              field !== undefined &&
              bounds.left >= field.left - 1 &&
              bounds.right <= field.right + 1,
            selectedTextWidth:
              element instanceof HTMLSelectElement
                ? canvas.measureText(element.selectedOptions[0]?.textContent ?? "").width
                : 0,
            availableTextWidth:
              bounds.width -
              Number.parseFloat(style.paddingLeft) -
              Number.parseFloat(style.paddingRight) -
              24,
          }
        }),
      )
    expect(fields.length).toBeGreaterThan(0)
    for (const field of fields) {
      expect(field.fitsField, `${field.label} must align inside its field`).toBe(true)
      expect(
        field.selectedTextWidth,
        `${field.label} selected option must fit`,
      ).toBeLessThanOrEqual(field.availableTextWidth)
    }
    evidence["seriesFields"] = fields
  }
  const directory = join(process.cwd(), ".omo/evidence/task-core/scenario/layout")
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `${name}.json`), JSON.stringify(evidence, null, 2))
}

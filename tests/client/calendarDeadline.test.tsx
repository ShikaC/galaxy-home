import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { CalendarDeadline } from "../../src/client/components/calendar/CalendarDeadline.js"

afterEach(cleanup)

it("shows a UTC deadline as the user's local date and time", () => {
  // Given
  const item = { dueDate: null, dueAt: "2026-09-10T01:30:00.000Z" }
  // When
  render(<CalendarDeadline item={item} timezone="Asia/Shanghai" />)
  // Then
  expect(screen.getByText("2026-09-10")).toBeInTheDocument()
  expect(screen.getByText("09:30 截止")).toBeInTheDocument()
  expect(document.querySelector("time")).toHaveAttribute("datetime", item.dueAt)
})

it("moves the displayed date across midnight for a different timezone", () => {
  // Given
  const item = { dueDate: null, dueAt: "2026-09-10T01:30:00.000Z" }
  // When
  render(<CalendarDeadline item={item} timezone="America/Los_Angeles" />)
  // Then
  expect(screen.getByText("2026-09-09")).toBeInTheDocument()
  expect(screen.getByText("18:30 截止")).toBeInTheDocument()
})

it("preserves a date-only deadline without inventing a clock time", () => {
  // Given
  const item = { dueDate: "2026-09-11", dueAt: null }
  // When
  render(<CalendarDeadline item={item} timezone="Asia/Shanghai" />)
  // Then
  expect(screen.getByText("2026-09-11")).toBeInTheDocument()
  expect(screen.getByText("日期截止")).toBeInTheDocument()
})

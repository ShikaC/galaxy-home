import { describe, expect, it } from "vitest"
import { MORNING_FOCUS_CLAUSE, morningReminderCopy } from "../../src/shared/morningReminder.js"

describe("morningReminderCopy", () => {
  it("keeps the focus clause so the banner can wrap it", () => {
    expect(MORNING_FOCUS_CLAUSE).toBe("或保留一个足够小的今日重点。")
  })

  it("points at capture when the inbox is empty", () => {
    expect(
      morningReminderCopy({
        focusTitle: null,
        inboxCount: 0,
        primaryCount: 0,
        completedTodayCount: 0,
      }),
    ).toEqual({
      title: "今天最想推进什么？",
      detail: `记下此刻想到的一件事，${MORNING_FOCUS_CLAUSE}`,
    })
  })

  it("points at the inbox when something is waiting there", () => {
    expect(
      morningReminderCopy({
        focusTitle: null,
        inboxCount: 2,
        primaryCount: 0,
        completedTodayCount: 0,
      }),
    ).toEqual({
      title: "今天最想推进什么？",
      detail: `从收集箱选择一件，${MORNING_FOCUS_CLAUSE}`,
    })
  })

  it("names the focus item when one is set", () => {
    expect(
      morningReminderCopy({
        focusTitle: "推进 React",
        inboxCount: 4,
        primaryCount: 1,
        completedTodayCount: 0,
      }).title,
    ).toBe("今日重点已就位")
  })

  it("stops nagging for a next item after today already moved", () => {
    expect(
      morningReminderCopy({
        focusTitle: null,
        inboxCount: 2,
        primaryCount: 0,
        completedTodayCount: 4,
      }),
    ).toEqual({
      title: "今天已经推进过了",
      detail: "想再做一件可以从收集箱挑，也可以先停在这里。",
    })
  })
})

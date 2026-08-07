import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  copyHabit,
  createHabit,
  listHabits,
  recordHabit,
  setHabitLog,
  undoHabit,
  updateHabit,
} from "../../src/server/repositories/habits.js"

const temporaryDirectories: string[] = []
let database: DatabaseSync

beforeEach(() => {
  const directory = mkdtempSync(join(tmpdir(), "galaxy-home-habits-"))
  temporaryDirectories.push(directory)
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
})

afterEach(() => {
  database.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("habit repository", () => {
  it("keeps over-target counts and only undoes the latest increment", () => {
    // Given
    const habit = createHabit(database, {
      name: "喝水",
      type: "count",
      targetCount: 2,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [],
    })

    // When
    recordHabit(database, habit.id, "2026-08-04")
    recordHabit(database, habit.id, "2026-08-04")
    recordHabit(database, habit.id, "2026-08-04")
    undoHabit(database, habit.id, "2026-08-04")

    // Then
    const updated = listHabits(database, "2026-08-04")[0]
    expect(updated?.currentCount).toBe(2)
    expect(updated?.completedToday).toBe(true)
    expect(updated?.totalCheckIns).toBe(1)
  })

  it("skips rest and leave dates when calculating a daily streak", () => {
    // Given
    const habit = createHabit(database, {
      name: "阅读",
      type: "check",
      targetCount: 1,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [0],
    })
    setHabitLog(database, {
      habitId: habit.id,
      localDate: "2026-08-01",
      count: 1,
      status: "active",
      corrected: true,
    })
    setHabitLog(database, {
      habitId: habit.id,
      localDate: "2026-08-03",
      count: 0,
      status: "leave",
      corrected: true,
    })

    // When
    recordHabit(database, habit.id, "2026-08-04")

    // Then
    expect(listHabits(database, "2026-08-04")[0]?.streak).toBe(2)
  })

  it("rejects recording on a rest day unless the log is an explicit correction", () => {
    const habit = createHabit(database, {
      name: "休息日阅读",
      type: "check",
      targetCount: 1,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [3],
    })

    expect(() => recordHabit(database, habit.id, "2026-08-05")).toThrowError(/休息日/)
    expect(() =>
      setHabitLog(database, {
        habitId: habit.id,
        localDate: "2026-08-05",
        count: 1,
        status: "active",
        corrected: false,
      }),
    ).toThrowError(/休息日/)

    setHabitLog(database, {
      habitId: habit.id,
      localDate: "2026-08-05",
      count: 1,
      status: "active",
      corrected: true,
    })
    expect(listHabits(database, "2026-08-05")[0]?.currentCount).toBe(1)
  })

  it("counts weekly target progress inside the current Monday-to-Sunday week", () => {
    const habit = createHabit(database, {
      name: "本周阅读",
      type: "check",
      targetCount: 1,
      frequencyType: "weekly",
      weeklyTarget: 3,
      restDays: [],
    })
    recordHabit(database, habit.id, "2026-08-03")
    recordHabit(database, habit.id, "2026-08-04")
    recordHabit(database, habit.id, "2026-08-02")

    expect(listHabits(database, "2026-08-04")[0]?.weeklyCount).toBe(2)
  })

  it("marks rest, leave, corrected, and completed weekly days for today's schedule", () => {
    const daily = createHabit(database, {
      name: "晨间散步",
      type: "check",
      targetCount: 1,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [2],
    })
    const weekly = createHabit(database, {
      name: "力量训练",
      type: "check",
      targetCount: 1,
      frequencyType: "weekly",
      weeklyTarget: 1,
      restDays: [],
    })
    setHabitLog(database, {
      habitId: daily.id,
      localDate: "2026-08-03",
      count: 0,
      status: "leave",
      corrected: true,
    })
    setHabitLog(database, {
      habitId: weekly.id,
      localDate: "2026-08-03",
      count: 1,
      status: "active",
      corrected: true,
    })

    const monday = listHabits(database, "2026-08-03")
    const tuesday = listHabits(database, "2026-08-04")

    expect(monday.find((habit) => habit.id === daily.id)).toMatchObject({
      correctedToday: true,
      scheduledToday: false,
      todayStatus: "leave",
    })
    expect(tuesday.find((habit) => habit.id === daily.id)).toMatchObject({
      isRestDay: true,
      scheduledToday: false,
    })
    expect(tuesday.find((habit) => habit.id === weekly.id)?.scheduledToday).toBe(false)
  })

  it("turns tutorial habits into real data when editing or copying", () => {
    const tutorial = createHabit(database, {
      name: "教学习惯",
      type: "check",
      targetCount: 1,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [],
    })
    database.prepare("UPDATE habits SET is_tutorial = 1 WHERE id = ?").run(tutorial.id)

    const updated = updateHabit(database, tutorial.id, {
      name: "我的习惯",
      type: "count",
      targetCount: 3,
      frequencyType: "daily",
      weeklyTarget: null,
      restDays: [0],
    })
    database.prepare("UPDATE habits SET is_tutorial = 1 WHERE id = ?").run(tutorial.id)
    const copied = copyHabit(database, tutorial.id)

    expect(updated).toMatchObject({ isTutorial: false, name: "我的习惯", targetCount: 3 })
    expect(copied).toMatchObject({ isTutorial: false, name: "我的习惯 副本" })
  })
})

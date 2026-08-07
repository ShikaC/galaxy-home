import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  completeProjectStage,
  updateProject,
} from "../../src/server/repositories/projectLifecycle.js"
import {
  advanceProject,
  createProject,
  getProject,
  listProjects,
} from "../../src/server/repositories/projects.js"

let database: DatabaseSync
let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "galaxy-home-projects-"))
  database = openDatabase(join(directory, "app.sqlite"))
  migrateDatabase(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { force: true, recursive: true })
})

describe("project repository", () => {
  it("only exposes current and next work and advances manually with feedback", () => {
    const project = createProject(database, {
      name: "整理书房",
      desiredOutcome: "每天都能直接坐下阅读",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "清出工作面",
      currentTask: "收走桌面杂物",
      nextTask: "擦净桌面",
    })
    expect(project.currentTask?.title).toBe("收走桌面杂物")
    expect(project.nextTask?.title).toBe("擦净桌面")

    advanceProject(database, project.id, {
      outcome: "已经分箱",
      obstacle: "有些物品暂时没位置",
      nextTask: "为未归类物品贴标签",
    })
    const advanced = getProject(database, project.id)
    expect(advanced.currentTask?.title).toBe("擦净桌面")
    expect(advanced.nextTask?.title).toBe("为未归类物品贴标签")
    expect(advanced.completedCount).toBe(1)
    expect(advanced.recentProgress[0]).toMatchObject({
      obstacle: "有些物品暂时没位置",
      outcome: "已经分箱",
      taskTitle: "收走桌面杂物",
    })
  })

  it("collapses similar same-day progress entries in recentProgress", () => {
    const project = createProject(database, {
      name: "学习React",
      desiredOutcome: "能独立做组件",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "迈出第一步",
      currentTask: "学 Props",
      nextTask: "学 State",
    })
    const now = "2026-08-07T10:00:00.000Z"
    const insert = database.prepare(
      `INSERT INTO project_feedback (id, project_id, task_id, outcome, obstacle, created_at)
       VALUES (?, ?, NULL, ?, NULL, ?)`,
    )
    insert.run(
      crypto.randomUUID(),
      project.id,
      "先学习 React 组件、Props 与 State 的基本概念，然后完成一个可接收 Props 并通过 State 控制按钮计数的简单组件。完成后记录：组件接收了哪些 Props。",
      now,
    )
    insert.run(
      crypto.randomUUID(),
      project.id,
      "先学习 React 组件、Props 与 State 的基本概念，并完成一个可接收 Props、通过 State 控制按钮计数的简单组件。",
      "2026-08-07T11:00:00.000Z",
    )
    insert.run(crypto.randomUUID(), project.id, "搭建 React 学习环境并了解 JSX", "2026-08-07T12:00:00.000Z")
    const recent = getProject(database, project.id).recentProgress
    expect(recent).toHaveLength(2)
    expect(recent.map((entry) => entry.outcome)).toEqual([
      "搭建 React 学习环境并了解 JSX",
      "先学习 React 组件、Props 与 State 的基本概念，并完成一个可接收 Props、通过 State 控制按钮计数的简单组件。",
    ])
  })

  it("manually updates every project field and keeps pinned projects first", () => {
    const first = createProject(database, {
      name: "搬家",
      desiredOutcome: "搬入新家",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "整理",
      currentTask: "整理书籍",
      nextTask: "整理衣物",
    })
    createProject(database, {
      name: "读书",
      desiredOutcome: "读完一本书",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "开始",
      currentTask: "读第一章",
      nextTask: "记笔记",
    })

    const updated = updateProject(database, first.id, {
      name: "九月搬家",
      desiredOutcome: "在九月前顺利入住",
      reason: "通勤更近",
      notes: "优先整理书房",
      deadlineDate: "2026-09-01",
      status: "paused",
      progress: 35,
      pinned: true,
      stageTitle: "打包书房",
      currentTask: "准备纸箱",
      nextTask: "分类书籍",
    })

    expect(updated).toMatchObject({
      currentTask: { source: "manual", title: "准备纸箱" },
      deadlineDate: "2026-09-01",
      name: "九月搬家",
      nextTask: { source: "manual", title: "分类书籍" },
      pinned: true,
      progress: 35,
      progressSource: "manual",
      stageTitle: "打包书房",
      status: "paused",
    })
    expect(listProjects(database)[0]?.id).toBe(first.id)
  })

  it("closes a finished stage and exposes it on the project timeline", () => {
    const project = createProject(database, {
      name: "搭建个人站",
      desiredOutcome: "发布可访问的首页",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "准备内容",
      currentTask: "写自我介绍",
      nextTask: "挑选作品",
    })
    advanceProject(database, project.id, {
      outcome: "介绍已完成",
      obstacle: null,
      nextTask: null,
    })
    advanceProject(database, project.id, {
      outcome: "已选好三个作品",
      obstacle: null,
      nextTask: null,
    })

    completeProjectStage(database, project.id, {
      outcome: "首页文案齐备",
      stageTitle: "制作首页",
      currentTask: "建立页面结构",
      nextTask: "添加作品内容",
    })

    const advanced = getProject(database, project.id)
    expect(advanced.stageTitle).toBe("制作首页")
    expect(advanced.completedStages[0]).toMatchObject({
      outcome: "首页文案齐备",
      title: "准备内容",
    })
    expect(advanced.completedStages[0]?.tasks.map((task) => task.title)).toEqual([
      "写自我介绍",
      "挑选作品",
    ])
  })
})

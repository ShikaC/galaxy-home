import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import { listAiActions, undoAiAction } from "../../src/server/repositories/aiActions.js"
import {
  appendProjectAiAnswer,
  applyProjectAiFeedback,
  applyProjectAiPlan,
  getProjectAiSession,
  startProjectAiSession,
} from "../../src/server/repositories/projectAi.js"
import { updateProject } from "../../src/server/repositories/projectLifecycle.js"
import { createProject, getProject } from "../../src/server/repositories/projects.js"

let directory = ""

afterEach(() => {
  if (directory !== "") rmSync(directory, { force: true, recursive: true })
  directory = ""
})

describe("project AI action history", () => {
  it("records and restores plan application and feedback changes", () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-project-actions-"))
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const project = createProject(database, {
      name: "准备搬家",
      desiredOutcome: "顺利入住新家",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "手动阶段",
      currentTask: "手动当前任务",
      nextTask: "手动下一任务",
    })
    startProjectAiSession(database, project.id, ["从哪里开始？"])
    appendProjectAiAnswer(
      database,
      project.id,
      "先列清单",
      {
        stageTitle: "确认范围",
        currentTask: "列搬家清单",
        nextTask: "确认搬家日期",
        progress: 15,
      },
      project.updatedAt,
    )

    applyProjectAiPlan(database, project.id)
    const planAction = listAiActions(database)[0]
    expect(planAction).toEqual(
      expect.objectContaining({ actionType: "apply_project_plan", entityId: project.id }),
    )
    if (planAction === undefined) throw new Error("Missing project plan action")
    undoAiAction(database, planAction.id)
    expect(getProject(database, project.id)).toEqual(
      expect.objectContaining({
        stageTitle: "手动阶段",
        currentTask: expect.objectContaining({ title: "手动当前任务", source: "manual" }),
        nextTask: expect.objectContaining({ title: "手动下一任务", source: "manual" }),
        progress: 0,
        progressSource: "manual",
      }),
    )
    expect(getProjectAiSession(database, project.id)).toEqual(
      expect.objectContaining({ status: "ready" }),
    )

    const applied = applyProjectAiPlan(database, project.id)
    if (applied.currentTask === null) throw new Error("Missing applied current task")
    applyProjectAiFeedback(database, project.id, applied.currentTask.id, "清单完成", null, {
      kind: "task",
      nextTask: "联系搬家公司",
      progress: 30,
    })
    const feedbackAction = listAiActions(database)[0]
    expect(feedbackAction).toEqual(
      expect.objectContaining({ actionType: "advance_project_feedback", entityId: project.id }),
    )
    if (feedbackAction === undefined) throw new Error("Missing project feedback action")
    undoAiAction(database, feedbackAction.id)
    expect(getProject(database, project.id)).toEqual(
      expect.objectContaining({
        stageTitle: "确认范围",
        currentTask: expect.objectContaining({ title: "列搬家清单", source: "ai" }),
        nextTask: expect.objectContaining({ title: "确认搬家日期", source: "ai" }),
        progress: 15,
        progressSource: "ai",
        recentProgress: [],
      }),
    )
    const activePlanAction = listAiActions(database).find(
      (action) => action.actionType === "apply_project_plan" && action.undoneAt === null,
    )
    if (activePlanAction === undefined) throw new Error("Missing active project plan action")
    undoAiAction(database, activePlanAction.id)
    expect(getProject(database, project.id)).toEqual(
      expect.objectContaining({
        stageTitle: "手动阶段",
        currentTask: expect.objectContaining({ title: "手动当前任务" }),
        progress: 0,
      }),
    )
    database.close()
  })

  it("restores the prior stage after AI advances to a new stage", () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-project-stage-action-"))
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const project = createProject(database, {
      name: "整理书房",
      desiredOutcome: "腾出工作空间",
      reason: null,
      notes: null,
      deadlineDate: null,
      stageTitle: "清理桌面",
      currentTask: "移走旧文件",
      nextTask: "暂定下一步",
    })
    const prepared = updateProject(database, project.id, { nextTask: null })
    if (prepared.currentTask === null) throw new Error("Missing current project task")
    applyProjectAiFeedback(database, project.id, prepared.currentTask.id, "桌面已清空", null, {
      kind: "stage",
      stageOutcome: "桌面恢复可用",
      stageTitle: "整理书架",
      currentTask: "按主题分组",
      nextTask: "处理不再需要的书",
      progress: 45,
    })
    const action = listAiActions(database)[0]
    if (action === undefined) throw new Error("Missing stage feedback action")
    undoAiAction(database, action.id)
    expect(getProject(database, project.id)).toEqual(
      expect.objectContaining({
        stageTitle: "清理桌面",
        currentTask: expect.objectContaining({ title: "移走旧文件", source: "manual" }),
        nextTask: null,
        completedStages: [],
        recentProgress: [],
        progress: 0,
      }),
    )
    database.close()
  })
})

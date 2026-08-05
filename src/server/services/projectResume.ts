import type { DatabaseSync } from "node:sqlite"
import { updateProject } from "../repositories/projectLifecycle.js"
import { getProject } from "../repositories/projects.js"
import { startProjectAiClarification } from "./projectAi.js"
import { getAiConfigStatus } from "./secrets.js"

export async function resumeProject(database: DatabaseSync, secretPath: string, projectId: string) {
  const current = getProject(database, projectId)
  if (current.status !== "paused") return current
  updateProject(database, projectId, { status: "active" })
  if (getAiConfigStatus(secretPath).configured) {
    await startProjectAiClarification(database, secretPath, projectId, "resume")
  }
  return getProject(database, projectId)
}

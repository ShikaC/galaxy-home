import type { DatabaseSync } from "node:sqlite"
import { updateProject } from "../repositories/projectLifecycle.js"
import { getProject } from "../repositories/projects.js"
import { startProjectAiClarification } from "./projectAi.js"
import { getAiConfigStatus } from "./secrets.js"

export async function resumeProject(database: DatabaseSync, secretPath: string, projectId: string) {
  const current = getProject(database, projectId)
  if (current.status !== "paused") return current
  if (getAiConfigStatus(secretPath).configured) {
    await startProjectAiClarification(database, secretPath, projectId, "resume")
  }
  updateProject(database, projectId, { status: "active" })
  return getProject(database, projectId)
}

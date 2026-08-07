import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { AiReference } from "../../shared/ai.js"
import type { WorkspaceSettings } from "../../shared/settings.js"
import { getProject } from "../repositories/projects.js"
import { listWorkspaceContext, searchWorkspace } from "../repositories/search.js"

type ContextEntry = {
  readonly reference: AiReference
  readonly detail: unknown
}

const memoryRowSchema = z.object({ id: z.string().uuid(), content: z.string() })
const MAX_OPEN_REFERENCES = 24
const MAX_CONTEXT_CHARS = 40_000

function currentPageEntry(database: DatabaseSync, path: string, label: string): ContextEntry {
  const projectMatch = /^\/projects\/([^/]+)$/.exec(path)
  const projectId = z.string().uuid().safeParse(projectMatch?.[1])
  if (projectId.success) {
    const project = getProject(database, projectId.data)
    return {
      reference: { type: "project", id: project.id, label: project.name },
      detail: {
        name: project.name,
        desiredOutcome: project.desiredOutcome,
        stageTitle: project.stageTitle,
        currentTask: project.currentTask?.title ?? null,
        nextTask: project.nextTask?.title ?? null,
        progress: project.progress,
        status: project.status,
      },
    }
  }
  return { reference: { type: "page", id: null, label }, detail: { page: label } }
}

function searchTerms(content: string): readonly string[] {
  const terms = content
    .trim()
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((value) => value.length >= 2)
    .flatMap((value) => {
      const characters = Array.from(value)
      if (!/^\p{Script=Han}+$/u.test(value) || characters.length <= 4) return [value]
      return [
        value,
        ...characters.slice(0, -1).map((character, index) => character + characters[index + 1]),
      ]
    })
  return [...new Set(terms)].slice(0, 12)
}

function requestsWorkspaceOverview(content: string): boolean {
  return /(全部|所有|整个|全局|工作空间|空间里|概览|盘点|清单)/u.test(content)
}

function openWorkspaceEntries(database: DatabaseSync, content: string): readonly ContextEntry[] {
  const unique = new Map<string, ContextEntry>()
  for (const term of searchTerms(content)) {
    for (const result of searchWorkspace(database, { search: term })) {
      const key = `${result.type}:${result.id}`
      if (!unique.has(key)) {
        unique.set(key, {
          reference: { type: result.type, id: result.id, label: result.title },
          detail: { type: result.type, title: result.title, detail: result.detail },
        })
      }
      if (unique.size >= MAX_OPEN_REFERENCES) return [...unique.values()]
    }
  }
  if (requestsWorkspaceOverview(content) || unique.size === 0) {
    for (const result of listWorkspaceContext(database)) {
      const key = `${result.type}:${result.id}`
      if (!unique.has(key)) {
        unique.set(key, {
          reference: { type: result.type, id: result.id, label: result.title },
          detail: { type: result.type, title: result.title, detail: result.detail },
        })
      }
      if (unique.size >= MAX_OPEN_REFERENCES) break
    }
  }
  return [...unique.values()].slice(0, MAX_OPEN_REFERENCES)
}

function limitContext(entries: readonly ContextEntry[]): readonly ContextEntry[] {
  const selected: ContextEntry[] = []
  let total = 0
  for (const entry of entries) {
    const size = JSON.stringify(entry.detail).length
    if (selected.length > 0 && total + size > MAX_CONTEXT_CHARS) break
    selected.push(entry)
    total += size
  }
  return selected
}

function relevantMemoryEntries(database: DatabaseSync, content: string): readonly ContextEntry[] {
  const unique = new Map<string, ContextEntry>()
  for (const term of searchTerms(content)) {
    const rows = database
      .prepare(
        `SELECT id, content FROM ai_memories
         WHERE deleted_at IS NULL AND content LIKE ? ORDER BY updated_at DESC LIMIT 4`,
      )
      .all(`%${term}%`)
      .map((row) => memoryRowSchema.parse(row))
    for (const row of rows)
      unique.set(row.id, {
        reference: { type: "memory", id: row.id, label: row.content },
        detail: { memory: row.content },
      })
  }
  return [...unique.values()].slice(0, 4)
}

export function buildAiContext(
  database: DatabaseSync,
  settings: WorkspaceSettings,
  path: string,
  label: string,
  content: string,
) {
  const entries = [
    currentPageEntry(database, path, label),
    ...relevantMemoryEntries(database, content),
    ...(settings.aiPermission === "open" ? openWorkspaceEntries(database, content) : []),
  ]
  const unique = new Map(
    entries.map((entry) => [`${entry.reference.type}:${entry.reference.id}`, entry]),
  )
  const context = limitContext([...unique.values()])
  return {
    references: context.map((entry) => entry.reference),
    prompt: JSON.stringify({
      permission: settings.aiPermission,
      localContext: context.map((entry) => entry.detail),
    }),
  }
}

import { isAbsolute, join } from "node:path"

export const WORKSPACE_DATABASE_FILE = "galaxy-home.sqlite" as const

export type WorkspacePathSource = "env" | "default"

export type WorkspacePaths = {
  readonly backupDirectory: string
  readonly dataDirectory: string
  readonly databaseFile: string
  readonly source: WorkspacePathSource
}

export function describeWorkspacePaths(input: {
  readonly backupDirectory: string
  readonly dataDirectory: string
  readonly envOverride: boolean
}): WorkspacePaths {
  if (!isAbsolute(input.dataDirectory) || !isAbsolute(input.backupDirectory)) {
    throw new RangeError("工作区路径必须是绝对路径")
  }
  return {
    backupDirectory: input.backupDirectory,
    dataDirectory: input.dataDirectory,
    databaseFile: join(input.dataDirectory, WORKSPACE_DATABASE_FILE),
    source: input.envOverride ? "env" : "default",
  }
}

export function workspacePathEnvOverride(env: { readonly GALAXY_DATA_DIR?: string }): boolean {
  const value = env.GALAXY_DATA_DIR
  return value !== undefined && value.trim() !== ""
}

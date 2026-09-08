import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  describeWorkspacePaths,
  WORKSPACE_DATABASE_FILE,
  workspacePathEnvOverride,
} from "../../src/server/lib/workspacePaths.js"

describe("describeWorkspacePaths", () => {
  it("returns absolute product paths under the data directory", () => {
    const dataDirectory = "/Users/me/Library/Application Support/app.galaxyhome.desktop"
    const backupDirectory = join(dataDirectory, "backups")

    const paths = describeWorkspacePaths({
      backupDirectory,
      dataDirectory,
      envOverride: false,
    })

    expect(paths).toEqual({
      backupDirectory,
      dataDirectory,
      databaseFile: join(dataDirectory, WORKSPACE_DATABASE_FILE),
      source: "default",
    })
    expect(paths.databaseFile.startsWith(dataDirectory)).toBe(true)
  })

  it("marks env override when GALAXY_DATA_DIR is set", () => {
    const dataDirectory = "/tmp/galaxy-shared"
    const paths = describeWorkspacePaths({
      backupDirectory: join(dataDirectory, "backups"),
      dataDirectory,
      envOverride: true,
    })

    expect(paths.source).toBe("env")
  })

  it("treats a non-empty GALAXY_DATA_DIR as an env override", () => {
    expect(workspacePathEnvOverride({ GALAXY_DATA_DIR: "/tmp/shared" })).toBe(true)
    expect(workspacePathEnvOverride({ GALAXY_DATA_DIR: "  " })).toBe(false)
    expect(workspacePathEnvOverride({})).toBe(false)
  })

  it("rejects relative directories", () => {
    expect(() =>
      describeWorkspacePaths({
        backupDirectory: "backups",
        dataDirectory: "data",
        envOverride: false,
      }),
    ).toThrow(RangeError)
  })
})

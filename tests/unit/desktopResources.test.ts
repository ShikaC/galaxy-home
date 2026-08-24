import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { pruneProductionDependencyArtifacts } from "../../scripts/desktop-resource-pruning.mjs"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe("desktop production resources", () => {
  it("removes dependency test fixtures while preserving runtime files", () => {
    const directory = mkdtempSync(join(tmpdir(), "galaxy-desktop-resources-"))
    directories.push(directory)
    const runtimeFile = join(directory, "demo", "lib", "index.js")
    const testFixture = join(directory, "demo", "test", "fixtures", "snow ☃", "index.html")
    const exampleFile = join(directory, "demo", "examples", "example.js")
    mkdirSync(join(directory, "demo", "lib"), { recursive: true })
    mkdirSync(join(directory, "demo", "test", "fixtures", "snow ☃"), { recursive: true })
    mkdirSync(join(directory, "demo", "examples"), { recursive: true })
    writeFileSync(runtimeFile, "export const runtime = true\n")
    writeFileSync(testFixture, "fixture\n")
    writeFileSync(exampleFile, "example\n")

    const removed = pruneProductionDependencyArtifacts(directory)

    expect(removed).toBe(2)
    expect(existsSync(runtimeFile)).toBe(true)
    expect(existsSync(testFixture)).toBe(false)
    expect(existsSync(exampleFile)).toBe(false)
  })
})

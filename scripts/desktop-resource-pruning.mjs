import { existsSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

const PRODUCTION_ONLY_DIRECTORY_NAMES = new Set([
  ".github",
  ".circleci",
  "bench",
  "benchmark",
  "benchmarks",
  "doc",
  "docs",
  "example",
  "examples",
  "test",
  "tests",
])

export function pruneProductionDependencyArtifacts(dependenciesRoot) {
  if (!existsSync(dependenciesRoot)) return 0

  const packageRoots = []
  for (const entry of readdirSync(dependenciesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const scope = join(dependenciesRoot, entry.name)
    if (entry.name.startsWith("@")) {
      for (const scopedPackage of readdirSync(scope, { withFileTypes: true })) {
        if (scopedPackage.isDirectory()) packageRoots.push(join(scope, scopedPackage.name))
      }
      continue
    }
    packageRoots.push(scope)
  }

  let removed = 0
  for (const packageRoot of packageRoots) {
    const pending = [packageRoot]
    while (pending.length > 0) {
      const current = pending.pop()
      if (current === undefined) continue

      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const child = join(current, entry.name)
        if (PRODUCTION_ONLY_DIRECTORY_NAMES.has(entry.name.toLowerCase())) {
          rmSync(child, { force: true, recursive: true })
          removed += 1
          continue
        }
        pending.push(child)
      }
    }
  }

  return removed
}

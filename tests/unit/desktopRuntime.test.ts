import { delimiter, dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  assertSupportedNodeRuntime,
  npmInvocation,
  runtimeEnv,
  tauriCliPath,
} from "../../scripts/node-runtime.mjs"

describe("desktop runtime commands", () => {
  it("puts the current Node runtime first in child PATH", () => {
    const env = runtimeEnv({ PATH: "C:\\old-node" })

    expect(env.PATH).toBe(`${dirname(process.execPath)}${delimiter}C:\\old-node`)
  })

  it("rejects Node versions below the desktop requirement", () => {
    expect(() => assertSupportedNodeRuntime("22.17.0")).toThrow(/Node\.js ≥24/)
    expect(() => assertSupportedNodeRuntime("24.14.0")).not.toThrow()
  })

  it("runs npm through the current Node when npm provides its CLI path", () => {
    const environment = process.env as NodeJS.ProcessEnv & { npm_execpath?: string }
    const previous = environment.npm_execpath
    const npmCli = join("C:", "npm", "bin", "npm-cli.js")
    environment.npm_execpath = npmCli
    try {
      expect(npmInvocation(["ci"]).command).toBe(process.execPath)
      expect(npmInvocation(["ci"]).args).toEqual([npmCli, "ci"])
    } finally {
      if (previous === undefined) delete environment.npm_execpath
      else environment.npm_execpath = previous
    }
  })

  it("resolves npm through the current Node when the npm environment is absent", () => {
    const environment = process.env as NodeJS.ProcessEnv & { npm_execpath?: string }
    const previous = environment.npm_execpath
    delete environment.npm_execpath
    try {
      const invocation = npmInvocation(["--version"])
      if (process.platform === "win32") {
        expect(invocation.command).toBe(process.execPath)
        expect(invocation.args[0]).toMatch(/npm-cli\.js$/)
      } else {
        expect(invocation.command).toBe("npm")
        expect(invocation.args).toEqual(["--version"])
      }
    } finally {
      if (previous !== undefined) environment.npm_execpath = previous
    }
  })

  it("resolves the project-local Tauri CLI", () => {
    expect(tauriCliPath("E:/Projects/galaxy-home")).toBe(
      join("E:/Projects/galaxy-home", "node_modules", "@tauri-apps", "cli", "tauri.js"),
    )
  })
})

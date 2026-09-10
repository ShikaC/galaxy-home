import { describe, expect, it } from "vitest"
import { resolveAiProxyOptions } from "../../src/server/services/aiProxy.js"

const systemSettings = `<dictionary> {
  HTTPEnable : 1
  HTTPProxy : 127.0.0.1
  HTTPPort : 7897
  HTTPSEnable : 1
  HTTPSProxy : 127.0.0.1
  HTTPSPort : 7897
}`

describe("AI proxy selection", () => {
  it("uses the enabled macOS proxy when the app has no proxy environment", () => {
    // Given / When an app launched from the desktop inherits no shell proxy.
    const options = resolveAiProxyOptions({}, systemSettings)
    // Then both upstream protocols use the user's system proxy.
    expect(options).toMatchObject({
      httpProxy: "http://127.0.0.1:7897",
      httpsProxy: "http://127.0.0.1:7897",
    })
  })

  it("gives explicit environment configuration precedence over system settings", () => {
    const options = resolveAiProxyOptions(
      {
        https_proxy: "http://custom:8080",
        HTTPS_PROXY: "http://ignored:8080",
        NO_PROXY: "*.local",
      },
      systemSettings,
    )
    expect(options).toMatchObject({
      httpProxy: "",
      httpsProxy: "http://custom:8080",
      noProxy: "*.local",
    })
  })

  it("does not reuse a disabled system proxy", () => {
    const options = resolveAiProxyOptions({}, systemSettings.replaceAll("Enable : 1", "Enable : 0"))
    expect(options).toMatchObject({ httpProxy: "", httpsProxy: "" })
  })

  it("preserves an explicitly empty NO_PROXY instead of inheriting system exceptions", () => {
    const options = resolveAiProxyOptions(
      { NO_PROXY: "" },
      `${systemSettings}\nExceptionsList : <array> {\n0 : *.example.com\n}`,
    )
    expect(options.noProxy).toBe("")
  })

  it("uses an HTTP proxy for HTTPS when only HTTP_PROXY is configured", () => {
    const options = resolveAiProxyOptions({ HTTP_PROXY: "http://proxy:8080" }, "")
    expect(options.httpsProxy).toBe("http://proxy:8080")
  })
})

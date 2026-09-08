import { describe, expect, it } from "vitest"
import {
  applyTheme,
  nextTheme,
  parseTheme,
  persistTheme,
  readStoredTheme,
  themeColorScheme,
} from "../../src/client/lib/theme.js"

describe("parseTheme", () => {
  it("keeps a stored night theme", () => {
    expect(parseTheme("night")).toBe("night")
  })

  it("keeps a stored dawn theme", () => {
    expect(parseTheme("dawn")).toBe("dawn")
  })

  it("falls back to night when the stored value is unknown", () => {
    expect(parseTheme("solar")).toBe("night")
    expect(parseTheme(null)).toBe("night")
  })
})

describe("themeColorScheme", () => {
  it("maps night to dark and dawn to light", () => {
    expect(themeColorScheme("night")).toBe("dark")
    expect(themeColorScheme("dawn")).toBe("light")
  })
})

describe("nextTheme", () => {
  it("toggles between night and dawn", () => {
    expect(nextTheme("night")).toBe("dawn")
    expect(nextTheme("dawn")).toBe("night")
  })
})

describe("theme persistence", () => {
  it("reads and writes through the storage seam", () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    }
    persistTheme("dawn", storage)
    expect(readStoredTheme(storage)).toBe("dawn")
  })
})

describe("applyTheme", () => {
  it("writes data-theme and color-scheme onto the root", () => {
    const root = document.createElement("html")
    applyTheme("dawn", root)
    expect(root.getAttribute("data-theme")).toBe("dawn")
    expect(root.style.colorScheme).toBe("light")
  })
})

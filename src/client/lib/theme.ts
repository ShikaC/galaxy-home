export const THEME_NAMES = ["night", "dawn"] as const
export type ThemeName = (typeof THEME_NAMES)[number]

export const THEME_STORAGE_KEY = "galaxy:theme"
export const DEFAULT_THEME: ThemeName = "night"

export function parseTheme(value: string | null): ThemeName {
  if (value === "dawn" || value === "night") return value
  return DEFAULT_THEME
}

export function themeColorScheme(theme: ThemeName): "dark" | "light" {
  return theme === "dawn" ? "light" : "dark"
}

export function applyTheme(theme: ThemeName, root: HTMLElement = document.documentElement): void {
  root.setAttribute("data-theme", theme)
  root.style.colorScheme = themeColorScheme(theme)
  const themeColor = root.ownerDocument.querySelector('meta[name="theme-color"]')
  if (themeColor) {
    themeColor.setAttribute("content", theme === "dawn" ? "#efe8dc" : "#0a0c11")
  }
}

export function readStoredTheme(storage: Pick<Storage, "getItem"> = localStorage): ThemeName {
  return parseTheme(storage.getItem(THEME_STORAGE_KEY))
}

export function persistTheme(
  theme: ThemeName,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(THEME_STORAGE_KEY, theme)
}

export function nextTheme(theme: ThemeName): ThemeName {
  return theme === "night" ? "dawn" : "night"
}

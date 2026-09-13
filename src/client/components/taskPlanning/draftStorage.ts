import type { ZodType } from "zod"

export function readDraft<T>(key: string, schema: ZodType<T>): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw === null) return null
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DOMException) return null
    throw error
  }
}

export function writeDraft(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    if (!(error instanceof DOMException)) throw error
    console.warn("浏览器暂存不可用，当前输入仍保留在编辑器中。", error.name)
  }
}

export const editorDraftKey = (id: string) => `galaxy-task-plan-editor:${id}`

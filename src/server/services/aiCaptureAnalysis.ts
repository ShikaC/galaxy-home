import type { DatabaseSync } from "node:sqlite"
import {
  markItemAiSuggestionWaiting,
  saveItemAiSuggestion,
} from "../repositories/itemAiSuggestions.js"
import { suggestItemCategories } from "./aiCategorySuggest.js"
import { getAiConfigStatus } from "./secrets.js"

export function queueCaptureAnalysis(
  database: DatabaseSync,
  secretPath: string,
  itemId: string,
): void {
  if (!getAiConfigStatus(secretPath).configured) return
  markItemAiSuggestionWaiting(database, itemId)
  void analyzeCaptureSuggestion(database, secretPath, itemId)
}

async function analyzeCaptureSuggestion(
  database: DatabaseSync,
  secretPath: string,
  itemId: string,
): Promise<void> {
  try {
    const suggestion = await suggestItemCategories(database, secretPath, itemId)
    saveItemAiSuggestion(database, itemId, {
      status: "ready",
      categoryIds: suggestion.categoryIds,
      suggestToday: suggestion.suggestToday,
      note: suggestion.note,
    })
  } catch {
    saveItemAiSuggestion(database, itemId, {
      status: "failed",
      categoryIds: [],
      suggestToday: false,
      note: "分析失败，可稍后在整理中再请 AI 建议",
    })
  }
}

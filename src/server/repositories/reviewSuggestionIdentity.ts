import { createHash } from "node:crypto"
import { z } from "zod"
import type { ReviewSuggestion } from "../../shared/app.js"

function stableSuggestionId(
  reviewId: string,
  suggestion: Pick<ReviewSuggestion, "type" | "content">,
): string {
  const namespace = Buffer.from(reviewId.replaceAll("-", ""), "hex")
  const digest = createHash("sha1")
    .update(namespace)
    .update(suggestion.type)
    .update("\0")
    .update(suggestion.content.trim())
    .digest()
  const versionByte = digest[6]
  const variantByte = digest[8]
  if (versionByte === undefined || variantByte === undefined) throw new Error("建议标识生成失败")
  digest[6] = (versionByte & 0x0f) | 0x50
  digest[8] = (variantByte & 0x3f) | 0x80
  const hex = digest.subarray(0, 16).toString("hex")
  return z
    .string()
    .uuid()
    .parse(
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    )
}

export function identifyReviewSuggestions(
  reviewId: string,
  suggestions: readonly Pick<ReviewSuggestion, "type" | "content">[],
) {
  return suggestions.map((suggestion) => ({
    id: stableSuggestionId(reviewId, suggestion),
    ...suggestion,
  }))
}

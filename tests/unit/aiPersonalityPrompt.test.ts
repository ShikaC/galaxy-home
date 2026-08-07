import { describe, expect, it } from "vitest"
import {
  DEFAULT_AI_PERSONALITY_PROMPT,
  type WorkspaceSettings,
} from "../../src/shared/settings.js"
import { buildAiChatSystemPrompt } from "../../src/server/services/aiChatActions.js"

const baseSettings: WorkspaceSettings = {
  workspaceName: "测试空间",
  aiNickname: "星伴",
  userName: "小石",
  timezone: "Asia/Shanghai",
  aiPermission: "conservative",
  aiPersonalityPrompt: DEFAULT_AI_PERSONALITY_PROMPT,
  onboardingCompleted: true,
  backupRetentionDays: 30,
  trashRetentionDays: 30,
  morningReminderTime: "09:00",
  morningReminderEnabled: true,
  eveningReminderTime: "21:00",
  eveningReminderEnabled: true,
  weeklyReviewTime: "20:00",
  weeklyReviewEnabled: true,
}

describe("buildAiChatSystemPrompt", () => {
  it("embeds nickname, user name, and editable personality", () => {
    const prompt = buildAiChatSystemPrompt(
      {
        ...baseSettings,
        aiPersonalityPrompt: "说话简短，先问一句再建议。",
      },
      "本地上下文",
    )
    expect(prompt).toContain("你是星伴，称呼用户为小石。")
    expect(prompt).toContain("说话简短，先问一句再建议。")
    expect(prompt).toContain("本地上下文")
    expect(prompt).not.toContain(DEFAULT_AI_PERSONALITY_PROMPT)
  })

  it("falls back to the default personality when the stored value is blank", () => {
    const prompt = buildAiChatSystemPrompt(
      { ...baseSettings, aiPersonalityPrompt: "   " },
      "上下文",
    )
    expect(prompt).toContain(DEFAULT_AI_PERSONALITY_PROMPT)
  })
})

// 对话动作原本都堆在这一个 1200 行的文件里，现在按职责拆到 ./aiChat/ 下：
// refs（实体引用解析）、parsing（从回答里抠 JSON）、normalize（宽松输入规范化）、
// summary（摘要文案与操作记录）、today（今日标记）、handlers（单个动作执行）、
// execute（批量与权限）、apply（整轮应用与系统提示词）。
//
// 这里只留对外入口，调用方（aiChat.ts / routes/ai.ts / 测试）的 import 路径不变。

export { applyAiChatActions, buildAiChatSystemPrompt } from "./aiChat/apply.js"
export { executeChatActions } from "./aiChat/execute.js"
export { executeChatAction } from "./aiChat/handlers.js"
export type { ApplyChatActionsResult } from "./aiChat/parsing.js"
export { extractChatAction, extractChatActions } from "./aiChat/parsing.js"

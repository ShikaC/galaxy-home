import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { migrateDatabase, openDatabase } from "../../src/server/database.js"
import {
  addMessage,
  createConversation,
  listMessages,
  MAX_MESSAGES_PER_CONVERSATION,
} from "../../src/server/repositories/conversations.js"

let directory = ""
afterEach(() => {
  if (directory !== "") rmSync(directory, { force: true, recursive: true })
  directory = ""
})

describe("AI conversation bounds", () => {
  it("returns only the most recent messages in chronological order", () => {
    directory = mkdtempSync(join(tmpdir(), "galaxy-conversations-"))
    const database = openDatabase(join(directory, "app.sqlite"))
    migrateDatabase(database)
    const conversation = createConversation(database, "长对话")
    for (let index = 0; index < MAX_MESSAGES_PER_CONVERSATION + 5; index += 1)
      addMessage(database, conversation.id, index % 2 === 0 ? "user" : "assistant", `消息 ${index}`)

    const messages = listMessages(database, conversation.id)
    expect(messages).toHaveLength(MAX_MESSAGES_PER_CONVERSATION)
    expect(messages[0]?.content).toBe("消息 5")
    expect(messages.at(-1)?.content).toBe("消息 84")
    database.close()
  })
})

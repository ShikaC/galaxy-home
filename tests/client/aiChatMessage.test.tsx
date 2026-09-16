import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AiChatMessage } from "../../src/client/components/AiChatMessage.js"

// exactOptionalPropertyTypes 下不能把 id 显式写成 undefined，缺省时干脆不设这个键。
function messageWithProposal(id?: string) {
  return {
    ...(id === undefined ? {} : { id }),
    role: "assistant" as const,
    content: "记一下你的偏好",
    references: [],
    pendingAction: null,
    proposedMemory: { content: "偏好早上处理难事", kind: "preference" },
  }
}

afterEach(cleanup)

describe("记忆提议的忽略入口", () => {
  it("把消息 id 交给忽略回调", () => {
    const onDismissProposedMemory = vi.fn()
    const message = messageWithProposal(crypto.randomUUID())

    render(
      <AiChatMessage
        message={message}
        nickname="星伴"
        onAcceptProposedMemory={() => {}}
        onDismissProposedMemory={onDismissProposedMemory}
        onRemember={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "忽略" }))
    expect(onDismissProposedMemory).toHaveBeenCalledWith(message.id)
  })

  it("没有忽略回调时不显示按钮", () => {
    render(
      <AiChatMessage
        message={messageWithProposal(crypto.randomUUID())}
        nickname="星伴"
        onAcceptProposedMemory={() => {}}
        onRemember={() => {}}
      />,
    )

    expect(screen.getByRole("button", { name: "确认保存记忆" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "忽略" })).not.toBeInTheDocument()
  })

  it("消息没有 id 时不显示按钮——否则无法定位要清哪条提议", () => {
    render(
      <AiChatMessage
        message={messageWithProposal()}
        nickname="星伴"
        onAcceptProposedMemory={() => {}}
        onDismissProposedMemory={() => {}}
        onRemember={() => {}}
      />,
    )

    expect(screen.queryByRole("button", { name: "忽略" })).not.toBeInTheDocument()
  })
})

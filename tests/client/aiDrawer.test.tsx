import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AiDrawer } from "../../src/client/components/AiDrawer.js"
import { streamAiChat } from "../../src/client/lib/aiStream.js"
import { useMeta } from "../../src/client/lib/queries.js"

vi.mock("../../src/client/lib/aiStream.js", () => ({ streamAiChat: vi.fn() }))
vi.mock("../../src/client/lib/queries.js", () => ({
  queryKeys: { meta: ["meta"] },
  useMeta: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe("AiDrawer focus draft", () => {
  it("prefills draft and sends focusItemId with the first message", async () => {
    const focusItemId = crypto.randomUUID()
    vi.mocked(useMeta).mockReturnValue({
      data: {
        ai: { configured: true },
        settings: { aiNickname: "星伴" },
        conversations: [],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMeta>)
    vi.mocked(streamAiChat).mockResolvedValue({
      conversationId: crypto.randomUUID(),
      message: {
        id: crypto.randomUUID(),
        conversationId: crypto.randomUUID(),
        role: "assistant",
        content: "先写标题。",
        references: [],
        createdAt: new Date().toISOString(),
      },
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AiDrawer
            draft="请帮我把「写完对抗审查计划表」缩小成今天能完成的一小步"
            focusItemId={focusItemId}
            onClose={() => undefined}
            onConversationChange={() => undefined}
            open
            requestedConversationId={null}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(
      screen.getByDisplayValue("请帮我把「写完对抗审查计划表」缩小成今天能完成的一小步"),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }))
    await waitFor(() => {
      expect(streamAiChat).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "请帮我把「写完对抗审查计划表」缩小成今天能完成的一小步",
          focusItemId,
        }),
        expect.any(Function),
      )
    })
  })
})

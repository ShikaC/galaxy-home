import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppTimeContext } from "../../src/client/components/AppContext.js"
import { OrganizeDialog } from "../../src/client/components/OrganizeDialog.js"
import { ApiError, apiRequest } from "../../src/client/lib/api.js"
import { useMeta, useProjects } from "../../src/client/lib/queries.js"
import { itemSchema } from "../../src/shared/items.js"

vi.mock("../../src/client/lib/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/client/lib/api.js")>()
  return { ...actual, apiRequest: vi.fn() }
})
vi.mock("../../src/client/lib/queries.js", () => ({ useMeta: vi.fn(), useProjects: vi.fn() }))

const item = itemSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  title: "整理客户反馈",
  notes: "",
  priority: "none",
  parentId: null,
  dueAt: null,
  dueDate: null,
  estimatedMinutes: null,
  scheduledStartAt: null,
  scheduledEndAt: null,
  scheduleTimezone: null,
  isFixed: false,
  reminderMinutes: null,
  reminders: [],
  status: "active",
  completedAt: null,
  categoryIds: [],
  projectIds: [],
  recurrenceSeriesId: null,
  recurrenceDate: null,
  recurrenceStatus: null,
  subtaskCount: 0,
  completedSubtaskCount: 0,
  isTutorial: false,
  inToday: false,
  isFocus: false,
  isSecondary: false,
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function Harness() {
  const [current, setCurrent] = useState(item)
  return (
    <>
      <button type="button" onClick={() => setCurrent({ ...item, version: 2, title: "远端标题" })}>
        模拟后台刷新
      </button>
      <OrganizeDialog item={current} mode="edit" onClose={vi.fn()} />
    </>
  )
}

describe("OrganizeDialog stale save", () => {
  it("sends one atomic patch with the opening version and preserves the dirty draft on 409", async () => {
    vi.mocked(useMeta).mockReturnValue({
      data: { ai: { configured: false }, categories: [], settings: { timezone: "Asia/Shanghai" } },
    } as unknown as ReturnType<typeof useMeta>)
    vi.mocked(useProjects).mockReturnValue({ data: [] } as unknown as ReturnType<
      typeof useProjects
    >)
    vi.mocked(apiRequest).mockImplementation(async (path, _schema, init) => {
      if (path.startsWith("/api/items?")) return []
      if (path === `/api/items/${item.id}` && init?.method === "PATCH") {
        throw new ApiError("ITEM_VERSION_CONFLICT", "任务已在另一个窗口更新")
      }
      if (path === `/api/items/${item.id}`) return { ...item, subtasks: [] }
      throw new TypeError(`Unexpected request: ${path}`)
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <AppTimeContext.Provider value={{ timezone: "Asia/Shanghai", today: "2026-09-10" }}>
          <Harness />
        </AppTimeContext.Provider>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "本地尚未保存的标题" } })
    fireEvent.click(screen.getByRole("button", { name: "模拟后台刷新" }))
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("另一个窗口"))
    expect(screen.getByDisplayValue("本地尚未保存的标题")).toBeInTheDocument()
    const patchCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(
        ([path, _schema, init]) => path === `/api/items/${item.id}` && init?.method === "PATCH",
      )
    expect(patchCalls).toHaveLength(1)
    expect(JSON.parse(String(patchCalls[0]?.[2]?.body))).toMatchObject({
      expectedVersion: 1,
      title: "本地尚未保存的标题",
      categoryIds: [],
      projectIds: [],
      reminders: [],
    })
  })
})

function mockEditorDependencies() {
  vi.mocked(useMeta).mockReturnValue({
    data: { ai: { configured: false }, categories: [], settings: { timezone: "Asia/Shanghai" } },
  } as unknown as ReturnType<typeof useMeta>)
  vi.mocked(useProjects).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useProjects>)
}

function renderEditor(openedItem: typeof item) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <AppTimeContext.Provider value={{ timezone: "Asia/Shanghai", today: "2026-09-10" }}>
        <OrganizeDialog item={openedItem} mode="edit" onClose={vi.fn()} />
      </AppTimeContext.Provider>
    </QueryClientProvider>,
  )
}

describe("OrganizeDialog subtask coordination", () => {
  it("allows an active top-level task that already has children to be selected as a parent", async () => {
    mockEditorDependencies()
    const candidate = {
      ...item,
      id: "22222222-2222-4222-8222-222222222222",
      title: "已有子任务的父任务",
      subtaskCount: 2,
    }
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path.startsWith("/api/items?")) return [candidate]
      if (path === `/api/items/${item.id}`) return { ...item, subtasks: [] }
      throw new TypeError(`Unexpected request: ${path}`)
    })

    renderEditor(item)

    expect(await screen.findByRole("option", { name: "已有子任务的父任务" })).toBeInTheDocument()
  })

  it("advances only its own parent version after creating a child before saving the draft", async () => {
    mockEditorDependencies()
    const child = {
      ...item,
      id: "33333333-3333-4333-8333-333333333333",
      title: "新子任务",
      parentId: item.id,
    }
    vi.mocked(apiRequest).mockImplementation(async (path, _schema, init) => {
      if (path.startsWith("/api/items?")) return []
      if (path === "/api/items" && init?.method === "POST") return child
      if (path === `/api/items/${item.id}` && init?.method === "PATCH") {
        return { ...item, version: 3, title: "保留的父任务草稿" }
      }
      if (path === `/api/items/${item.id}`) return { ...item, version: 2, subtasks: [child] }
      throw new TypeError(`Unexpected request: ${path}`)
    })
    renderEditor(item)
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "保留的父任务草稿" },
    })
    fireEvent.change(screen.getByLabelText("新子任务标题"), { target: { value: "新子任务" } })
    fireEvent.click(screen.getByRole("button", { name: "添加子任务" }))
    await waitFor(() => expect(screen.getByLabelText("新子任务标题")).toHaveValue(""))

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))

    await waitFor(() => {
      const patch = vi
        .mocked(apiRequest)
        .mock.calls.find(
          ([path, _schema, init]) => path === `/api/items/${item.id}` && init?.method === "PATCH",
        )
      expect(JSON.parse(String(patch?.[2]?.body))).toMatchObject({
        expectedVersion: 2,
        title: "保留的父任务草稿",
      })
    })
  })

  it("advances the parent version after an immediate child status write", async () => {
    mockEditorDependencies()
    const parent = { ...item, version: 2, subtaskCount: 1 }
    const child = {
      ...item,
      id: "44444444-4444-4444-8444-444444444444",
      title: "待完成子任务",
      parentId: parent.id,
    }
    vi.mocked(apiRequest).mockImplementation(async (path, _schema, init) => {
      if (path.startsWith("/api/items?")) return []
      if (path === `/api/items/${child.id}` && init?.method === "PATCH") {
        return { ...child, version: 2, status: "completed" }
      }
      if (path === `/api/items/${parent.id}` && init?.method === "PATCH") {
        return { ...parent, version: 4 }
      }
      if (path === `/api/items/${parent.id}`) return { ...parent, version: 3, subtasks: [child] }
      throw new TypeError(`Unexpected request: ${path}`)
    })
    renderEditor(parent)
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "父任务草稿" } })
    expect(await screen.findByRole("button", { name: "编辑 待完成子任务" })).toHaveTextContent(
      /^编辑$/,
    )
    const completeChild = await screen.findByRole("button", { name: "完成 待完成子任务" })
    fireEvent.click(completeChild)
    await waitFor(() => expect(completeChild).not.toBeDisabled())

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))

    await waitFor(() => {
      const patch = vi
        .mocked(apiRequest)
        .mock.calls.find(
          ([path, _schema, init]) => path === `/api/items/${parent.id}` && init?.method === "PATCH",
        )
      expect(JSON.parse(String(patch?.[2]?.body))).toMatchObject({
        expectedVersion: 3,
        title: "父任务草稿",
      })
    })
  })
})

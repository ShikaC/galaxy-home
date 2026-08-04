import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { VoiceCapture } from "../../src/client/components/VoiceCapture.js"
import { apiRequest } from "../../src/client/lib/api.js"

vi.mock("../../src/client/lib/api.js", () => ({ apiRequest: vi.fn() }))

const stopTrack = vi.fn()
const fakeStream = { getTracks: () => [{ stop: stopTrack }] }

class FakeMediaRecorder {
  static latest: FakeMediaRecorder | null = null
  mimeType = "audio/webm"
  ondataavailable: ((event: { readonly data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  state = "inactive"

  constructor(readonly stream: typeof fakeStream) {
    FakeMediaRecorder.latest = this
  }

  start() {
    this.state = "recording"
  }

  pause() {
    this.state = "paused"
  }

  resume() {
    this.state = "recording"
  }

  stop() {
    this.state = "inactive"
    this.ondataavailable?.({ data: new Blob(["voice-bytes"], { type: this.mimeType }) })
    this.onstop?.()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  FakeMediaRecorder.latest = null
  stopTrack.mockClear()
})

describe("VoiceCapture", () => {
  it("keeps a failed recording available for retry", async () => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder)
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
    })
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new Error("转写服务暂时不可用"))
      .mockResolvedValueOnce({ text: "重试后可以编辑的文字" })
    const onText = vi.fn()
    render(<VoiceCapture onText={onText} />)

    fireEvent.click(screen.getByRole("button", { name: "开始录音" }))
    await screen.findByRole("button", { name: "结束并转写" })
    fireEvent.click(screen.getByRole("button", { name: "结束并转写" }))

    expect(await screen.findByText("转写服务暂时不可用")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重试转写" })).toBeEnabled()
    expect(apiRequest).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "重试转写" }))
    await waitFor(() => expect(onText).toHaveBeenCalledWith("重试后可以编辑的文字"))
    expect(screen.getByRole("button", { name: "开始录音" })).toBeInTheDocument()
    expect(apiRequest).toHaveBeenCalledTimes(2)
  })
})

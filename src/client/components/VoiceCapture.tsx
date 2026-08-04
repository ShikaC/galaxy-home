import { Mic, Pause, Play, Square, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"
import { apiRequest } from "../lib/api.js"
import { IconButton } from "./ui/IconButton.js"

const transcriptionSchema = z.object({ text: z.string() })

export function VoiceCapture({ onText }: { readonly onText: (text: string) => void }) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [seconds, setSeconds] = useState(0)
  const [state, setState] = useState<"idle" | "recording" | "paused" | "transcribing">("idle")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (state !== "recording") return
    const timer = window.setInterval(() => setSeconds((value) => Math.min(120, value + 1)), 1_000)
    return () => window.clearInterval(timer)
  }, [state])
  useEffect(() => {
    if (seconds >= 120) recorderRef.current?.stop()
  }, [seconds])

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        stream.getTracks().forEach((track) => {
          track.stop()
        })
        chunksRef.current = []
        setState("transcribing")
        const form = new FormData()
        form.set("file", blob, "capture.webm")
        void apiRequest("/api/transcribe", transcriptionSchema, { method: "POST", body: form })
          .then((result) => {
            onText(result.text)
            setState("idle")
            setSeconds(0)
          })
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "转写失败")
            setState("idle")
          })
      }
      recorder.start()
      recorderRef.current = recorder
      setSeconds(0)
      setState("recording")
    } catch {
      setError("无法使用麦克风，请检查浏览器权限")
    }
  }
  const cancel = () => {
    const recorder = recorderRef.current
    if (recorder !== null) {
      recorder.onstop = null
      recorder.stream.getTracks().forEach((track) => {
        track.stop()
      })
      if (recorder.state !== "inactive") recorder.stop()
    }
    chunksRef.current = []
    setState("idle")
    setSeconds(0)
  }
  if (state === "idle")
    return (
      <div className="voice-row">
        <IconButton label="开始录音" onClick={() => void start()}>
          <Mic size={18} />
        </IconButton>
        <span>{error ?? "语音随手记"}</span>
      </div>
    )
  return (
    <div className="voice-row voice-row--active">
      <span className="record-dot" />
      <strong>
        {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
      </strong>
      <span>
        {state === "transcribing" ? "正在转写..." : state === "paused" ? "已暂停" : "正在录音"}
      </span>
      {state === "recording" ? (
        <IconButton
          label="暂停录音"
          onClick={() => {
            recorderRef.current?.pause()
            setState("paused")
          }}
        >
          <Pause size={17} />
        </IconButton>
      ) : state === "paused" ? (
        <IconButton
          label="继续录音"
          onClick={() => {
            recorderRef.current?.resume()
            setState("recording")
          }}
        >
          <Play size={17} />
        </IconButton>
      ) : null}
      <IconButton
        disabled={state === "transcribing"}
        label="结束并转写"
        onClick={() => recorderRef.current?.stop()}
      >
        <Square size={16} />
      </IconButton>
      <IconButton label="取消录音" onClick={cancel}>
        <Trash2 size={17} />
      </IconButton>
    </div>
  )
}

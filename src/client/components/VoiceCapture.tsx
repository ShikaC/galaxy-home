import { Mic, Pause, Play, RefreshCw, Square, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"
import { apiRequest } from "../lib/api.js"
import { IconButton } from "./ui/IconButton.js"

const transcriptionSchema = z.object({ text: z.string() })

export function VoiceCapture({ onText }: { readonly onText: (text: string) => void }) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<Blob | null>(null)
  const requestRef = useRef(0)
  const [seconds, setSeconds] = useState(0)
  const [state, setState] = useState<"idle" | "recording" | "paused" | "transcribing" | "failed">(
    "idle",
  )
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (state !== "recording") return
    const timer = window.setInterval(() => setSeconds((value) => Math.min(120, value + 1)), 1_000)
    return () => window.clearInterval(timer)
  }, [state])
  useEffect(() => {
    if (seconds >= 120) recorderRef.current?.stop()
  }, [seconds])
  useEffect(
    () => () => {
      requestRef.current += 1
      const recorder = recorderRef.current
      if (recorder !== null) {
        recorder.onstop = null
        recorder.stream.getTracks().forEach((track) => {
          track.stop()
        })
        if (recorder.state !== "inactive") recorder.stop()
      }
      chunksRef.current = []
      audioRef.current = null
    },
    [],
  )

  const requestTranscription = async (blob: Blob) => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setState("transcribing")
    setError(null)
    const form = new FormData()
    form.set("file", blob, "capture.webm")
    try {
      const result = await apiRequest("/api/transcribe", transcriptionSchema, {
        method: "POST",
        body: form,
      })
      if (requestRef.current !== requestId) return
      audioRef.current = null
      onText(result.text)
      setState("idle")
      setSeconds(0)
    } catch (reason) {
      if (requestRef.current !== requestId) return
      setError(reason instanceof Error ? reason.message : "转写失败")
      setState("failed")
    }
  }

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      audioRef.current = null
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        stream.getTracks().forEach((track) => {
          track.stop()
        })
        chunksRef.current = []
        recorderRef.current = null
        audioRef.current = blob
        void requestTranscription(blob)
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
    requestRef.current += 1
    const recorder = recorderRef.current
    if (recorder !== null) {
      recorder.onstop = null
      recorder.stream.getTracks().forEach((track) => {
        track.stop()
      })
      if (recorder.state !== "inactive") recorder.stop()
    }
    recorderRef.current = null
    chunksRef.current = []
    audioRef.current = null
    setError(null)
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
        {state === "transcribing"
          ? "正在转写..."
          : state === "failed"
            ? (error ?? "转写失败，录音仍保留")
            : state === "paused"
              ? "已暂停"
              : "正在录音"}
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
      ) : state === "failed" ? (
        <IconButton
          label="重试转写"
          onClick={() => {
            const audio = audioRef.current
            if (audio !== null) void requestTranscription(audio)
          }}
        >
          <RefreshCw size={17} />
        </IconButton>
      ) : null}
      {state === "recording" || state === "paused" ? (
        <IconButton label="结束并转写" onClick={() => recorderRef.current?.stop()}>
          <Square size={16} />
        </IconButton>
      ) : null}
      <IconButton label="取消录音" onClick={cancel}>
        <Trash2 size={17} />
      </IconButton>
    </div>
  )
}

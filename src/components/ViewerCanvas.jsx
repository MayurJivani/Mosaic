import { useRef, useState, useEffect, useCallback, useMemo } from "react"
import { useSync } from "../lib/useSync"
import { getClipVideoStyle } from "../lib/clips"
import { resolvePlaybackUrl } from "../lib/mediaUrl"

function detectDevice(w, h) {
  if (h > w) return "portrait"
  if (w >= 1024) return "desktop"
  return "landscape"
}

function getRoomId() {
  return new URLSearchParams(window.location.search).get("room") ?? null
}

export default function ViewerCanvas() {
  const [roomId] = useState(() => getRoomId())
  const [videoUrl, setVideoUrl] = useState(null)
  const [clip, setClip] = useState("full")
  const viewerId = useMemo(
    () =>
      `v_${Math.random().toString(36).slice(2, 11)}${Math.random().toString(36).slice(2, 11)}`,
    [],
  )
  const [deviceInfo, setDeviceInfo] = useState(() => {
    const { innerWidth: w, innerHeight: h } = window
    return { w, h, type: detectDevice(w, h) }
  })
  const [connected, setConnected] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  const videoRef = useRef(null)
  const videoUrlRef = useRef(null)
  videoUrlRef.current = videoUrl

  const transportRef = useRef({ playing: false, time: 0 })
  const [transportEpoch, setTransportEpoch] = useState(0)

  const bumpTransport = useCallback(() => {
    setTransportEpoch((n) => n + 1)
  }, [])

  const applyTransportToVideo = useCallback((v) => {
    if (!v) return
    const { playing, time } = transportRef.current
    if (typeof time === "number" && !Number.isNaN(time))
      v.currentTime = Math.max(0, time)
    if (playing)
      v.play().catch((e) => console.warn("[Mosaic viewer] play blocked:", e?.message ?? e))
    else v.pause()
  }, [])

  const { send } = useSync({
    roomId,
    host: false,
    viewerId,
    device: deviceInfo,
    onClipUpdate: (c) => setClip(c),
    onVideoUrl: (url) => {
      setVideoUrl(resolvePlaybackUrl(url))
      setConnected(true)
      bumpTransport()
    },
    onState: (state) => {
      setConnected(true)
      if (state.videoUrl != null) setVideoUrl(resolvePlaybackUrl(state.videoUrl))
      transportRef.current = {
        playing: !!state.playing,
        time: state.currentTime ?? 0,
      }
      bumpTransport()
    },
    onPlay: (time) => {
      transportRef.current = {
        playing: true,
        time: time ?? transportRef.current.time,
      }
      const v = videoRef.current
      if (v && videoUrlRef.current) applyTransportToVideo(v)
      bumpTransport()
    },
    onPause: (time) => {
      transportRef.current = {
        playing: false,
        time: time ?? transportRef.current.time,
      }
      const v = videoRef.current
      if (v) {
        if (time != null && !Number.isNaN(time)) v.currentTime = Math.max(0, time)
        v.pause()
      }
      bumpTransport()
    },
    onSeek: (time) => {
      if (time == null || Number.isNaN(time)) return
      transportRef.current = { ...transportRef.current, time }
      const v = videoRef.current
      if (v) v.currentTime = Math.max(0, time)
      bumpTransport()
    },
  })

  useEffect(() => {
    const v = videoRef.current
    if (!v || !videoUrl) return

    const run = () => applyTransportToVideo(v)

    if (v.readyState >= 2) run()
    else {
      const once = () => run()
      v.addEventListener("canplay", once, { once: true })
      v.addEventListener("loadeddata", once, { once: true })
      return () => {
        v.removeEventListener("canplay", once)
        v.removeEventListener("loadeddata", once)
      }
    }
  }, [videoUrl, transportEpoch, applyTransportToVideo])

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth, h = window.innerHeight
      const type = detectDevice(w, h)
      const next = { w, h, type }
      setDeviceInfo(next)
      if (roomId) send({ type: "device-update", roomId, device: next })
    }
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [roomId, send])

  const copyUrl = () => {
    navigator.clipboard.writeText(location.href).then(() => {
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 2200)
    })
  }

  return (
    <div className="relative w-full h-full bg-canvas overflow-hidden">

      {videoUrl ? (
        <div className="absolute inset-0 overflow-hidden bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            style={getClipVideoStyle(clip)}
            loop
            muted
            playsInline
            preload="auto"
            className="pointer-events-none"
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 select-none">
          <div className="space-y-2 text-center">
            <div
              className="font-display tracking-widest text-accent leading-none"
              style={{ fontSize: "clamp(2rem, 8vw, 4rem)" }}
            >
              MOSAIC
            </div>
            <div className="text-[10px] font-mono text-muted tracking-[0.25em] uppercase">
              waiting for host signal…
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-border animate-pulse" />
            <span className="text-[9px] font-mono text-muted/60 tracking-wide">{roomId}</span>
          </div>
          <div
            className="absolute inset-0 -z-10 pointer-events-none opacity-30"
            style={{
              backgroundImage: "radial-gradient(circle, #252520 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>
      )}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
          backgroundSize: "200px 200px",
          zIndex: 10,
        }}
      />

      <div className="absolute top-4 left-4 right-4 z-20 flex items-start justify-between pointer-events-none">
        <div>
          <div className="font-display text-xl text-accent tracking-widest leading-none">MOSAIC</div>
          <div className="text-[8px] font-mono text-muted mt-0.5 tracking-widest opacity-60">by futile.studio</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`text-[8px] font-mono tracking-widest px-2 py-0.5 rounded-sm ${
            connected ? "bg-accent/15 text-accent" : "bg-border/40 text-muted"
          }`}>
            {connected ? "● live" : "○ connecting"}
          </span>
          <span className="text-[7px] font-mono text-muted/50 tracking-wide">
            {deviceInfo.type}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={copyUrl}
        className="absolute right-4 z-20 text-[7px] font-mono tracking-widest text-muted hover:text-accent transition-colors bg-surface/60 border border-border/60 px-2 py-1 rounded-sm backdrop-blur-sm"
        style={{ top: "4.5rem" }}
      >
        {copyDone ? "✓ copied" : "share viewer link"}
      </button>
    </div>
  )
}

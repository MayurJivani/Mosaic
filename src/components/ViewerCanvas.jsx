import { useRef, useState, useEffect, useCallback } from "react"
import { useSync } from "../lib/useSync"

function getCustomClipStyle(clip) {
  if (clip === "full" || !clip) {
    return { position: "absolute", width: "100%", height: "100%", left: 0, top: 0, objectFit: "cover", pointerEvents: "none" }
  }
  return {
    position: "absolute",
    width:  `${100 / clip.w}%`,
    height: `${100 / clip.h}%`,
    left:   `-${(clip.x / clip.w) * 100}%`,
    top:    `-${(clip.y / clip.h) * 100}%`,
    objectFit: "cover",
    pointerEvents: "none",
  }
}

function detectDevice(w, h) {
  if (h > w) return "portrait"
  if (w >= 1024) return "desktop"
  return "landscape"
}

// Read roomId from ?room=<roomId> query param
function getRoomId() {
  return new URLSearchParams(window.location.search).get("room") ?? null
}

export default function ViewerCanvas() {
  const [roomId]   = useState(() => getRoomId())
  const [videoUrl, setVideoUrl]   = useState(null)
  const [clip, setClip]           = useState("full")
  const [deviceInfo] = useState(() => {
    const { innerWidth: w, innerHeight: h } = window
    return { w, h, type: detectDevice(w, h) }
  })
  const [device, setDevice]       = useState(deviceInfo.type)
  const [connected, setConnected] = useState(false)
  const [copyDone, setCopyDone]   = useState(false)
  const [playing, setPlaying]     = useState(false)
  const videoRef = useRef(null)

  // ── detect orientation ────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth, h = window.innerHeight
      setDevice(detectDevice(w, h))
    }
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const applyTime = useCallback((time) => {
    if (!videoRef.current || time == null) return
    videoRef.current.currentTime = time
  }, [])

  // ── sync ──────────────────────────────────────────────────────────────
  useSync({
    roomId,
    host: false,
    device: deviceInfo,
    onClipUpdate: (c) => setClip(c),
    onVideoUrl: (url) => {
      setVideoUrl(url)
      setConnected(true)
    },
    onState: (state) => {
      setConnected(true)
      if (state.videoUrl) setVideoUrl(state.videoUrl)
      // Defer play until video is ready
      if (state.playing) {
        const tryPlay = () => {
          if (!videoRef.current) return
          applyTime(state.currentTime)
          videoRef.current.play().catch(() => {})
          setPlaying(true)
        }
        if (videoRef.current?.readyState >= 2) tryPlay()
        else videoRef.current?.addEventListener("canplay", tryPlay, { once: true })
      }
    },
    onPlay: (time) => {
      applyTime(time)
      videoRef.current?.play().catch(() => {})
      setPlaying(true)
    },
    onPause: (time) => {
      applyTime(time)
      videoRef.current?.pause()
      setPlaying(false)
    },
    onSeek: (time) => applyTime(time),
  })

  const copyUrl = () => {
    navigator.clipboard.writeText(location.href).then(() => {
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 2200)
    })
  }

  // ── render ────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full bg-canvas overflow-hidden">

      {/* main video */}
      {videoUrl ? (
        <div className="absolute inset-0 overflow-hidden bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            style={getCustomClipStyle(clip)}
            loop muted playsInline
            className="pointer-events-none"
          />
        </div>
      ) : (
        /* waiting state */
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
          {/* dot grid decoration */}
          <div
            className="absolute inset-0 -z-10 pointer-events-none opacity-30"
            style={{
              backgroundImage: "radial-gradient(circle, #252520 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>
      )}

      {/* grain overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
          backgroundSize: "200px 200px",
          zIndex: 10,
        }}
      />

      {/* top HUD */}
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
            {device}
          </span>
        </div>
      </div>

      {/* share url — top right below status */}
      <button
        onClick={copyUrl}
        className="absolute right-4 z-20 text-[7px] font-mono tracking-widest text-muted hover:text-accent transition-colors bg-surface/60 border border-border/60 px-2 py-1 rounded-sm backdrop-blur-sm"
        style={{ top: "4.5rem" }}
      >
        {copyDone ? "✓ copied" : "share viewer link"}
      </button>
      {/* no more manual clip picker */}
    </div>
  )
}

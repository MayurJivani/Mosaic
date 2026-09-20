import { useRef, useState, useEffect, useCallback } from "react"
import { useRoom } from "../lib/useSync"
import { resolvePlaybackUrl } from "../lib/mediaUrl"
import { widgetStyle, isRenderedOnStream } from "../lib/widgetStyle"

/**
 * The OBS browser source. Transparent, read-only, renders whatever the mods
 * have placed. This page only ever shows the stream canvas; all chrome lives
 * on the mod board.
 */
export default function OverlayCanvas() {
  const [room] = useState(() => new URLSearchParams(window.location.search).get("room"))
  const [widgets, setWidgets] = useState([])
  const [canvas, setCanvas] = useState({ w: 1920, h: 1080 })

  const audioRefs = useRef(new Map())
  const audioLocks = useRef([])

  const unlockAttempts = useRef(0)
  const unlockAudio = useCallback(() => {
    unlockAttempts.current += 1
    if (unlockAttempts.current > 1) return
    const pending = audioLocks.current
    audioLocks.current = []
    for (const id of pending) audioRefs.current.get(id)?.play().catch(() => {})
  }, [])

  useEffect(() => {
    const tryUnlock = () => unlockAudio()
    window.addEventListener("pointerdown", tryUnlock)
    window.addEventListener("wheel", tryUnlock)
    window.addEventListener("keydown", tryUnlock)
    return () => {
      window.removeEventListener("pointerdown", tryUnlock)
      window.removeEventListener("wheel", tryUnlock)
      window.removeEventListener("keydown", tryUnlock)
    }
  }, [unlockAudio])

  const sync = useRoom({
    roomId: room,
    role: "overlay",
    onState: (s) => {
      setCanvas({ w: s.canvasW, h: s.canvasH })
      setWidgets(s.widgets ?? [])
    },
    onWidgetPut: (w) => setWidgets((p) => {
      const i = p.findIndex((x) => x.id === w.id)
      if (i < 0) return [...p, w]
      const next = [...p]
      next[i] = w
      return next
    }),
    onWidgetDel: (id) => setWidgets((p) => p.filter((x) => x.id !== id)),
    onPlaySound: (id) => {
      const el = audioRefs.current.get(id)
      if (!el) return
      el.currentTime = 0
      const p = el.play()
      if (p) p.catch(() => audioLocks.current.push(id))
    },
  })

  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const fit = Math.min(viewport.w / canvas.w, viewport.h / canvas.h)

  const audioRef = (w) => (node) => {
    if (node) audioRefs.current.set(w.id, node)
    else audioRefs.current.delete(w.id)
  }

  if (!room) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ pointerEvents: "none" }}>
      <div className="relative" style={{ width: canvas.w, height: canvas.h, transform: `scale(${fit})`, flexShrink: 0 }}>
        {widgets.map((w) => {
          if (!isRenderedOnStream(w)) return null
          const pos = widgetStyle(w)

          if (w.type === "text") {
            return (
              <div key={w.id} style={{
                ...pos, display: "flex", alignItems: "center", justifyContent: "center",
                color: w.color, fontSize: w.size, fontWeight: w.bold ? 700 : 400,
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em",
                lineHeight: 1, textAlign: "center", overflow: "hidden", padding: 4,
              }}>
                {w.content}
              </div>
            )
          }

          if (w.type === "emoji") {
            const isEmoteUrl = typeof w.content === "string" && (
              w.content.startsWith("http:") ||
              w.content.startsWith("https:") ||
              w.content.startsWith("//") ||
              w.content.startsWith("data:") ||
              w.content.includes("/") ||
              w.content.includes(".")
            )
            if (isEmoteUrl) {
              const emoteSrc = w.content.startsWith("//") ? `https:${w.content}` : w.content
              return <img key={w.id} src={emoteSrc} alt="" style={{ ...pos, objectFit: "contain" }} draggable="false" />
            }
            return (
              <div key={w.id} style={{
                ...pos, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: w.size || 110, lineHeight: 1, textAlign: "center", overflow: "hidden",
              }}>
                {w.content}
              </div>
            )
          }

          const url = resolvePlaybackUrl(w.content)

          if (w.type === "image") {
            return url
              ? <img key={w.id} src={url} alt="" style={{ ...pos, objectFit: "contain" }} draggable="false" />
              : null
          }

          if (w.type === "video") {
            return url
              ? (
                <video
                  key={w.id} src={url} loop muted autoPlay playsInline preload="auto"
                  style={{ ...pos, objectFit: "contain" }}
                />
              )
              : null
          }

          if (w.type === "sound" && url) {
            return (
              <audio
                key={w.id} src={url} preload="auto"
                ref={audioRef(w)}
              />
            )
          }
          return null
        })}
      </div>
    </div>
  )
}
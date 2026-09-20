import { useState, useRef, useCallback, useEffect } from "react"
import { nanoid } from "nanoid"
import Toolbar from "./Toolbar"
import Inspector from "./Inspector"
import WidgetBox from "./WidgetBox"
import ObjectList from "./ObjectList"
import StreamPreview from "./StreamPreview"
import ChatPanel from "./ChatPanel"
import { useRoom } from "../lib/useSync"
import { useUpload } from "../lib/useUpload"
import { stripToRelayPath, getFileServerOrigin } from "../lib/mediaUrl"

const upsert = (list, w) => {
  const i = list.findIndex((x) => x.id === w.id)
  if (i < 0) return [...list, w]
  const next = [...list]
  next[i] = w
  return next
}

const DEFAULTS = {
  text: (content = "breath, it's just a stream") => ({
    type: "text", x: 80, y: 70, w: 420, h: 110,
    content, size: 56, color: "#c8f04a", bold: true,
    rotation: 0, opacity: 1, zIndex: 0, blur: 0, flipX: false, flipY: false, visible: true, name: "",
  }),
  emoji: (content) => ({
    type: "emoji", x: 90, y: 80, w: 150, h: 150,
    content, size: 110,
    rotation: 0, opacity: 1, zIndex: 0, blur: 0, flipX: false, flipY: false, visible: true, name: "",
  }),
  image: (content) => ({
    type: "image", x: 90, y: 90, w: 280, h: 280, content,
    rotation: 0, opacity: 1, zIndex: 0, blur: 0, flipX: false, flipY: false, visible: true, name: "",
  }),
  video: (content) => ({
    type: "video", x: 110, y: 110, w: 480, h: 270, content,
    rotation: 0, opacity: 1, zIndex: 0, blur: 0, flipX: false, flipY: false, visible: true, name: "",
  }),
  sound: (content, label) => ({
    type: "sound", x: 80, y: 80, w: 200, h: 56, content, label,
    rotation: 0, opacity: 1, zIndex: 0, blur: 0, flipX: false, flipY: false, visible: true, name: "",
  }),
}

/* ─── Shared inline style objects ────────────────────────────────────── */

const inputStyle = {
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  background: "#0D0F14",
  border: "1px solid #2A2F40",
  color: "#E2E4EA",
  padding: "10px 12px",
  borderRadius: 6,
  outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
  width: "100%",
  boxSizing: "border-box",
}

const labelStyle = {
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  color: "#8B90A0",
  fontFamily: "var(--font-mono)",
}

const focusInput = (e) => {
  e.target.style.borderColor = "#c8f04a"
  e.target.style.boxShadow = "0 0 0 3px rgba(200, 240, 74,0.12)"
}
const blurInput = (e) => {
  e.target.style.borderColor = "#2A2F40"
  e.target.style.boxShadow = "none"
}

// ── Pre-room setup: name the show, pick the canvas, get a token ─────────────
function SetupScreen({ onCreate }) {
  const [mode, setMode] = useState("create")
  const [w, setW] = useState(1920)
  const [h, setH] = useState(1080)
  const [nick, setNick] = useState("")
  const [joinCode, setJoinCode] = useState("")
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const presets = [
    { label: "16:9 Desktop", sub: "Twitch / YT / Kick", w: 1920, h: 1080 },
    { label: "9:16 Vertical", sub: "TikTok / Shorts", w: 1080, h: 1920 },
    { label: "1:1 Square", sub: "Instagram / Post", w: 1080, h: 1080 },
  ]

  const goCreate = async () => {
    setBusy(true)
    setError(null)
    try {
      await onCreate(w, h, nick || "mod")
    } catch (e) {
      setError("Could not reach relay server — is node server running?")
    } finally {
      setBusy(false)
    }
  }

  const goJoin = () => {
    if (!joinCode.trim()) {
      setError("Please enter a room code or room URL")
      return
    }
    let code = joinCode.trim()
    if (code.includes("room=")) {
      const match = code.match(/room=([^&]+)/)
      if (match) code = match[1]
    }
    window.location.search = `?room=${encodeURIComponent(code)}`
  }

  const tabStyle = (active) => ({
    flex: 1,
    padding: "9px 0",
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    background: active ? "#1A1E2A" : "none",
    color: active ? "#c8f04a" : "#757B8E",
    border: active ? "1px solid rgba(200,240,74,0.2)" : "1px solid transparent",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
    transition: "all 0.2s",
  })

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      background: "radial-gradient(ellipse at 50% 10%, rgba(200, 240, 74, 0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(163, 216, 42, 0.04) 0%, transparent 50%), #0D0F14",
      overflowY: "auto",
    }}>
      {/* Subtle grid */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "radial-gradient(rgba(200, 240, 74, 0.03) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative",
        zIndex: 10,
        width: "100%",
        maxWidth: 480,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(200, 240, 74, 0.08)",
            border: "1px solid rgba(200, 240, 74, 0.15)",
            padding: "4px 12px",
            borderRadius: 20,
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            color: "#c8f04a",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}>
            <span className="status-dot live" /> LIVE OVERLAY STUDIO
          </div>

          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: 52,
            color: "#c8f04a",
            letterSpacing: "0.2em",
            lineHeight: 1,
            margin: 0,
            textShadow: "0 0 60px rgba(200, 240, 74, 0.25)",
          }}>MOSAIC</h1>

          <p style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "#8B90A0",
            letterSpacing: "0.18em",
            marginTop: 6,
            textTransform: "uppercase",
          }}>Remote Stream Helper for Streamers and Mods</p>
        </div>

        {/* Feature Tags */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          flexWrap: "wrap",
          fontSize: 9,
          fontFamily: "var(--font-mono)",
        }}>
          {["OBS Studio Sync", "TTV / BTTV Emotes", "Clips / Soundboard", "Mod Chat"].map((tag) => (
            <span key={tag} style={{
              background: "#131620",
              border: "1px solid #2A2F40",
              padding: "4px 10px",
              borderRadius: 12,
              color: "#8B90A0",
            }}>
              {tag}
            </span>
          ))}
        </div>

        {/* Main Card */}
        <div style={{
          background: "rgba(19, 22, 32, 0.85)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(200, 240, 74, 0.12)",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 60px rgba(200,240,74,0.03)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}>
          {/* Mode Tabs */}
          <div style={{ display: "flex", background: "#0D0F14", padding: 3, borderRadius: 8, gap: 3 }}>
            <button style={tabStyle(mode === "create")} onClick={() => { setMode("create"); setError(null) }}>
              Start New Show
            </button>
            <button style={tabStyle(mode === "join")} onClick={() => { setMode("join"); setError(null) }}>
              Join Room
            </button>
          </div>

          {/* Nickname */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Mod Handle / Nickname</label>
            <input
              type="text"
              placeholder="e.g. TimTheMod"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={32}
              style={inputStyle}
              onFocus={focusInput}
              onBlur={blurInput}
            />
          </div>

          {/* CREATE */}
          {mode === "create" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={labelStyle}>Stream Canvas Resolution</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {presets.map((p) => {
                    const active = w === p.w && h === p.h
                    return (
                      <button
                        key={p.label}
                        type="button"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 3,
                          fontSize: 9,
                          fontFamily: "var(--font-mono)",
                          padding: "10px 4px",
                          borderRadius: 8,
                          border: `1px solid ${active ? "#c8f04a" : "#2A2F40"}`,
                          background: active ? "rgba(200,240,74,0.08)" : "#0D0F14",
                          color: active ? "#c8f04a" : "#8B90A0",
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onClick={() => { setW(p.w); setH(p.h) }}
                      >
                        <span style={{ fontWeight: active ? 600 : 400, color: active ? "#c8f04a" : "#E2E4EA" }}>{p.label}</span>
                        <span style={{ fontSize: 7, color: "#757B8E" }}>{p.sub}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Custom Resolution */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <input
                    type="number"
                    style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }}
                    value={w}
                    onChange={(e) => setW(Number(e.target.value))}
                    placeholder="Width"
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  <span style={{ color: "#757B8E", fontFamily: "var(--font-mono)", fontSize: 14 }}>x</span>
                  <input
                    type="number"
                    style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }}
                    value={h}
                    onChange={(e) => setH(Number(e.target.value))}
                    placeholder="Height"
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </div>
              </div>

              {error && <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "#FF6B6B" }}>{error}</p>}

              <button
                type="button"
                onClick={goCreate}
                disabled={busy || !(w > 0 && h > 0)}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  letterSpacing: "0.15em",
                  background: "linear-gradient(135deg, #c8f04a, #a3d82a)",
                  color: "#0D0F14",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  opacity: busy || !(w > 0 && h > 0) ? 0.4 : 1,
                  boxShadow: "0 8px 30px rgba(200,240,74,0.2)",
                  transition: "transform 0.2s, box-shadow 0.2s, opacity 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(200,240,74,0.3)" }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(200,240,74,0.2)" }}
              >
                {busy ? "LAUNCHING..." : "LAUNCH OVERLAY BOARD"}
              </button>
            </>
          )}

          {/* JOIN */}
          {mode === "join" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Room ID or Room Link</label>
                <input
                  type="text"
                  placeholder="Paste room code or ?room=xyz URL"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") goJoin() }}
                  style={inputStyle}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </div>

              {error && <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "#FF6B6B" }}>{error}</p>}

              <button
                type="button"
                onClick={goJoin}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  letterSpacing: "0.15em",
                  background: "linear-gradient(135deg, #c8f04a, #a3d82a)",
                  color: "#0D0F14",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  boxShadow: "0 8px 30px rgba(200,240,74,0.2)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)" }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)" }}
              >
                JOIN MOD BOARD
              </button>
            </div>
          )}
        </div>

        {/* Workflow Footer */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
          background: "#131620",
          border: "1px solid #2A2F40",
          borderRadius: 10,
          padding: 14,
          fontSize: 8,
          fontFamily: "var(--font-mono)",
          color: "#8B90A0",
          textAlign: "center",
        }}>
          {[
            ["1", "CREATE SHOW", "Launch room and copy the OBS Browser Source link."],
            ["2", "ADD TO OBS", "Add 1920x1080 transparent browser source in OBS."],
            ["3", "MODS CONTROL", "Mods drag GIFs, clips, text and emotes live on stream."],
          ].map(([num, title, desc]) => (
            <div key={num}>
              <div style={{
                width: 20, height: 20,
                borderRadius: "50%",
                background: "rgba(200,240,74,0.1)",
                border: "1px solid rgba(200,240,74,0.2)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: "#c8f04a",
                fontWeight: 600,
                marginBottom: 6,
              }}>{num}</div>
              <span style={{ color: "#c8f04a", fontWeight: 600, display: "block", marginBottom: 3, fontSize: 8 }}>{title}</span>
              {desc}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── The board ────────────────────────────────────────────────────────────────
export default function EditorBoard() {
  const [room] = useState(() => new URLSearchParams(window.location.search).get("room"))
  const [code] = useState(() => new URLSearchParams(window.location.search).get("code"))
  const [nickname] = useState(() => new URLSearchParams(window.location.search).get("nick") || "mod")

  const [widgets, setWidgets] = useState([])
  const [assets, setAssets] = useState([])
  const [stream, setStreamState] = useState({ platform: null, channel: "" })
  const [canvas, setCanvas] = useState({ w: 1920, h: 1080 })
  const [sel, setSel] = useState(null)
  const [notice, setNotice] = useState(null)
  const [pan, setPan] = useState({ x: 70, y: 50 })
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState(null)
  const [resize, setResize] = useState(null)
  const [panning, setPanning] = useState(false)
  const [chatMessages, setChatMessages] = useState([])

  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets
  const canvasRef = useRef(null)
  const { upload } = useUpload()

  const sync = useRoom({
    roomId: room,
    role: "editor",
    code,
    nickname,
    onState: (s) => {
      setCanvas({ w: s.canvasW, h: s.canvasH })
      setWidgets(s.widgets ?? [])
      setAssets(s.assets ?? [])
      setStreamState(s.stream ?? { platform: null, channel: "" })
    },
    onWidgetPut: (w) => setWidgets((p) => upsert(p, w)),
    onWidgetDel: (id) => setWidgets((p) => p.filter((x) => x.id !== id)),
    onWidgetReorder: (order) => {
      setWidgets((prev) => {
        const next = [...prev]
        for (const { id, zIndex } of order) {
          const w = next.find((x) => x.id === id)
          if (w) w.zIndex = zIndex
        }
        return next
      })
    },
    onClearAll: () => setWidgets([]),
    onChat: (msg) => {
      setChatMessages((prev) => [...prev.slice(-200), msg])
    },
    onAssetPut: (a) => setAssets((p) => {
      const i = p.findIndex((x) => x.id === a.id)
      if (i < 0) return [...p, a]
      const next = [...p]; next[i] = a; return next
    }),
    onAssetDel: (id) => setAssets((p) => p.filter((x) => x.id !== id)),
    onStreamSet: (st) => setStreamState(st ?? { platform: null, channel: "" }),
  })

  const { putWidget, deleteWidget, playSound, clearAll, sendChat, putAsset, deleteAsset, setStream, connected } = sync

  const flash = useCallback((text) => {
    setNotice(text)
    const t = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(t)
  }, [])

  const patchWidget = useCallback((id, fields) => {
    const cur = widgetsRef.current.find((w) => w.id === id)
    if (!cur) return
    const next = { ...cur, ...fields }
    setWidgets((p) => p.map((w) => (w.id === id ? next : w)))
    putWidget(next)
  }, [putWidget])

  const addWidget = useCallback((base) => {
    const w = { ...base, id: nanoid(8) }
    setWidgets((p) => [...p, w])
    putWidget(w)
    setSel(w.id)
  }, [putWidget])

  const addText = useCallback(() => {
    const n = widgetsRef.current.length
    addWidget({ ...DEFAULTS.text(), x: 80 + (n % 5) * 24, y: 70 + (n % 4) * 20 })
  }, [addWidget])

  const addEmoji = useCallback((emoji) => {
    const n = widgetsRef.current.length
    const isObj = typeof emoji === "object" && emoji !== null
    const content = isObj ? emoji.url : emoji
    const emoteName = isObj ? emoji.name : ""
    const base = DEFAULTS.emoji(content)
    if (emoteName) base.name = emoteName
    addWidget({ ...base, x: 90 + (n % 5) * 24, y: 80 + (n % 4) * 20 })
  }, [addWidget])

  /** Drop a library entry onto the overlay. */
  const addFromAsset = useCallback((asset) => {
    const n = widgetsRef.current.length
    const o = { x: 100 + (n % 5) * 24, y: 90 + (n % 4) * 20 }
    if (asset.kind === "image") addWidget({ ...DEFAULTS.image(asset.url), ...o })
    else if (asset.kind === "video") addWidget({ ...DEFAULTS.video(asset.url), ...o })
    else addWidget({ ...DEFAULTS.sound(asset.url, asset.name), ...o })
  }, [addWidget])

  const onFile = useCallback(async (kind, file) => {
    const url = await upload(file)
    const content = stripToRelayPath(url)
    const hostOnly = url.startsWith("blob:")
    if (hostOnly) flash("relay unreachable — this file is host-only, the overlay can't load it")
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 60)
    const n = widgetsRef.current.length
    const o = { x: 100 + (n % 5) * 24, y: 90 + (n % 4) * 20 }
    if (kind === "image") addWidget({ ...DEFAULTS.image(content), ...o })
    else if (kind === "video") addWidget({ ...DEFAULTS.video(content), ...o })
    else addWidget({ ...DEFAULTS.sound(content, name), ...o })

    // Keep it in the room's library so any mod can reuse it later without
    // re-uploading. A blob URL is host-only and would be a dead entry for
    // everyone else, so it never goes in.
    if (!hostOnly) putAsset({ id: nanoid(8), kind, url: content, name, ts: Date.now() })
  }, [upload, addWidget, flash, putAsset])

  const onReplace = useCallback(async (kind, id, file) => {
    if (!file) return
    const url = await upload(file)
    const content = stripToRelayPath(url)
    if (url.startsWith("blob:")) flash("relay unreachable — this file is host-only, the overlay can't load it")
    patchWidget(id, kind === "sound"
      ? { content, label: file.name.replace(/\.[^.]+$/, "").slice(0, 60) }
      : { content })
  }, [upload, patchWidget, flash])

  const deleteSel = useCallback((id) => {
    setWidgets((p) => p.filter((x) => x.id !== id))
    deleteWidget(id)
    setSel((s) => (s === id ? null : s))
  }, [deleteWidget])

  const duplicateWidget = useCallback((id) => {
    const w = widgetsRef.current.find((x) => x.id === id)
    if (!w) return
    addWidget({ ...w, x: w.x + 20, y: w.y + 20, name: w.name ? `${w.name} copy` : "" })
  }, [addWidget])

  // ── drag / resize / pan ────────────────────────────────────────────────────
  const startDrag = useCallback((e, id) => {
    e.stopPropagation()
    const w = widgetsRef.current.find((x) => x.id === id)
    if (!w) return
    setDrag({ id, sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y })
    setSel(id)
  }, [])

  const startResize = useCallback((e, id) => {
    e.stopPropagation()
    const w = widgetsRef.current.find((x) => x.id === id)
    if (!w) return
    setSel(id)
    setResize({ id, sx: e.clientX, sy: e.clientY, ow: w.w, oh: w.h })
  }, [])

  const onMouseMove = useCallback((e) => {
    if (panning) {
      setPan((p) => ({ x: p.x + e.movementX, y: p.y + e.movementY }))
      return
    }
    if (resize) {
      const dx = (e.clientX - resize.sx) / zoom
      const dy = (e.clientY - resize.sy) / zoom
      patchWidget(resize.id, { w: Math.max(8, resize.ow + dx), h: Math.max(8, resize.oh + dy) })
      return
    }
    if (!drag) return
    patchWidget(drag.id, {
      x: drag.ox + (e.clientX - drag.sx) / zoom,
      y: drag.oy + (e.clientY - drag.sy) / zoom,
    })
  }, [drag, resize, panning, zoom, patchWidget])

  const onMouseUp = useCallback(() => {
    setDrag(null)
    setResize(null)
    setPanning(false)
  }, [])

  const onCanvasDown = useCallback((e) => {
    if (e.target === canvasRef.current || e.target.dataset.bg) {
      setPanning(true)
      setSel(null)
    }
  }, [])

  const onWheel = useCallback((e) => {
    if (e.target.closest && e.target.closest(".sidebar-panel, .sidebar-panel-right, [data-popover], .modal-backdrop, .modal-box")) {
      return
    }
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    setZoom((z) => {
      const nz = Math.min(4, Math.max(0.15, z * factor))
      setPan((p) => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
      return nz
    })
  }, [])

  const fitView = useCallback(() => {
    const el = canvasRef.current
    const vw = el?.clientWidth || window.innerWidth
    const vh = el?.clientHeight || window.innerHeight
    const pad = 140
    const z = Math.min(4, Math.max(0.05, Math.min((vw - pad) / canvas.w, (vh - pad) / canvas.h)))
    setZoom(z)
    setPan({ x: (vw - canvas.w * z) / 2, y: (vh - canvas.h * z) / 2 })
  }, [canvas.w, canvas.h])

  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !canvas.w || !canvas.h) return
    fitted.current = true
    fitView()
  }, [canvas.w, canvas.h, fitView])

  useEffect(() => {
    window.addEventListener("mouseup", onMouseUp)
    const el = canvasRef.current
    el?.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      window.removeEventListener("mouseup", onMouseUp)
      el?.removeEventListener("wheel", onWheel)
    }
  }, [onMouseUp, onWheel])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target !== document.body) return
      if (e.key === "Escape") { setSel(null); return }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (sel) deleteSel(sel)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault()
        if (sel) duplicateWidget(sel)
        return
      }
      if (sel && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const w = widgetsRef.current.find((x) => x.id === sel)
        if (!w) return
        const delta = {}
        if (e.key === "ArrowUp") delta.y = w.y - step
        if (e.key === "ArrowDown") delta.y = w.y + step
        if (e.key === "ArrowLeft") delta.x = w.x - step
        if (e.key === "ArrowRight") delta.x = w.x + step
        patchWidget(sel, delta)
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [sel, deleteSel, duplicateWidget, patchWidget])

  // ── pre-room states ────────────────────────────────────────────────────────
  if (!room) {
    return (
      <SetupScreen
        onCreate={async (w, h, nick) => {
          const res = await fetch(`${getFileServerOrigin()}/room?canvasW=${w}&canvasH=${h}`, { method: "POST" })
          if (!res.ok) throw new Error("bad response")
          const { roomId, token } = await res.json()
          history.replaceState(null, "", `/?room=${roomId}&code=${token}&nick=${encodeURIComponent(nick)}`)
          window.location.reload()
        }}
      />
    )
  }

  if (!code) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0D0F14",
        padding: 24,
      }}>
        <p style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "#8B90A0",
          textAlign: "center",
          lineHeight: 1.6,
          maxWidth: 360,
        }}>
          This room link is for the <span style={{ color: "#c8f04a" }}>OBS overlay</span> (open
          <span style={{ color: "#757B8E" }}> /overlay?room={room}</span> in a browser source). The mod
          board needs the link with <span style={{ color: "#c8f04a" }}>code=</span> — the one your
          streamer hands out.
        </p>
      </div>
    )
  }

  const stamp = () => Math.round(zoom * 100)
  const frame = { x: 0, y: 0, w: canvas.w, h: canvas.h }
  const overlayUrl = `${window.location.origin}/overlay?room=${encodeURIComponent(room)}`
  const modUrl = `${window.location.origin}/?room=${encodeURIComponent(room)}&code=${code}`

  return (
    <div style={{
      display: "flex",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "#0D0F14",
    }}>
      {/* LEFT SIDEBAR */}
      <div className="sidebar-panel" style={{ width: 280, flexShrink: 0, zIndex: 40 }}>
        {/* Logo */}
        <div style={{
          padding: "14px 14px 8px",
          borderBottom: "1px solid #1E2233",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              color: "#c8f04a",
              letterSpacing: "0.15em",
              lineHeight: 1,
            }}>MOSAIC</h1>
            <span style={{
              fontSize: 8,
              fontFamily: "var(--font-mono)",
              color: "#757B8E",
              letterSpacing: "0.1em",
            }}>control</span>
          </div>
        </div>

        {/* Stream Preview */}
        <StreamPreview room={room} connected={connected} stream={stream} onSetStream={setStream} />

        <div style={{ height: 1, background: "#1E2233" }} />

        {/* Object List */}
        <ObjectList
          widgets={widgets}
          selectedId={sel}
          onSelect={setSel}
          onDelete={deleteSel}
          onPatch={patchWidget}
          onAddText={addText}
          onAddEmoji={addEmoji}
          onFile={onFile}
        />

        {/* Properties quick view */}
        {sel && widgets.find((w) => w.id === sel) && (
          <div style={{
            borderTop: "1px solid #1E2233",
            padding: "8px 14px",
          }}>
            <p style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              color: "#757B8E",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: 4,
            }}>
              {widgets.find((w) => w.id === sel)?.name || sel}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {[["X", "x"], ["Y", "y"]].map(([label, key]) => {
                const w = widgets.find((x) => x.id === sel)
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "#757B8E" }}>{label}:</span>
                    <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "#E2E4EA" }}>{Math.round(w?.[key] || 0)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Chat Panel */}
        <ChatPanel
          messages={chatMessages}
          onSend={sendChat}
          nickname={nickname}
        />
      </div>

      {/* CENTER CANVAS */}
      <div
        ref={canvasRef}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          cursor: "default",
          userSelect: "none",
        }}
        onMouseMove={onMouseMove}
        onMouseDown={onCanvasDown}
      >
        {/* Dot grid background */}
        <div
          data-bg="1"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(circle, #1E2233 1px, transparent 1px)",
            backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        {/* Canvas transform layer */}
        <div
          style={{
            position: "absolute",
            transformOrigin: "top left",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* Stream rectangle */}
          <div
            style={{
              position: "absolute",
              left: frame.x,
              top: frame.y,
              width: frame.w,
              height: frame.h,
              border: "1px solid rgba(200, 240, 74,0.2)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
            }}
          >
            <span style={{
              position: "absolute",
              top: 4,
              left: 4,
              fontSize: 8,
              fontFamily: "var(--font-mono)",
              color: "rgba(200, 240, 74,0.5)",
              letterSpacing: "0.12em",
              pointerEvents: "none",
            }}>
              {frame.w}x{frame.h}
            </span>
          </div>

          {/* Widgets */}
          {widgets.map((w) => (
            <WidgetBox
              key={w.id}
              widget={w}
              isSelected={sel === w.id}
              onMouseDown={(e) => startDrag(e, w.id)}
              onResizeStart={(e) => startResize(e, w.id)}
              onDelete={() => deleteSel(w.id)}
              onPlaySound={playSound}
            />
          ))}
        </div>

        {/* Toolbar */}
        <Toolbar
          assets={assets}
          onAddFromAsset={addFromAsset}
          onDeleteAsset={deleteAsset}
          onAddText={addText}
          onAddEmoji={addEmoji}
          onFile={onFile}
          onResetView={fitView}
          onClearAll={clearAll}
          widgetCount={widgets.length}
          connected={connected}
          overlayUrl={overlayUrl}
          modUrl={modUrl}
          onToast={flash}
        />

        {/* Status bar */}
        <div style={{
          position: "fixed",
          bottom: 16,
          left: 296,
          zIndex: 50,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}>
          <span style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            color: "#757B8E",
            letterSpacing: "0.1em",
          }}>
            {stamp()}% — scroll = zoom / drag canvas = pan / del = remove / esc = deselect / ctrl+d = duplicate
          </span>
          {notice && <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "#FFB347" }}>{notice}</span>}
        </div>
      </div>

      {/* RIGHT SIDEBAR (Inspector) */}
      <Inspector
        widget={widgets.find((w) => w.id === sel) ?? null}
        onPatch={patchWidget}
        onReplace={onReplace}
        onDelete={deleteSel}
        onPlaySound={playSound}
        onDuplicate={duplicateWidget}
      />
    </div>
  )
}

function CopyLink({ label, url, accent }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      style={{
        fontSize: 8,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        fontFamily: "var(--font-mono)",
        padding: "7px 10px",
        borderRadius: 4,
        border: "none",
        cursor: "pointer",
        transition: "all 0.15s",
        background: accent ? "#c8f04a" : "#1A1E2A",
        color: accent ? "#0D0F14" : "#8B90A0",
      }}
      onClick={() => {
        navigator.clipboard?.writeText(url).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        })
      }}
      title={url}
    >
      {copied ? "Done" : label}
    </button>
  )
}
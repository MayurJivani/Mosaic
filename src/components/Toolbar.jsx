import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import {
  PRESET_EMOTES,
  fetchBTTVGlobal,
  fetch7TVGlobal,
  fetchFFZGlobal,
  fetchStreamerEmotes,
  search7TVEmotes,
} from "../lib/emotes"

const EMOJI_CATEGORIES = {
  "Faces": ["😂", "🤣", "😭", "😳", "🤯", "💀", "🫠", "😤", "🥶", "🤮", "😱", "🥴", "🤡", "👻", "😈", "🫡"],
  "Reactions": ["🔥", "🗿", "👑", "🍿", "🎉", "👀", "🤌", "💅", "✨", "💯", "⚡", "🏆", "🎯", "💣", "🚀", "🫶"],
  "Animals": ["🐸", "🦍", "🐒", "🐱", "🐶", "🦆", "🐻", "🐧", "🦎", "🐢", "🐍", "🐠", "🦈", "🐝", "🦋", "🐔"],
  "Misc": ["❤️", "💜", "💙", "💚", "🖤", "💔", "🏳️", "🚨", "📢", "🔔", "💰", "🎮", "🎵", "🍕", "🧠", "💎"],
}

const POPULAR_STREAMERS = ["ludwig", "xqc", "tarik", "kai_cenat", "hasanabi", "papaplatte"]

/* ── Shared style objects ────────────────────────────────────────────── */

const barBtn = {
  padding: "6px 10px",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontFamily: "var(--font-mono)",
  color: "#8B90A0",
  background: "none",
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background 0.15s, color 0.15s",
}

const pillBtn = (active) => ({
  padding: "3px 10px",
  fontSize: 8,
  fontFamily: "var(--font-mono)",
  borderRadius: 12,
  border: active ? "1px solid #c8f04a" : "1px solid #2A2F40",
  background: active ? "rgba(200, 240, 74,0.1)" : "none",
  color: active ? "#c8f04a" : "#8B90A0",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "all 0.15s",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
})

const emoteCard = {
  height: 52,
  width: "100%",
  background: "#131620",
  border: "1px solid #1E2233",
  borderRadius: 8,
  padding: 4,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "all 0.15s",
  position: "relative",
  overflow: "hidden",
  flexShrink: 0,
}

/* ── Component ───────────────────────────────────────────────────────── */

export default function Toolbar({
  onAddText, onAddEmoji, onFile, onResetView, onClearAll,
  widgetCount, connected, overlayUrl, modUrl, onToast,
  assets = [], onAddFromAsset, onDeleteAsset,
}) {
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [activeTab, setActiveTab] = useState("emotes")
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [provider, setProvider] = useState("All")
  const [copiedObs, setCopiedObs] = useState(false)
  const [copiedMod, setCopiedMod] = useState(false)

  const [liveEmotes, setLiveEmotes] = useState(PRESET_EMOTES)
  const [loadedLive, setLoadedLive] = useState(false)

  const [streamerInput, setStreamerInput] = useState("")
  const [activeStreamer, setActiveStreamer] = useState("")
  const [streamerEmotes, setStreamerEmotes] = useState([])
  const [streamerLoading, setStreamerLoading] = useState(false)

  const [hoveredName, setHoveredName] = useState(null)
  const fileRefs = useRef({})
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!emojiOpen || loadedLive) return
    let active = true
    async function loadGlobalEmotes() {
      const results = await Promise.allSettled([
        fetchBTTVGlobal(),
        fetch7TVGlobal(),
        fetchFFZGlobal(),
      ])
      if (!active) return
      const bttv = results[0].status === "fulfilled" && Array.isArray(results[0].value) ? results[0].value : []
      const sv = results[1].status === "fulfilled" && Array.isArray(results[1].value) ? results[1].value : []
      const ffz = results[2].status === "fulfilled" && Array.isArray(results[2].value) ? results[2].value : []

      const map = new Map()
      for (const e of PRESET_EMOTES) map.set(e.name, e)
      for (const e of [...bttv, ...sv, ...ffz]) {
        if (!map.has(e.name)) map.set(e.name, e)
      }
      setLiveEmotes(Array.from(map.values()))
      setLoadedLive(true)
    }
    loadGlobalEmotes()
    return () => { active = false }
  }, [emojiOpen, loadedLive])

  useEffect(() => {
    if (!search || search.length < 2) {
      setSearchResults([])
      return
    }
    let active = true
    const timer = setTimeout(async () => {
      setSearching(true)
      const results = await search7TVEmotes(search, 60)
      if (active) {
        setSearchResults(results)
        setSearching(false)
      }
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [search])

  const handleFetchStreamer = useCallback(async (nameToFetch) => {
    const target = nameToFetch || streamerInput
    if (!target.trim()) return
    setStreamerLoading(true)
    setActiveStreamer(target.trim())
    const fetched = await fetchStreamerEmotes(target)
    setStreamerEmotes(fetched)
    setStreamerLoading(false)
  }, [streamerInput])

  const filteredEmotes = useMemo(() => {
    const map = new Map()
    for (const e of liveEmotes) map.set(e.id, e)
    for (const e of searchResults) {
      if (!map.has(e.id)) map.set(e.id, e)
    }
    const combined = Array.from(map.values())
    return combined.filter((e) => {
      const matchesProvider = provider === "All" || e.provider === provider
      const matchesSearch = !search || e.name.toLowerCase().includes(search.toLowerCase())
      return matchesProvider && matchesSearch
    })
  }, [liveEmotes, searchResults, provider, search])

  const filteredStreamerEmotes = useMemo(() => {
    if (!search) return streamerEmotes
    return streamerEmotes.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
  }, [streamerEmotes, search])

  useEffect(() => {
    if (!emojiOpen) return
    const onClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setEmojiOpen(false)
      }
    }
    window.addEventListener("mousedown", onClickOutside)
    return () => window.removeEventListener("mousedown", onClickOutside)
  }, [emojiOpen])

  const copyToClipboard = (text, type) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    if (type === "obs") {
      setCopiedObs(true)
      setTimeout(() => setCopiedObs(false), 2000)
      onToast?.("Copied OBS Browser Source URL to clipboard!")
    } else {
      setCopiedMod(true)
      setTimeout(() => setCopiedMod(false), 2000)
      onToast?.("Copied Mod Room Link to clipboard!")
    }
  }

  const pickFile = (kind, file, accept) => {
    if (file?.type.startsWith(accept)) onFile(kind, file)
  }

  /* ── Tab underline indicator ─────────────────────────────────────── */
  const tabs = [
    ["emotes", "Global"],
    ["streamer", "Channel"],
    ["unicode", "Emoji"],
    ["library", `Library${assets.length ? ` (${assets.length})` : ""}`],
  ]

  /* ── Emote click handler ─────────────────────────────────────────── */
  const handleEmoteClick = (e) => {
    onAddEmoji({ url: e.url, name: e.name, isEmote: true })
    setEmojiOpen(false)
  }

  return (
    <>
      <div style={{
        position: "fixed",
        top: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 2,
        background: "rgba(13, 15, 20, 0.92)",
        backdropFilter: "blur(16px)",
        border: "1px solid #2A2F40",
        borderRadius: 10,
        padding: "4px 6px",
        boxShadow: "0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(200,240,74,0.04)",
      }}>
        {/* Add Text — primary action */}
        <button
          style={{
            ...barBtn,
            background: "#c8f04a",
            color: "#0D0F14",
            fontWeight: 700,
          }}
          onClick={onAddText}
          title="Add editable text widget to stream"
          onMouseEnter={(e) => { e.currentTarget.style.background = "#d4f468" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#c8f04a" }}
        >
          + Text
        </button>

        {/* Emote Picker */}
        <div style={{ position: "relative" }} ref={popoverRef}>
          <button
            style={{
              ...barBtn,
              background: emojiOpen ? "#1A1E2A" : "none",
              color: emojiOpen ? "#c8f04a" : "#8B90A0",
            }}
            onClick={() => setEmojiOpen((o) => !o)}
            onMouseEnter={(e) => { if (!emojiOpen) e.currentTarget.style.color = "#E2E4EA" }}
            onMouseLeave={(e) => { if (!emojiOpen) e.currentTarget.style.color = "#8B90A0" }}
            title="Browse Twitch, BTTV, FFZ, 7TV emotes"
          >
            Emotes
          </button>

          {emojiOpen && (
            <div
              data-popover="true"
              onWheel={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: 0,
                top: "calc(100% + 8px)",
                width: 380,
                background: "#131620",
                border: "1px solid #2A2F40",
                borderRadius: 10,
                padding: 0,
                boxShadow: "0 20px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(200,240,74,0.06)",
                zIndex: 100,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Tab Bar */}
              <div style={{
                display: "flex",
                borderBottom: "1px solid #1E2233",
                background: "#0D0F14",
              }}>
                {tabs.map(([tabId, label]) => (
                  <button
                    key={tabId}
                    style={{
                      flex: 1,
                      padding: "10px 0 8px",
                      fontSize: 9,
                      fontFamily: "var(--font-mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      background: "none",
                      color: activeTab === tabId ? "#c8f04a" : "#757B8E",
                      border: "none",
                      borderBottom: activeTab === tabId ? "2px solid #c8f04a" : "2px solid transparent",
                      cursor: "pointer",
                      fontWeight: activeTab === tabId ? 600 : 400,
                      transition: "all 0.15s",
                    }}
                    onClick={() => { setActiveTab(tabId); setSearch("") }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div style={{ padding: "10px 12px 6px", position: "relative" }}>
                <input
                  type="text"
                  placeholder={activeTab === "streamer" ? "Search emotes..." : "Search emotes..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#0D0F14",
                    border: "1px solid #2A2F40",
                    borderRadius: 6,
                    padding: "7px 28px 7px 10px",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: "#E2E4EA",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "#c8f04a" }}
                  onBlur={(e) => { e.target.style.borderColor = "#2A2F40" }}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    style={{
                      position: "absolute",
                      right: 20,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "#757B8E",
                      fontSize: 12,
                      cursor: "pointer",
                      lineHeight: 1,
                      padding: "2px 4px",
                    }}
                  >x</button>
                )}
              </div>

              {/* GLOBAL EMOTES TAB */}
              {activeTab === "emotes" && (
                <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Provider Pills */}
                  <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
                    {["All", "BTTV", "7TV", "FFZ", "Twitch"].map((p) => (
                      <button key={p} style={pillBtn(provider === p)} onClick={() => setProvider(p)}>
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Grid */}
                  <div
                    onWheel={(e) => e.stopPropagation()}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, 1fr)",
                      gap: 6,
                      maxHeight: 260,
                      overflowY: "auto",
                      paddingRight: 4,
                    }}
                  >
                    {filteredEmotes.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        style={emoteCard}
                        onClick={() => handleEmoteClick(e)}
                        onMouseEnter={(ev) => {
                          ev.currentTarget.style.borderColor = "#c8f04a"
                          ev.currentTarget.style.transform = "scale(1.08)"
                          ev.currentTarget.style.zIndex = "10"
                          ev.currentTarget.style.background = "#1A1E2A"
                          setHoveredName(e.name)
                        }}
                        onMouseLeave={(ev) => {
                          ev.currentTarget.style.borderColor = "#1E2233"
                          ev.currentTarget.style.transform = "scale(1)"
                          ev.currentTarget.style.zIndex = "1"
                          ev.currentTarget.style.background = "#131620"
                          setHoveredName(null)
                        }}
                      >
                        <img
                          src={e.url}
                          alt=""
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STREAMER TAB */}
              {activeTab === "streamer" && (
                <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      placeholder="Streamer name, e.g. ludwig"
                      value={streamerInput}
                      onChange={(e) => setStreamerInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleFetchStreamer() }}
                      style={{
                        flex: 1,
                        background: "#0D0F14",
                        border: "1px solid #2A2F40",
                        borderRadius: 5,
                        padding: "7px 8px",
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        color: "#E2E4EA",
                        outline: "none",
                        transition: "border-color 0.15s",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "#c8f04a" }}
                      onBlur={(e) => { e.target.style.borderColor = "#2A2F40" }}
                    />
                    <button
                      style={{
                        padding: "0 14px",
                        fontSize: 9,
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        background: "#c8f04a",
                        color: "#0D0F14",
                        fontWeight: 600,
                        border: "none",
                        borderRadius: 5,
                        cursor: "pointer",
                      }}
                      onClick={() => handleFetchStreamer()}
                      disabled={streamerLoading}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#d4f468" }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#c8f04a" }}
                    >
                      {streamerLoading ? "..." : "Fetch"}
                    </button>
                  </div>

                  {/* Quick Streamer Chips */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {POPULAR_STREAMERS.map((s) => (
                      <button
                        key={s}
                        style={pillBtn(activeStreamer === s)}
                        onClick={() => {
                          setStreamerInput(s)
                          handleFetchStreamer(s)
                        }}
                      >
                        @{s}
                      </button>
                    ))}
                  </div>

                  {/* Results */}
                  {streamerLoading ? (
                    <div style={{ padding: "20px 0", textAlign: "center", fontSize: 10, fontFamily: "var(--font-mono)", color: "#757B8E" }}>
                      Fetching emotes for @{activeStreamer}...
                    </div>
                  ) : filteredStreamerEmotes.length > 0 ? (
                    <div
                      onWheel={(e) => e.stopPropagation()}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(6, 1fr)",
                        gap: 6,
                        maxHeight: 200,
                        overflowY: "auto",
                        paddingRight: 4,
                      }}
                    >
                      {filteredStreamerEmotes.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          style={emoteCard}
                          onClick={() => handleEmoteClick(e)}
                          onMouseEnter={(ev) => {
                            ev.currentTarget.style.borderColor = "#c8f04a"
                            ev.currentTarget.style.transform = "scale(1.08)"
                            ev.currentTarget.style.background = "#1A1E2A"
                            setHoveredName(e.name)
                          }}
                          onMouseLeave={(ev) => {
                            ev.currentTarget.style.borderColor = "#1E2233"
                            ev.currentTarget.style.transform = "scale(1)"
                            ev.currentTarget.style.background = "#131620"
                            setHoveredName(null)
                          }}
                        >
                          <img
                            src={e.url}
                            alt=""
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  ) : activeStreamer ? (
                    <div style={{ padding: "16px 0", textAlign: "center", fontSize: 9, fontFamily: "var(--font-mono)", color: "#757B8E" }}>
                      No emotes found for @{activeStreamer}. Check the channel name.
                    </div>
                  ) : (
                    <div style={{ padding: "16px 0", textAlign: "center", fontSize: 9, fontFamily: "var(--font-mono)", color: "#757B8E" }}>
                      Enter a Twitch channel name above to load their emotes.
                    </div>
                  )}
                </div>
              )}

              {/* UNICODE EMOJI TAB */}
              {activeTab === "library" && (
                <div style={{ padding: "0 12px 12px" }}>
                  {assets.length === 0 ? (
                    <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "#757B8E", lineHeight: 1.6, padding: "12px 0" }}>
                      Nothing saved yet. Anything you upload with GIF/Image, Clip or Sound
                      lands here automatically, so any mod can reuse it without re-uploading.
                    </p>
                  ) : (
                    <div
                      onWheel={(e) => e.stopPropagation()}
                      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}
                    >
                      {assets
                        .filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()))
                        .slice()
                        .reverse()
                        .map((a) => (
                          <div key={a.id} style={{ position: "relative" }}>
                            <button
                              type="button"
                              title={`${a.name} — click to add to the overlay`}
                              onClick={() => { onAddFromAsset?.(a); setEmojiOpen(false) }}
                              style={{
                                width: "100%", aspectRatio: "1 / 1", background: "#0D0F14",
                                border: "1px solid #2A2F40", borderRadius: 6, cursor: "pointer",
                                overflow: "hidden", display: "flex", alignItems: "center",
                                justifyContent: "center", padding: 0,
                              }}
                            >
                              {a.kind === "image" ? (
                                <img src={a.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                              ) : a.kind === "video" ? (
                                <video src={a.url} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                              ) : (
                                <span style={{ fontSize: 20 }}>🔊</span>
                              )}
                            </button>
                            <button
                              type="button"
                              title="Remove from library (does not touch the overlay)"
                              onClick={(e) => { e.stopPropagation(); onDeleteAsset?.(a.id) }}
                              style={{
                                position: "absolute", top: 2, right: 2, width: 16, height: 16,
                                borderRadius: 4, border: "none", cursor: "pointer", lineHeight: 1,
                                background: "rgba(0,0,0,0.7)", color: "#FF6B6B", fontSize: 11,
                              }}
                            >×</button>
                            <p style={{
                              fontSize: 7, fontFamily: "var(--font-mono)", color: "#8B90A0",
                              marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>{a.name || a.kind}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "unicode" && (
                <div
                  onWheel={(e) => e.stopPropagation()}
                  style={{ maxHeight: 240, overflowY: "auto", padding: "0 12px 12px" }}
                >
                  {Object.entries(EMOJI_CATEGORIES).map(([cat, emojis]) => {
                    const matched = search ? emojis.filter(() => true) : emojis
                    if (matched.length === 0) return null
                    return (
                      <div key={cat} style={{ marginBottom: 10 }}>
                        <p style={{
                          fontSize: 8,
                          fontFamily: "var(--font-mono)",
                          color: "#757B8E",
                          textTransform: "uppercase",
                          letterSpacing: "0.15em",
                          marginBottom: 4,
                          paddingLeft: 2,
                        }}>{cat}</p>
                        <div className="emoji-grid">
                          {matched.map((e) => (
                            <button
                              key={e}
                              type="button"
                              className="emoji-btn"
                              onClick={() => { onAddEmoji(e); setEmojiOpen(false) }}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Footer — hover tooltip */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid #1E2233",
                padding: "6px 12px",
                fontSize: 8,
                fontFamily: "var(--font-mono)",
                color: "#757B8E",
                background: "#0D0F14",
              }}>
                <span style={{ color: hoveredName ? "#c8f04a" : "#757B8E", transition: "color 0.15s" }}>
                  {hoveredName ? `:${hoveredName}:` : "Hover to preview name"}
                </span>
                <span>
                  {activeTab === "emotes" ? `${filteredEmotes.length} emotes` : ""}
                </span>
              </div>
            </div>
          )}
        </div>

        <Spacer />

        {/* File Upload buttons */}
        {[["Image / GIF", "image", "image"], ["Clip", "video", "video"], ["Sound", "sound", "audio"]].map(([label, kind, accept]) => (
          <label
            key={kind}
            style={{ ...barBtn, cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#1A1E2A"; e.currentTarget.style.color = "#E2E4EA" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#8B90A0" }}
          >
            {label}
            <input
              type="file"
              style={{ display: "none" }}
              accept={accept === "image" ? "image/*" : accept === "video" ? "video/*" : "audio/*"}
              onChange={(e) => pickFile(kind, e.target.files?.[0], accept)}
              ref={(el) => { fileRefs.current[kind] = el }}
            />
          </label>
        ))}

        <Spacer />

        {/* Copy OBS URL */}
        {overlayUrl && (
          <button
            style={{
              ...barBtn,
              color: copiedObs ? "#c8f04a" : "#E2E4EA",
            }}
            onClick={() => copyToClipboard(overlayUrl, "obs")}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#1A1E2A" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none" }}
            title="Copy OBS Studio Browser Source link"
          >
            {copiedObs ? "Copied" : "Copy OBS URL"}
          </button>
        )}

        {/* Copy Mod Link */}
        {modUrl && (
          <button
            style={{
              ...barBtn,
              color: copiedMod ? "#c8f04a" : "#8B90A0",
            }}
            onClick={() => copyToClipboard(modUrl, "mod")}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#1A1E2A"; e.currentTarget.style.color = "#E2E4EA" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#8B90A0" }}
            title="Copy Mod Board share link"
          >
            {copiedMod ? "Copied" : "Share Mod"}
          </button>
        )}

        <Spacer />

        {/* Shortcuts */}
        <button
          style={barBtn}
          onClick={() => setShowShortcuts((s) => !s)}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#1A1E2A"; e.currentTarget.style.color = "#E2E4EA" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#8B90A0" }}
          title="View Keyboard Shortcuts"
        >
          Keys
        </button>

        {/* Reset View */}
        <button
          style={barBtn}
          onClick={onResetView}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#1A1E2A"; e.currentTarget.style.color = "#E2E4EA" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#8B90A0" }}
          title="Center and fit canvas view"
        >
          Reset View
        </button>

        {/* Clear All */}
        <button
          style={{ ...barBtn, color: widgetCount > 0 ? "#FF6B6B" : "#757B8E" }}
          onClick={() => { if (widgetCount > 0) setConfirmClear(true) }}
          onMouseEnter={(e) => { if (widgetCount > 0) e.currentTarget.style.background = "rgba(255,107,107,0.08)" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none" }}
          disabled={widgetCount === 0}
          title="Remove all widgets from overlay"
        >
          Clear All
        </button>

        <Spacer />

        {/* Status */}
        <div style={{
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          color: "#8B90A0",
          whiteSpace: "nowrap",
        }}>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{widgetCount}</span>
          <span style={{ opacity: 0.5 }}>widgets</span>
          <span className={`status-dot ${connected ? "live" : "offline"}`} />
          <span style={{ color: connected ? "#c8f04a" : "#FF6B6B", fontWeight: 600 }}>
            {connected ? "live" : "offline"}
          </span>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
            <h3 style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              color: "#c8f04a",
              letterSpacing: "0.12em",
              marginBottom: 14,
            }}>KEYBOARD SHORTCUTS</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11, fontFamily: "var(--font-mono)", color: "#E2E4EA" }}>
              {[
                ["Del / Backspace", "Delete selected widget"],
                ["Ctrl + D", "Duplicate selected widget"],
                ["Arrow Keys", "Nudge widget (1px)"],
                ["Shift + Arrows", "Fast nudge (10px)"],
                ["Scroll Wheel", "Zoom in / out"],
                ["Drag Canvas", "Pan board"],
                ["Esc", "Deselect widget"],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1E2233", paddingBottom: 6 }}>
                  <span style={{ color: "#c8f04a", fontSize: 10 }}>{key}</span>
                  <span style={{ color: "#8B90A0", fontSize: 10 }}>{desc}</span>
                </div>
              ))}
            </div>
            <button
              style={{
                width: "100%",
                marginTop: 16,
                padding: "9px 0",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                background: "#1A1E2A",
                color: "#E2E4EA",
                border: "1px solid #2A2F40",
                borderRadius: 6,
                cursor: "pointer",
              }}
              onClick={() => setShowShortcuts(false)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#222738" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#1A1E2A" }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Clear All Confirmation */}
      {confirmClear && (
        <div className="modal-backdrop" onClick={() => setConfirmClear(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              color: "#FF6B6B",
              letterSpacing: "0.12em",
              marginBottom: 8,
            }}>CLEAR ALL?</h3>
            <p style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "#8B90A0",
              lineHeight: 1.6,
              marginBottom: 18,
            }}>
              This will remove all {widgetCount} widget{widgetCount !== 1 ? "s" : ""} from the overlay. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontFamily: "var(--font-display)",
                  fontSize: 16,
                  letterSpacing: "0.12em",
                  background: "#FF6B6B",
                  color: "#0D0F14",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
                onClick={() => { onClearAll(); setConfirmClear(false) }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#FF8A8A" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#FF6B6B" }}
              >
                CLEAR EVERYTHING
              </button>
              <button
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  background: "#1A1E2A",
                  color: "#8B90A0",
                  border: "1px solid #2A2F40",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                onClick={() => setConfirmClear(false)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#222738" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#1A1E2A" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Spacer() {
  return <div style={{ width: 1, height: 18, background: "#2A2F40", margin: "0 3px", flexShrink: 0, opacity: 0.5 }} />
}
import { useState, useMemo } from "react"

/**
 * What the mods actually watch: the live stream with the overlay composited on
 * top, exactly as viewers see it. Placing a widget against a blank rectangle is
 * guesswork — against the real frame it is a decision.
 *
 * The overlay iframe sits above the player and never takes pointer events, so
 * the two stay independent: the player owns audio, the overlay owns pixels.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Twitch refuses to embed unless `parent` matches the hostname doing the
 * embedding, and it rejects bare IP addresses outright. A mod on a LAN IP gets
 * a blank player with no explanation, so detect it and say so.
 */
function parentHost() {
  return typeof window === "undefined" ? "localhost" : window.location.hostname
}

function isIpHost(h) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")
}

function playerSrc({ platform, channel }, { muted, volume }) {
  if (!platform || !channel) return null
  if (platform === "twitch") {
    const p = new URLSearchParams({
      channel,
      parent: parentHost(),
      muted: String(muted),
      volume: String(volume),
      autoplay: "true",
    })
    return `https://player.twitch.tv/?${p}`
  }
  // YouTube live: the channel's current broadcast, no cookies.
  const p = new URLSearchParams({
    autoplay: "1",
    mute: muted ? "1" : "0",
  })
  return `https://www.youtube-nocookie.com/embed/live_stream?channel=${encodeURIComponent(channel)}&${p}`
}

export default function StreamPreview({ room, connected, stream, onSetStream }) {
  const [embed, setEmbed] = useState(true)
  const [overlayOpacity, setOverlayOpacity] = useState(1)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(0.5)
  const [committedVolume, setCommittedVolume] = useState(0.5)
  const [draft, setDraft] = useState("")
  const [platform, setPlatform] = useState("twitch")

  const current = stream ?? { platform: null, channel: "" }
  const overlayUrl = `${window.location.origin}/overlay?room=${encodeURIComponent(room)}`

  // Re-mounting is how audio settings reach the player without pulling in an
  // external embed SDK; keyed so only a committed change costs a reload.
  const src = useMemo(
    () => playerSrc(current, { muted, volume: committedVolume }),
    [current.platform, current.channel, muted, committedVolume],
  )
  const playerKey = `${current.platform}:${current.channel}:${muted}:${committedVolume}`

  const ipWarning = current.platform === "twitch" && isIpHost(parentHost())

  const label = { fontSize: 9, fontFamily: "var(--font-mono)", color: "#757B8E" }
  const field = {
    flex: 1, minWidth: 0, fontSize: 10, fontFamily: "var(--font-mono)",
    background: "#0D0F14", border: "1px solid #2A2F40", color: "#E2E4EA",
    padding: "5px 7px", borderRadius: 4, outline: "none",
  }

  return (
    <div className="flex flex-col">
      <div className="section-header">
        <span>Stream Preview</span>
        <div className="flex items-center gap-2">
          <span className={`status-dot ${connected ? "live" : "offline"}`} />
          <span style={{ fontSize: 8, color: connected ? "#c8f04a" : "#FF6B6B" }}>
            {connected ? "LIVE" : "OFF"}
          </span>
        </div>
      </div>

      {/* Which stream to sit under the overlay. Shared with every mod. */}
      <form
        className="px-3 pb-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          onSetStream?.({ platform, channel: draft.trim() })
        }}
      >
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={{ ...field, flex: "0 0 62px" }}
          title="Stream platform"
        >
          <option value="twitch">Twitch</option>
          <option value="youtube">YouTube</option>
        </select>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={current.channel || "channel name"}
          style={field}
          aria-label="Channel to preview"
        />
        <button type="submit" className="btn-ghost" style={{ ...label, padding: "5px 8px", whiteSpace: "nowrap" }}>
          {current.channel ? "change" : "connect"}
        </button>
      </form>

      <div className="px-3 pb-2 flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={embed}
            onChange={(e) => setEmbed(e.target.checked)}
            className="accent-[#c8f04a]"
            style={{ width: 12, height: 12 }}
          />
          <span style={label}>embed</span>
        </label>

        {src && (
          <>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              title={muted ? "Unmute stream audio" : "Mute stream audio"}
              style={{ ...label, cursor: "pointer", background: "none", border: "none", color: muted ? "#757B8E" : "#c8f04a" }}
            >
              {muted ? "🔇 muted" : "🔊 audio"}
            </button>
            <label className="flex items-center gap-1.5" title="Stream volume (applies on release)">
              <input
                type="range"
                min="0" max="1" step="0.05"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                onPointerUp={() => setCommittedVolume(volume)}
                onKeyUp={() => setCommittedVolume(volume)}
                style={{ width: 54, height: 3 }}
              />
            </label>
          </>
        )}

        <label className="flex items-center gap-1.5" title="Overlay opacity in this preview only">
          <span style={label}>overlay</span>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            style={{ width: 54, height: 3 }}
          />
        </label>
      </div>

      {embed && (
        <div
          className="mx-3 mb-2 rounded overflow-hidden relative"
          style={{ aspectRatio: "16 / 9", background: "#000", border: "1px solid #2A2F40" }}
        >
          {src ? (
            <iframe
              key={playerKey}
              src={src}
              title="Live stream"
              allow="autoplay; encrypted-media; picture-in-picture"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
              <span style={{ ...label, lineHeight: 1.6 }}>
                no stream connected — pick a platform and enter the channel above
                to place widgets against the real frame
              </span>
            </div>
          )}

          {/* Overlay on top, never interactive: it is a mirror, not a control. */}
          <iframe
            src={overlayUrl}
            title="Overlay preview"
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              border: "none", background: "transparent",
              pointerEvents: "none", opacity: overlayOpacity,
            }}
          />

          <div
            style={{
              position: "absolute", bottom: 4, right: 4, fontSize: 7,
              fontFamily: "var(--font-mono)", color: "#757B8E", letterSpacing: "0.1em",
              textTransform: "uppercase", background: "rgba(0,0,0,0.6)",
              padding: "2px 5px", borderRadius: 2,
            }}
          >
            {current.channel ? `${current.platform} · ${current.channel}` : "overlay only"}
          </div>
        </div>
      )}

      {ipWarning && (
        <div className="px-3 pb-2">
          <p style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "#e0a030", lineHeight: 1.5 }}>
            Twitch will not embed on an IP address ({parentHost()}). Open the board on
            localhost or a real hostname, or the player stays blank.
          </p>
        </div>
      )}

      <div className="px-3 pb-2">
        <p style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "#6A7183", lineHeight: 1.4 }}>
          Preview only — the OBS overlay stays transparent and never carries the stream or its audio.
        </p>
      </div>
    </div>
  )
}

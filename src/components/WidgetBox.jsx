import { useRef } from "react"
import { resolvePlaybackUrl } from "../lib/mediaUrl"

import { widgetStyle } from "../lib/widgetStyle"

/**
 * One widget as the mods see it — the thing they drag around the board.
 * Overlay rendering is OverlayCanvas's job; this is the editable wrapper.
 */
export default function WidgetBox({ widget, isSelected, onMouseDown, onResizeStart, onDelete, onPlaySound }) {
  const type = widget.type
  const url = type === "image" || type === "video" || type === "sound"
    ? resolvePlaybackUrl(widget.content)
    : null
  const videoRef = useRef(null)

  const handlePlay = (e) => {
    e.stopPropagation()
    onPlaySound?.(widget.id)
  }

  // Transform half comes from the shared definition the overlay also uses, so
  // the board cannot drift from what actually goes on stream.
  const base = widgetStyle(widget, { editor: true })
  const isHidden = widget.visible === false

  // Check if content is an image URL (for emotes/custom images)
  const isEmoteUrl = typeof widget.content === "string" && (
    widget.content.startsWith("http:") ||
    widget.content.startsWith("https:") ||
    widget.content.startsWith("//") ||
    widget.content.startsWith("data:") ||
    widget.content.includes("/") ||
    widget.content.includes(".")
  )
  const emoteSrc = isEmoteUrl
    ? (widget.content.startsWith("//") ? `https:${widget.content}` : widget.content)
    : null

  return (
    <div
      className={`absolute select-none ${isSelected ? "z-20" : "z-10"}`}
      style={{
        ...base,
        cursor: widget.locked ? "not-allowed" : "grab",
        outline: isSelected
          ? "2px solid var(--color-accent, #c8f04a)"
          : type === "sound"
            ? "1px dashed rgba(200, 240, 74, 0.4)"
            : "1px dashed rgba(200, 240, 74, 0.25)",
        outlineOffset: "-1px",
        boxShadow: isSelected ? "0 8px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px var(--color-accent-glow)" : "none",
        background: type === "sound" ? "var(--color-surface, #131620)" : isSelected ? "rgba(19, 22, 32, 0.6)" : "transparent",
        pointerEvents: widget.locked ? "none" : undefined,
        borderRadius: 2,
      }}
      onMouseDown={widget.locked ? undefined : onMouseDown}
    >
      {type === "text" && (
        <div className="h-full w-full flex items-center justify-center overflow-hidden"
          style={{
            color: widget.color,
            fontSize: widget.size,
            fontWeight: widget.bold ? 700 : 400,
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: "0.04em",
            lineHeight: 1,
            textAlign: "center",
            padding: 4,
          }}
        >
          {widget.content}
        </div>
      )}

      {type === "emoji" && (
        isEmoteUrl && emoteSrc ? (
          <img
            src={emoteSrc}
            alt={widget.label || widget.name || "Emote"}
            className="h-full w-full"
            draggable="false"
            style={{ objectFit: "contain", pointerEvents: "none" }}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center overflow-hidden"
            style={{
              fontSize: widget.size || 110,
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            {widget.content}
          </div>
        )
      )}

      {type === "image" && url && (
        <img src={url} alt="" className="h-full w-full" draggable="false"
          style={{ objectFit: "contain", pointerEvents: "none" }} />
      )}

      {type === "video" && url && (
        <video ref={videoRef} src={url} loop muted playsInline autoPlay
          className="h-full w-full block" style={{ objectFit: "contain", pointerEvents: "none" }} />
      )}

      {(type === "image" || type === "video") && !url && (
        <div className="flex h-full w-full items-center justify-center">
          <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--font-mono)", color: "var(--color-dim, #757B8E)" }}>No Media</span>
        </div>
      )}

      {type === "sound" && (
        <div className="flex h-full w-full items-center gap-2 px-3">
          <button
            type="button"
            style={{
              background: "var(--color-accent, #c8f04a)",
              color: "var(--color-canvas, #0D0F14)",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
              lineHeight: 1,
              pointerEvents: "auto",
              transition: "transform 0.1s ease",
            }}
            title="Play sound on stream"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handlePlay}
            onMouseEnter={(e) => { e.target.style.transform = "scale(1.05)" }}
            onMouseLeave={(e) => { e.target.style.transform = "scale(1)" }}
          >
            PLAY
          </button>
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-ink, #E2E4EA)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1 }}>
            {widget.label || "sound"}
          </span>
        </div>
      )}

      {/* Delete button */}
      <div
        style={{
          position: "absolute",
          top: -10,
          right: -10,
          zIndex: 30,
          pointerEvents: "none",
          opacity: isSelected ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        <button
          type="button"
          style={{
            background: "var(--color-danger, #FF6B6B)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "50%",
            width: 20,
            height: 20,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: "20px",
            textAlign: "center",
            pointerEvents: "auto",
            boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Delete Object"
        >
          ×
        </button>
      </div>

      {/* Z-index badge */}
      {isSelected && widget.zIndex !== undefined && widget.zIndex !== 0 && (
        <div style={{
          position: "absolute",
          bottom: -18,
          left: 0,
          fontSize: 8,
          fontFamily: "var(--font-mono)",
          color: "var(--color-muted, #8B90A0)",
          letterSpacing: "0.08em",
          pointerEvents: "none",
        }}>
          z{widget.zIndex}
        </div>
      )}

      {/* Resize handle */}
      {isSelected && (
        <div
          className="absolute bottom-0 right-0 z-30"
          style={{ width: 14, height: 14, cursor: "se-resize" }}
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e) }}
        >
          <svg viewBox="0 0 8 8" className="h-full w-full">
            <path d="M1 7L7 1M4 7L7 4" stroke="var(--color-accent, #c8f04a)" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
          </svg>
        </div>
      )}
    </div>
  )
}
import { useCallback } from "react"

const TYPE_BADGES = {
  text: "TXT",
  emoji: "EMT",
  image: "IMG",
  video: "VID",
  sound: "SND",
}

const TYPE_LABELS = {
  text: "Text",
  emoji: "Emote",
  image: "Image",
  video: "Clip",
  sound: "Sound",
}

function getWidgetLabel(w) {
  if (w.name) return w.name
  if (w.type === "text" || w.type === "emoji") return (w.content || "").slice(0, 24) || TYPE_LABELS[w.type]
  if (w.type === "sound") return w.label || "Sound"
  return TYPE_LABELS[w.type] || w.type
}

export default function ObjectList({
  widgets,
  selectedId,
  onSelect,
  onDelete,
  onPatch,
  onAddText,
  onAddEmoji,
  onFile,
}) {
  const sorted = [...widgets].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))

  const toggleVisible = useCallback((e, id) => {
    e.stopPropagation()
    const w = widgets.find((x) => x.id === id)
    if (w) onPatch(id, { visible: !w.visible })
  }, [widgets, onPatch])

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: "var(--color-canvas, #0D0F14)" }}>
      <div className="section-header" style={{
        padding: "10px 14px",
        background: "var(--color-surface, #131620)",
        borderBottom: "1px solid var(--color-border, #2A2F40)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: "var(--color-muted, #8B90A0)",
        }}>
          LAYERS ({widgets.length})
        </span>
        <div className="flex items-center gap-1.5">
          <CreateButton label="+ Add Text" onClick={onAddText} />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ minHeight: 0, padding: "4px 0" }}
      >
        {sorted.length === 0 && (
          <p style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--color-dim, #757B8E)",
            padding: "24px 16px",
            textAlign: "center",
            lineHeight: 1.5,
          }}>
            No layers added yet. Click + Add Text or Emotes from the toolbar.
          </p>
        )}

        {sorted.map((w) => {
          const isSelected = selectedId === w.id
          const isHidden = w.visible === false
          return (
            <div
              key={w.id}
              className="object-item"
              onClick={() => onSelect(w.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                margin: "2px 6px",
                borderRadius: 4,
                cursor: "pointer",
                background: isSelected ? "var(--color-surface-raised, #222738)" : "transparent",
                border: isSelected ? "1px solid var(--color-accent-dim, #a3d82a)" : "1px solid transparent",
                opacity: isHidden ? 0.4 : 1,
                transition: "all 0.12s ease",
              }}
            >
              <span style={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                color: isSelected ? "var(--color-accent, #c8f04a)" : "var(--color-muted, #8B90A0)",
                background: "var(--color-surface, #131620)",
                border: "1px solid var(--color-border, #2A2F40)",
                padding: "2px 5px",
                borderRadius: 3,
                flexShrink: 0,
              }}>
                {TYPE_BADGES[w.type] || "WGT"}
              </span>

              <span className="flex-1 truncate" style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: isSelected ? "var(--color-ink, #E2E4EA)" : "var(--color-muted, #8B90A0)",
                fontWeight: isSelected ? 600 : 400,
              }}>
                {getWidgetLabel(w)}
              </span>

              <button
                onClick={(e) => toggleVisible(e, w.id)}
                style={{
                  background: isHidden ? "var(--color-danger-dim)" : "var(--color-surface, #131620)",
                  border: "1px solid var(--color-border-dim, #1E2233)",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  color: isHidden ? "var(--color-danger, #FF6B6B)" : "var(--color-muted, #8B90A0)",
                  padding: "3px 6px",
                  lineHeight: 1,
                  textTransform: "uppercase",
                }}
                title={isHidden ? "Show Layer" : "Hide Layer"}
              >
                {isHidden ? "HIDDEN" : "VISIBLE"}
              </button>

              <span style={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                color: "var(--color-dim, #757B8E)",
                minWidth: 22,
                textAlign: "right",
              }}>
                z{w.zIndex || 0}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CreateButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        background: "var(--color-accent, #c8f04a)",
        color: "var(--color-canvas, #0D0F14)",
        border: "none",
        padding: "4px 9px",
        borderRadius: 3,
        cursor: "pointer",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        transition: "opacity 0.15s ease",
      }}
    >
      {label}
    </button>
  )
}

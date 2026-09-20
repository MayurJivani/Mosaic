import { useRef } from "react"

const TYPES = {
  text: "TEXT",
  emoji: "EMOTE",
  image: "IMAGE / GIF",
  video: "CLIP",
  sound: "SOUND",
}

function Field({ label, children, row }) {
  return (
    <div className={`flex ${row ? "items-center gap-2" : "flex-col gap-1.5"}`}>
      <p style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--color-muted, #8B90A0)",
        fontFamily: "var(--font-mono)",
        minWidth: row ? 60 : undefined,
        userSelect: "none",
      }}>{label}</p>
      {children}
    </div>
  )
}

const inputStyle = {
  width: "100%",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  background: "var(--color-surface, #131620)",
  border: "1px solid var(--color-border, #2A2F40)",
  color: "var(--color-ink, #E2E4EA)",
  padding: "6px 9px",
  borderRadius: 4,
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
}

const btnStyle = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: "var(--font-mono)",
  background: "var(--color-surface-alt, #1A1E2A)",
  color: "var(--color-ink, #E2E4EA)",
  border: "1px solid var(--color-border, #2A2F40)",
  padding: "8px 0",
  borderRadius: 4,
  cursor: "pointer",
  transition: "all 0.15s ease",
  textAlign: "center",
  width: "100%",
}

function SliderField({ label, value, min, max, step, onChange, display }) {
  return (
    <Field label={label} row>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            flex: 1,
            height: 4,
            accentColor: "var(--color-accent, #c8f04a)",
            cursor: "pointer",
          }}
        />
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-muted, #8B90A0)", minWidth: 32, textAlign: "right" }}>
          {display ?? value}
        </span>
      </div>
    </Field>
  )
}

export default function Inspector({ widget, onPatch, onReplace, onDelete, onPlaySound, onDuplicate }) {
  const fileRef = useRef(null)

  if (!widget) {
    return (
      <div className="sidebar-panel-right" style={{
        width: 260,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        opacity: 0.5,
      }}>
        <p style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--color-muted, #8B90A0)",
          textAlign: "center",
          lineHeight: 1.6,
        }}>
          Select an object to inspect & modify properties
        </p>
      </div>
    )
  }

  const { id, type } = widget
  const replaceable = type === "image" || type === "video" || type === "sound"

  return (
    <div className="sidebar-panel-right" style={{
      width: 260,
      overflowY: "auto",
      padding: 0,
      background: "var(--color-canvas, #0D0F14)",
      borderLeft: "1px solid var(--color-border, #2A2F40)",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 16px 12px",
        borderBottom: "1px solid var(--color-border, #2A2F40)",
        background: "var(--color-surface, #131620)",
      }}>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          color: "var(--color-accent, #c8f04a)",
          letterSpacing: "0.12em",
          lineHeight: 1,
        }}>{TYPES[type] || type.toUpperCase()}</h2>
        <p style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--color-dim, #757B8E)", marginTop: 4 }}>
          ID: {widget.name || id}
        </p>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Name */}
        <Field label="Name">
          <input
            type="text"
            style={inputStyle}
            value={widget.name || ""}
            placeholder={id}
            onChange={(e) => onPatch(id, { name: e.target.value })}
          />
        </Field>

        {/* Text content */}
        {type === "text" && (
          <>
            <Field label="Content">
              <textarea
                style={{ ...inputStyle, resize: "none", height: 64, lineHeight: 1.4 }}
                value={widget.content}
                onChange={(e) => onPatch(id, { content: e.target.value })}
              />
            </Field>
            <Field label="Font Size">
              <input
                type="number"
                style={inputStyle}
                value={widget.size}
                onChange={(e) => onPatch(id, { size: Number(e.target.value) })}
              />
            </Field>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <Field label="Color">
                <input
                  type="color"
                  style={{
                    height: 32,
                    width: "100%",
                    background: "var(--color-surface, #131620)",
                    border: "1px solid var(--color-border, #2A2F40)",
                    borderRadius: 4,
                    cursor: "pointer",
                    padding: 2,
                  }}
                  value={widget.color}
                  onChange={(e) => onPatch(id, { color: e.target.value })}
                />
              </Field>
              <button
                type="button"
                style={{
                  ...btnStyle,
                  width: 44,
                  flexShrink: 0,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...(widget.bold ? {
                    background: "var(--color-accent, #c8f04a)",
                    color: "var(--color-canvas, #0D0F14)",
                    borderColor: "var(--color-accent, #c8f04a)",
                    fontWeight: 700,
                  } : {}),
                }}
                onClick={() => onPatch(id, { bold: !widget.bold })}
              >
                BOLD
              </button>
            </div>
          </>
        )}

        {/* Emoji / Emote content */}
        {type === "emoji" && (
          <>
            <Field label="Emote / Emoji">
              <input
                type="text"
                style={{ ...inputStyle, fontSize: 18, textAlign: "center" }}
                value={widget.content}
                onChange={(e) => onPatch(id, { content: e.target.value })}
              />
            </Field>
            <Field label="Size">
              <input
                type="number"
                style={inputStyle}
                value={widget.size}
                onChange={(e) => onPatch(id, { size: Number(e.target.value) })}
              />
            </Field>
          </>
        )}

        {/* Sound label */}
        {type === "sound" && (
          <Field label="Label">
            <input
              type="text"
              style={inputStyle}
              value={widget.label}
              onChange={(e) => onPatch(id, { label: e.target.value })}
            />
          </Field>
        )}

        {/* Source path */}
        {type !== "text" && type !== "emoji" && widget.content && (
          <Field label={type === "sound" ? "Audio Source" : "Media Source"}>
            <p style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              color: "var(--color-muted, #8B90A0)",
              wordBreak: "break-all",
              lineHeight: 1.4,
              background: "var(--color-surface, #131620)",
              padding: "6px 8px",
              borderRadius: 4,
              border: "1px solid var(--color-border-dim, #1E2233)",
            }}>
              {widget.content}
            </p>
          </Field>
        )}

        <hr style={{ border: "none", borderTop: "1px solid var(--color-border-dim, #1E2233)", margin: "2px 0" }} />

        {/* Position & Size */}
        <Field label="Position & Dimensions">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["x", "X"], ["y", "Y"], ["w", "W"], ["h", "H"]].map(([key, label]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-dim, #757B8E)", width: 14 }}>{label}</span>
                <input
                  type="number"
                  style={{ ...inputStyle, padding: "5px 6px" }}
                  value={Math.round(widget[key])}
                  onChange={(e) => onPatch(id, { [key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
        </Field>

        <hr style={{ border: "none", borderTop: "1px solid var(--color-border-dim, #1E2233)", margin: "2px 0" }} />

        {/* Z-index */}
        <Field label="Layer Order (Z-Index)" row>
          <input
            type="number"
            style={{ ...inputStyle, width: 70, padding: "5px 6px", textAlign: "center" }}
            value={widget.zIndex || 0}
            onChange={(e) => onPatch(id, { zIndex: Number(e.target.value) })}
          />
        </Field>

        {/* Rotation */}
        <SliderField
          label="Rotation"
          value={widget.rotation || 0}
          min={-360}
          max={360}
          step={1}
          onChange={(v) => onPatch(id, { rotation: v })}
          display={`${widget.rotation || 0}°`}
        />

        {/* Opacity */}
        <SliderField
          label="Opacity"
          value={widget.opacity ?? 1}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onPatch(id, { opacity: v })}
          display={Math.round((widget.opacity ?? 1) * 100) + "%"}
        />

        {/* Blur */}
        <SliderField
          label="Blur"
          value={widget.blur || 0}
          min={0}
          max={50}
          step={1}
          onChange={(v) => onPatch(id, { blur: v })}
          display={`${widget.blur || 0}px`}
        />

        {/* Flip */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={{
              ...btnStyle,
              ...(widget.flipX ? {
                background: "var(--color-accent, #c8f04a)",
                color: "var(--color-canvas, #0D0F14)",
                borderColor: "var(--color-accent, #c8f04a)",
              } : {}),
            }}
            onClick={() => onPatch(id, { flipX: !widget.flipX })}
          >
            FLIP HORIZONTAL
          </button>
          <button
            type="button"
            style={{
              ...btnStyle,
              ...(widget.flipY ? {
                background: "var(--color-accent, #c8f04a)",
                color: "var(--color-canvas, #0D0F14)",
                borderColor: "var(--color-accent, #c8f04a)",
              } : {}),
            }}
            onClick={() => onPatch(id, { flipY: !widget.flipY })}
          >
            FLIP VERTICAL
          </button>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--color-border-dim, #1E2233)", margin: "2px 0" }} />

        {/* Replace file */}
        {replaceable && (
          <label style={{ ...btnStyle, cursor: "pointer", display: "block" }}>
            {type === "image" ? "Replace Image" : type === "video" ? "Replace Clip" : "Replace Audio File"}
            <input
              type="file"
              style={{ display: "none" }}
              accept={type === "image" ? "image/*" : type === "video" ? "video/*" : "audio/*"}
              ref={fileRef}
              onChange={(e) => onReplace?.(type, id, e.target.files?.[0])}
            />
          </label>
        )}

        {/* Play sound */}
        {type === "sound" && (
          <button type="button" style={{
            ...btnStyle,
            background: "var(--color-accent-subtle)",
            color: "var(--color-accent)",
            borderColor: "var(--color-accent-dim)",
          }} onClick={() => onPlaySound?.(id)}>
            Play Sound on Stream
          </button>
        )}

        {/* Duplicate */}
        {onDuplicate && (
          <button type="button" style={btnStyle} onClick={() => onDuplicate(id)}>
            Duplicate Object
          </button>
        )}

        {/* Delete */}
        <button
          type="button"
          style={{
            ...btnStyle,
            background: "var(--color-danger-dim, rgba(255, 107, 107, 0.12))",
            color: "var(--color-danger, #FF6B6B)",
            borderColor: "rgba(255, 107, 107, 0.3)",
          }}
          onClick={() => onDelete(id)}
        >
          Delete Object
        </button>
      </div>
    </div>
  )
}
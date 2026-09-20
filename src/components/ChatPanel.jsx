import { useState, useRef, useEffect, useCallback } from "react"

/**
 * Mod-to-mod chat panel. Messages are ephemeral (not persisted).
 * Useful for coordinating overlay moves mid-stream.
 */
export default function ChatPanel({ messages, onSend, nickname }) {
  const [text, setText] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText("")
  }, [text, onSend])

  const formatTime = (ts) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div
      className="flex flex-col"
      style={{
        borderTop: "1px solid #2A2F40",
        background: "var(--color-chat-bg)",
        minHeight: collapsed ? 30 : 140,
        maxHeight: collapsed ? 30 : 200,
        transition: "min-height 0.2s, max-height 0.2s",
      }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: "#757B8E",
          width: "100%",
        }}
      >
        <span>mod chat</span>
        <span style={{ fontSize: 11 }}>{collapsed ? "▲" : "▼"}</span>
      </button>

      {!collapsed && (
        <>
          <div
            className="flex-1 overflow-y-auto px-1"
            style={{ minHeight: 0 }}
          >
            {messages.length === 0 && (
              <p style={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                color: "#333330",
                padding: "12px",
                textAlign: "center",
              }}>
                no messages yet — type below to coordinate with other mods
              </p>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="chat-message">
                <span className="chat-sender">{msg.sender}</span>
                <span>{msg.text}</span>
                <span className="chat-time">{formatTime(msg.ts)}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="p-2">
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder={`chat as ${nickname || "mod"}…`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
            />
          </form>
        </>
      )}
    </div>
  )
}

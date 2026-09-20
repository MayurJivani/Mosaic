import { useEffect, useRef, useCallback, useState } from "react"
import { getWsUrl } from "./mediaUrl"

/**
 * One WebSocket per room, joined as a mod editor or as the read-only overlay.
 * Reconnects on its own — a mod drops off wifi or the streamer reloads OBS and
 * everything comes back without anyone walking over to tap it.
 *
 * @param {object} opts
 * @param {string}   opts.roomId
 * @param {string}   opts.role     – "editor" (needs code) or "overlay"
 * @param {string}   [opts.code]   – room token for editors
 * @param {string}   [opts.nickname] – display name for chat
 * @param {Function} [opts.onState]       – { widgets, canvasW, canvasH } on join
 * @param {Function} [opts.onWidgetPut]   – one widget upserted/broadcast
 * @param {Function} [opts.onWidgetDel]   – one widget removed
 * @param {Function} [opts.onWidgetReorder] – bulk z-index update
 * @param {Function} [opts.onClearAll]    – all widgets cleared
 * @param {Function} [opts.onPlaySound]   – overlay: play this sound widget now
 * @param {Function} [opts.onChat]        – chat message received
 * @param {Function} [opts.onAssetPut]    – clip library entry added
 * @param {Function} [opts.onAssetDel]    – clip library entry removed
 * @param {Function} [opts.onStreamSet]   – which live stream the board previews
 */
export function useRoom({
  roomId,
  role,
  code,
  nickname,
  onState,
  onWidgetPut,
  onWidgetDel,
  onWidgetReorder,
  onClearAll,
  onPlaySound,
  onChat,
  onAssetPut,
  onAssetDel,
  onStreamSet,
}) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)

  const handlersRef = useRef({})
  handlersRef.current = { onState, onWidgetPut, onWidgetDel, onWidgetReorder, onClearAll, onPlaySound, onChat, onAssetPut, onAssetDel, onStreamSet }

  const roleRef = useRef(role)
  const codeRef = useRef(code)
  const nicknameRef = useRef(nickname)
  roleRef.current = role
  codeRef.current = code
  nicknameRef.current = nickname

  useEffect(() => {
    if (!roomId) return

    let closed = false
    let retry = null
    let attempt = 0
    let ping = null

    const connect = () => {
      if (closed) return
      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        attempt = 0
        setConnected(true)
        const payload = { type: "join", roomId, role: roleRef.current }
        if (codeRef.current) payload.code = codeRef.current
        if (nicknameRef.current) payload.nickname = nicknameRef.current
        ws.send(JSON.stringify(payload))
        ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }))
        }, 25_000)
      }

      ws.onmessage = (e) => {
        let msg
        try {
          msg = JSON.parse(e.data)
        } catch {
          return
        }
        if (!msg || typeof msg !== "object") return
        const h = handlersRef.current
        switch (msg.type) {
          case "state":           h.onState?.(msg); break
          case "widget-put":      h.onWidgetPut?.(msg.widget); break
          case "widget-del":      h.onWidgetDel?.(msg.id); break
          case "widget-reorder":  h.onWidgetReorder?.(msg.order); break
          case "clear-all":       h.onClearAll?.(); break
          case "play-sound":      h.onPlaySound?.(msg.id); break
          case "chat":            h.onChat?.(msg); break
          case "asset-put":       h.onAssetPut?.(msg.asset); break
          case "asset-del":       h.onAssetDel?.(msg.id); break
          case "stream-set":      h.onStreamSet?.(msg.stream); break
        }
      }

      const reconnect = () => {
        clearInterval(ping)
        setConnected(false)
        if (closed) return
        // Back off, but stay responsive: a reload should rejoin in a second, not
        // after the socket has been dead for a while.
        const delay = Math.min(500 * 2 ** attempt++, 5000)
        retry = setTimeout(connect, delay)
      }

      ws.onclose = reconnect
      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      closed = true
      clearInterval(ping)
      clearTimeout(retry)
      const w = wsRef.current
      if (w) {
        w.onclose = null
        w.close()
      }
      setConnected(false)
    }
  }, [roomId])

  const send = useCallback((payload) => {
    const w = wsRef.current
    if (w?.readyState === WebSocket.OPEN) w.send(JSON.stringify(payload))
  }, [])

  const putWidget = useCallback((widget) => send({ type: "widget-put", widget }), [send])
  const deleteWidget = useCallback((id) => send({ type: "widget-del", id }), [send])
  const playSound = useCallback((id) => send({ type: "play-sound", id }), [send])
  const putAsset = useCallback((asset) => send({ type: "asset-put", asset }), [send])
  const deleteAsset = useCallback((id) => send({ type: "asset-del", id }), [send])
  const setStream = useCallback((stream) => send({ type: "stream-set", stream }), [send])
  const clearAll = useCallback(() => send({ type: "clear-all" }), [send])
  const reorderWidgets = useCallback((order) => send({ type: "widget-reorder", order }), [send])
  const sendChat = useCallback((text) => send({ type: "chat", text }), [send])

  return { connected, send, putWidget, deleteWidget, playSound, putAsset, deleteAsset, setStream, clearAll, reorderWidgets, sendChat }
}
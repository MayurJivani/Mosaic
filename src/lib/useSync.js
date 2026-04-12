import { useEffect, useRef, useCallback } from "react"

const WS_URL = import.meta.env.PUBLIC_WS_URL 
  ? import.meta.env.PUBLIC_WS_URL 
  : typeof window !== "undefined" 
    ? `ws://${window.location.hostname}:4322` 
    : "ws://localhost:4322"

/**
 * @param {object} opts
 * @param {string}   opts.roomId
 * @param {boolean}  [opts.host]        – true on the studio side
 * @param {Function} [opts.onPlay]
 * @param {Function} [opts.onPause]
 * @param {Function} [opts.onSeek]
 * @param {Function} [opts.onVideoUrl]  – called with url when host sets video
 * @param {Function} [opts.onState]     – called with full state on join
 * @param {Function} [opts.onViewersUpdate] - called when viewers array changes (host)
 * @param {Function} [opts.onClipUpdate] - called when this viewer is assigned a crop
 * @param {object}   [opts.device]      - viewer device dimensions/orientation
 */
export function useSync({ roomId, host = false, device, onPlay, onPause, onSeek, onVideoUrl, onState, onViewersUpdate, onClipUpdate }) {
  const wsRef = useRef(null)

  useEffect(() => {
    if (!roomId) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => ws.send(JSON.stringify({ type: "join", roomId, host, device }))

    ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }

      if (msg.type === "play")      onPlay?.(msg.time)
      if (msg.type === "pause")     onPause?.(msg.time)
      if (msg.type === "seek")      onSeek?.(msg.time)
      if (msg.type === "video-url") onVideoUrl?.(msg.url)
      if (msg.type === "state")     onState?.(msg)
      if (msg.type === "viewers-update") onViewersUpdate?.(msg.viewers)
      if (msg.type === "set-clip")  onClipUpdate?.(msg.clip)
    }

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "ping" }))
    }, 25_000)

    return () => { clearInterval(ping); ws.close() }
  }, [roomId, host])

  const send = useCallback((payload) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify(payload))
  }, [])

  const broadcast     = useCallback((type, time) => send({ type, roomId, time }),         [roomId, send])
  const broadcastUrl  = useCallback((url)         => send({ type: "video-url", roomId, url }), [roomId, send])
  const sendClip      = useCallback((targetViewerId, clip) => send({ type: "set-clip", roomId, targetViewerId, clip }), [roomId, send])

  return { broadcast, broadcastUrl, send, sendClip }
}
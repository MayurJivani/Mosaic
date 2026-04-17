import { useEffect, useRef, useCallback } from "react"

const WS_URL = import.meta.env.PUBLIC_WS_URL
  ? import.meta.env.PUBLIC_WS_URL
  : typeof window !== "undefined"
    ? `ws://${window.location.hostname}:4322`
    : "ws://localhost:4322"

/**
 * @param {object} opts
 * @param {string}   opts.roomId
 * @param {boolean}  [opts.host]
 * @param {string}   [opts.viewerId]  – stable id for viewers (reconnect / duplicate tab)
 * @param {Function} [opts.onPlay]
 * @param {Function} [opts.onPause]
 * @param {Function} [opts.onSeek]
 * @param {Function} [opts.onVideoUrl]
 * @param {Function} [opts.onState]
 * @param {Function} [opts.onViewersUpdate]
 * @param {Function} [opts.onClipUpdate]
 * @param {object}   [opts.device]
 */
export function useSync({
  roomId,
  host = false,
  viewerId,
  device,
  onPlay,
  onPause,
  onSeek,
  onVideoUrl,
  onState,
  onViewersUpdate,
  onClipUpdate,
}) {
  const wsRef = useRef(null)
  const handlersRef = useRef({
    onPlay,
    onPause,
    onSeek,
    onVideoUrl,
    onState,
    onViewersUpdate,
    onClipUpdate,
  })
  const deviceRef = useRef(device)
  const viewerIdRef = useRef(viewerId)

  handlersRef.current = {
    onPlay,
    onPause,
    onSeek,
    onVideoUrl,
    onState,
    onViewersUpdate,
    onClipUpdate,
  }
  deviceRef.current = device
  viewerIdRef.current = viewerId

  useEffect(() => {
    if (!roomId) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      const payload = {
        type: "join",
        roomId,
        host,
        device: deviceRef.current,
      }
      if (!host && viewerIdRef.current)
        payload.viewerId = viewerIdRef.current
      ws.send(JSON.stringify(payload))
    }

    ws.onmessage = (e) => {
      let msg
      try {
        msg = JSON.parse(e.data)
      } catch {
        return
      }
      const h = handlersRef.current
      if (msg.type === "play") h.onPlay?.(msg.time)
      if (msg.type === "pause") h.onPause?.(msg.time)
      if (msg.type === "seek") h.onSeek?.(msg.time)
      if (msg.type === "video-url") h.onVideoUrl?.(msg.url)
      if (msg.type === "state") h.onState?.(msg)
      if (msg.type === "viewers-update") h.onViewersUpdate?.(msg.viewers)
      if (msg.type === "set-clip") h.onClipUpdate?.(msg.clip)
    }

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "ping" }))
    }, 25_000)

    return () => {
      clearInterval(ping)
      ws.close()
    }
  }, [roomId, host])

  const send = useCallback((payload) => {
    const w = wsRef.current
    if (w?.readyState === WebSocket.OPEN) w.send(JSON.stringify(payload))
  }, [])

  const broadcast = useCallback(
    (type, time) => send({ type, roomId, time }),
    [roomId, send],
  )
  const broadcastUrl = useCallback(
    (url) => send({ type: "video-url", roomId, url }),
    [roomId, send],
  )
  const sendClip = useCallback(
    (targetViewerId, clip) =>
      send({ type: "set-clip", roomId, targetViewerId, clip }),
    [roomId, send],
  )

  return { broadcast, broadcastUrl, send, sendClip }
}

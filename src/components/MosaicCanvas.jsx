import { useState, useRef, useCallback, useEffect } from "react"
import { nanoid } from "nanoid"
import VideoNode from "./VideoNode"
import ScreenTile from "./ScreenTile"
import Inspector from "./Inspector"
import Toolbar from "./Toolbar"

// Per-node sync hook wrapper — each node is its own room
import { useSync } from "../lib/useSync"
import { resolveClip } from "../lib/clips"
import { stripToRelayPath } from "../lib/mediaUrl"

const syncChannels = new Map()

/** World-space rect of the 16:9 preview inside VideoNode (must match VideoNode layout). */
const SOURCE_PREVIEW = { insetX: 12, insetY: 56, w: 200, h: 112.5 }

function clipRectForTileOnSource(tileX, tileY, tileW, tileH, nodeX, nodeY) {
  const vx = nodeX + SOURCE_PREVIEW.insetX
  const vy = nodeY + SOURCE_PREVIEW.insetY
  const { w: vw, h: vh } = SOURCE_PREVIEW
  return {
    x: (tileX - vx) / vw,
    y: (tileY - vy) / vh,
    w: tileW / vw,
    h: tileH / vh,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NodeSyncBridge: a tiny component that mounts one useSync per node
// ─────────────────────────────────────────────────────────────────────────────
function NodeSyncBridge({ node, onViewers }) {
  const { broadcast, broadcastUrl, sendClip } = useSync({
    roomId: node.roomId,
    host: true,
    onViewersUpdate: (viewers) => onViewers(node.id, viewers),
  })

  useEffect(() => {
    syncChannels.set(node.id, { broadcast, broadcastUrl, sendClip })
    return () => syncChannels.delete(node.id)
  }, [node.id, broadcast, broadcastUrl, sendClip])

  useEffect(() => {
    if (node.url) broadcastUrl(stripToRelayPath(node.url))
  }, [node.url, broadcastUrl])

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MosaicCanvas() {
  const [nodes, setNodes]           = useState([])
  const [tiles, setTiles]           = useState([])
  const [connections, setConnections] = useState([])
  const [pan, setPan]               = useState({ x: 120, y: 120 })
  const [zoom, setZoom]             = useState(1)
  const [drag, setDrag]             = useState(null)
  const [resize, setResize]         = useState(null)
  const [panning, setPanning]       = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedTile, setSelectedTile] = useState(null)

  const canvasRef      = useRef(null)
  const videoRefs      = useRef({})
  const tileVideoRefs  = useRef({})
  /** Latest world (x,y) while dragging — React state can lag one frame behind pointer on mouseup. */
  const dragLiveRef    = useRef(null)

  // ── world → screen ──────────────────────────────────────────────────────
  const toScreen = (wx, wy) => ({ x: wx * zoom + pan.x, y: wy * zoom + pan.y })

  // ── node CRUD ───────────────────────────────────────────────────────────
  const addNode = () => {
    const id = nanoid(8)
    setNodes((p) => [...p, {
      id,
      roomId: nanoid(10),
      x: 150 + Math.random() * 100,
      y: 100 + Math.random() * 80,
      name: "Untitled",
      url: null,
    }])
  }

  const addTile = useCallback((nodeId) => {
    const id  = nanoid(8)
    const src = nodes.find((n) => n.id === nodeId)
    setTiles((p) => [...p, {
      id,
      x: (src?.x ?? 300) + 260,
      y: (src?.y ?? 60)  + Math.random() * 40,
      w: 320, h: 200, clip: "full",
      manual: true
    }])
    setConnections((p) => [...p, { nodeId, tileId: id }])
  }, [nodes])

  const handleViewersUpdate = useCallback((nodeId, viewers) => {
    const src = nodes.find((n) => n.id === nodeId)
    setTiles((p) => {
      let changed = false
      const withUpdates = p.map((t) => {
        if (!t.viewerId) return t
        const v = viewers.find((vi) => vi.id === t.viewerId)
        if (!v?.device) return t
        const d = v.device
        const nextH = 160 * (d.h / d.w)
        const dev = t.viewerDevice
        if (
          !dev ||
          dev.w !== d.w ||
          dev.h !== d.h ||
          dev.type !== d.type ||
          Math.abs((t.h ?? 0) - nextH) > 0.5
        ) {
          changed = true
          return { ...t, viewerDevice: d, h: nextH }
        }
        return t
      })
      const newTiles = [...withUpdates]
      viewers.forEach((v) => {
        if (!newTiles.find((t) => t.viewerId === v.id)) {
          const tw = 160
          const th = 160 * (v.device.h / v.device.w)
          const tx = (src?.x ?? 300) + 260 + Math.random() * 40
          const ty = (src?.y ?? 60) + Math.random() * 40
          const clipData = src
            ? clipRectForTileOnSource(tx, ty, tw, th, src.x, src.y)
            : { x: 0, y: 0, w: 1, h: 1 }
          newTiles.push({
            id: v.id,
            viewerId: v.id,
            viewerDevice: v.device,
            x: tx,
            y: ty,
            w: tw,
            h: th,
            clip: clipData,
          })
          changed = true
          queueMicrotask(() => {
            const ch = syncChannels.get(nodeId)
            if (ch) ch.sendClip(v.id, clipData)
          })
        }
      })
      return changed ? newTiles : p
    })
    setConnections((p) => {
      const newConns = [...p]
      let changed = false
      viewers.forEach(v => {
        if (!newConns.find(c => c.tileId === v.id)) {
          newConns.push({ nodeId, tileId: v.id })
          changed = true
        }
      })
      return changed ? newConns : p
    })
  }, [nodes])

  const onVideoLoaded = useCallback((nodeId, url, name) => {
    setNodes((p) => p.map((n) => (n.id === nodeId ? { ...n, url, name } : n)))
  }, [])

  // ── play / pause (synced) ───────────────────────────────────────────────
  const syncPlay = useCallback((nodeId) => {
    const v = videoRefs.current[nodeId]
    if (!v) return
    const playing = !v.paused
    const time    = v.currentTime

    if (playing) {
      v.pause()
      syncChannels.get(nodeId)?.broadcast("pause", time)
    } else {
      v.play().catch(err => console.warn("Video play blocked:", err))
      syncChannels.get(nodeId)?.broadcast("play", time)
    }

    // Sync local tile mirrors
    connections.filter((c) => c.nodeId === nodeId).forEach(({ tileId }) => {
      const tv = tileVideoRefs.current[tileId]
      if (!tv) return
      if (playing) tv.pause()
      else { 
        tv.currentTime = time
        tv.play().catch(err => console.warn("Tile play blocked:", err))
      }
    })
  }, [connections])

  // ── drag / resize ───────────────────────────────────────────────────────
  const startDrag = useCallback((e, type, id) => {
    e.stopPropagation()
    const item = type === "node"
      ? nodes.find((n) => n.id === id)
      : tiles.find((t) => t.id === id)
    if (!item) return
    dragLiveRef.current = { type, id, x: item.x, y: item.y }
    setDrag({ type, id, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y })
    if (type === "node") { setSelectedNode(id); setSelectedTile(null) }
    else                  { setSelectedTile(id); setSelectedNode(null) }
  }, [nodes, tiles])

  const startResize = useCallback((e, tileId) => {
    e.stopPropagation()
    const tile = tiles.find((t) => t.id === tileId)
    if (!tile) return
    setResize({ id: tileId, sx: e.clientX, sy: e.clientY, ow: tile.w, oh: tile.h })
  }, [tiles])

  const onMouseMove = useCallback((e) => {
    if (panning) {
      setPan((p) => ({ x: p.x + e.movementX, y: p.y + e.movementY }))
      return
    }
    if (resize) {
      const dx = (e.clientX - resize.sx) / zoom
      const dy = (e.clientY - resize.sy) / zoom
      setTiles((p) => p.map((t) => t.id === resize.id
        ? { ...t, w: Math.max(120, resize.ow + dx), h: Math.max(80, resize.oh + dy) }
        : t))
      return
    }
    if (!drag) return
    const dx = (e.clientX - drag.sx) / zoom
    const dy = (e.clientY - drag.sy) / zoom
    const nx = drag.ox + dx
    const ny = drag.oy + dy
    dragLiveRef.current = { type: drag.type, id: drag.id, x: nx, y: ny }
    if (drag.type === "node")
      setNodes((p) => p.map((n) => n.id === drag.id ? { ...n, x: nx, y: ny } : n))
    else
      setTiles((p) => p.map((t) => t.id === drag.id ? { ...t, x: nx, y: ny } : t))
  }, [drag, resize, panning, zoom])

  const onMouseUp   = useCallback(() => { 
    const live = dragLiveRef.current
    if (drag?.type === "tile" && live?.type === "tile" && live.id === drag.id) {
      const tile = tiles.find((t) => t.id === drag.id)
      const conn = tile && connections.find((c) => c.tileId === tile.id)
      if (tile && conn && tile.viewerId) {
        const node = nodes.find((n) => n.id === conn.nodeId)
        if (node) {
          const clipData = clipRectForTileOnSource(
            live.x,
            live.y,
            tile.w,
            tile.h,
            node.x,
            node.y,
          )
          const channel = syncChannels.get(node.id)
          if (channel) channel.sendClip(tile.viewerId, clipData)
          setTiles((p) =>
            p.map((t) => (t.id === tile.id ? { ...t, clip: clipData } : t)),
          )
        }
      }
    }
    if (drag?.type === "node" && live?.type === "node" && live.id === drag.id) {
      const nodeId = drag.id
      const nx = live.x
      const ny = live.y
      const channel = syncChannels.get(nodeId)
      const clipByTileId = new Map()
      connections
        .filter((c) => c.nodeId === nodeId)
        .forEach((c) => {
          const tile = tiles.find((t) => t.id === c.tileId)
          if (!tile?.viewerId) return
          const clipData = clipRectForTileOnSource(
            tile.x,
            tile.y,
            tile.w,
            tile.h,
            nx,
            ny,
          )
          clipByTileId.set(tile.id, clipData)
          channel?.sendClip(tile.viewerId, clipData)
        })
      if (clipByTileId.size) {
        setTiles((p) =>
          p.map((t) => {
            const cd = clipByTileId.get(t.id)
            return cd ? { ...t, clip: cd } : t
          }),
        )
      }
    }
    dragLiveRef.current = null
    setDrag(null)
    setResize(null)
    setPanning(false) 
  }, [drag, tiles, connections, nodes])

  const onCanvasDown = useCallback((e) => {
    if (e.target === canvasRef.current || e.target.dataset.bg) {
      setPanning(true)
      setSelectedNode(null)
      setSelectedTile(null)
    }
  }, [])

  // zoom toward cursor
  const onWheel = useCallback((e) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    setZoom((z) => {
      const nz = Math.min(2, Math.max(0.2, z * factor))
      setPan((p) => ({
        x: cx - (cx - p.x) * (nz / z),
        y: cy - (cy - p.y) * (nz / z),
      }))
      return nz
    })
  }, [])

  useEffect(() => {
    window.addEventListener("mouseup", onMouseUp)
    const el = canvasRef.current
    el?.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      window.removeEventListener("mouseup", onMouseUp)
      el?.removeEventListener("wheel", onWheel)
    }
  }, [onMouseUp, onWheel])

  // Delete via keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setSelectedNode(null); setSelectedTile(null); return }
      if ((e.key === "Delete" || e.key === "Backspace") && e.target === document.body) {
        if (selectedTile) { deleteTile(selectedTile); return }
        if (selectedNode)   deleteNode(selectedNode)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode, selectedTile])

  const deleteNode = (id) => {
    setNodes((p) => p.filter((n) => n.id !== id))
    setConnections((p) => p.filter((c) => c.nodeId !== id))
    if (selectedNode === id) setSelectedNode(null)
  }

  const deleteTile = (id) => {
    setTiles((p) => p.filter((t) => t.id !== id))
    setConnections((p) => p.filter((c) => c.tileId !== id))
    if (selectedTile === id) setSelectedTile(null)
  }

  const setTileClip = useCallback(
    (tileId, clip) => {
      const tile = tiles.find((t) => t.id === tileId)
      const conn = connections.find((c) => c.tileId === tileId)
      const node = conn ? nodes.find((n) => n.id === conn.nodeId) : null
      if (tile?.viewerId && node) {
        const rect = resolveClip(clip)
        syncChannels.get(node.id)?.sendClip(tile.viewerId, rect)
      }
      setTiles((p) => p.map((t) => (t.id === tileId ? { ...t, clip } : t)))
    },
    [tiles, connections, nodes],
  )

  const getVideoUrl = (tileId) => {
    const c = connections.find((c) => c.tileId === tileId)
    return c ? nodes.find((n) => n.id === c.nodeId)?.url ?? null : null
  }

  // SVG connector (screen-space bezier)
  const getPath = (conn) => {
    const node = nodes.find((n) => n.id === conn.nodeId)
    const tile = tiles.find((t) => t.id === conn.tileId)
    if (!node || !tile) return null
    const fs = toScreen(node.x + 224, node.y + 54)
    const ts = toScreen(tile.x,       tile.y + tile.h / 2)
    const mx = (fs.x + ts.x) / 2
    return `M ${fs.x} ${fs.y} C ${mx} ${fs.y} ${mx} ${ts.y} ${ts.x} ${ts.y}`
  }

  const selTile          = tiles.find((t) => t.id === selectedTile) ?? null
  const selNode          = nodes.find((n) => n.id === selectedNode) ?? null
  const selNodeTileCount = connections.filter((c) => c.nodeId === selectedNode).length

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-full overflow-hidden bg-canvas cursor-default select-none"
      onMouseMove={onMouseMove}
      onMouseDown={onCanvasDown}
    >
      {/* Per-node WebSocket sync bridge (renders nothing) */}
      {nodes.map((node) => (
        <NodeSyncBridge key={node.id} node={node} onViewers={handleViewersUpdate} />
      ))}

      {/* dot grid */}
      <div
        data-bg="1"
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, #252520 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          backgroundPosition: `${pan.x % 28}px ${pan.y % 28}px`,
        }}
      />

      {/* SVG connector overlay — full screen, outside transform */}
      <svg
        className="absolute inset-0 pointer-events-none overflow-visible"
        style={{ width: "100%", height: "100%" }}
      >
        {connections.map((conn) => {
          const d = getPath(conn)
          if (!d) return null
          const active = conn.nodeId === selectedNode || conn.tileId === selectedTile
          return (
            <g key={`${conn.nodeId}~${conn.tileId}`}>
              <path d={d} fill="none" stroke="#2a2a26" strokeWidth="1.5" strokeDasharray="6 4" />
              {active && (
                <path d={d} fill="none" stroke="#c8f04a" strokeWidth="1.5" opacity="0.55" strokeDasharray="6 4">
                  <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="0.7s" repeatCount="indefinite" />
                </path>
              )}
            </g>
          )
        })}
      </svg>

      {/* world-space transform layer */}
      <div
        className="absolute origin-top-left"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {nodes.map((node) => (
          <VideoNode
            key={node.id}
            node={node}
            isSelected={selectedNode === node.id}
            videoRef={(el) => { if (el) videoRefs.current[node.id] = el }}
            onMouseDown={(e) => startDrag(e, "node", node.id)}
            onDelete={() => deleteNode(node.id)}
            onVideoLoaded={(url, name) => onVideoLoaded(node.id, url, name)}
            onAddTile={() => addTile(node.id)}
            onTogglePlay={() => syncPlay(node.id)}
            tileCount={connections.filter((c) => c.nodeId === node.id).length}
          />
        ))}

        {tiles.map((tile) => (
          <ScreenTile
            key={tile.id}
            tile={tile}
            isSelected={selectedTile === tile.id}
            videoUrl={getVideoUrl(tile.id)}
            videoRef={(el) => { if (el) tileVideoRefs.current[tile.id] = el }}
            onMouseDown={(e) => startDrag(e, "tile", tile.id)}
            onClick={() => { setSelectedTile(tile.id); setSelectedNode(null) }}
            onDelete={() => deleteTile(tile.id)}
            onResizeStart={(e) => startResize(e, tile.id)}
          />
        ))}
      </div>

      <Toolbar
        onAddNode={addNode}
        onResetView={() => { setPan({ x: 120, y: 120 }); setZoom(1) }}
        nodeCount={nodes.length}
        tileCount={tiles.length}
        connCount={connections.length}
      />

      <Inspector
        selectedTile={selTile}
        selectedNode={selNode}
        connTileCount={selNodeTileCount}
        onSetClip={setTileClip}
        onAddTile={addTile}
      />

      <div className="fixed bottom-5 left-5 z-50 pointer-events-none space-y-0.5">
        <div className="text-[9px] font-mono text-muted tracking-widest">
          {Math.round(zoom * 100)}% · scroll = zoom · drag canvas = pan
        </div>
        <div className="text-[8px] font-mono text-muted/40 tracking-wide">
          del = remove selected · esc = deselect
        </div>
      </div>
    </div>
  )
}
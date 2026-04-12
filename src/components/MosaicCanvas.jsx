import { useState, useRef, useCallback, useEffect } from "react"
import { nanoid } from "nanoid"
import VideoNode from "./VideoNode"
import ScreenTile from "./ScreenTile"
import Inspector from "./Inspector"
import Toolbar from "./Toolbar"

// Per-node sync hook wrapper — each node is its own room
import { useSync } from "../lib/useSync"

// One sync channel per node id
const syncChannels = new Map()

function getOrCreateSync(nodeId, roomId, setNodes) {
  // We manage this outside React — just a registry
  // Actual hooks are called inside NodeSyncBridge
}

// ─────────────────────────────────────────────────────────────────────────────
// NodeSyncBridge: a tiny component that mounts one useSync per node
// ─────────────────────────────────────────────────────────────────────────────
function NodeSyncBridge({ node, videoRef, connections, tileVideoRefs, onViewers }) {
  const { broadcast, broadcastUrl, sendClip } = useSync({
    roomId: node.roomId,
    host: true,
    onViewersUpdate: (viewers) => onViewers(node.id, viewers)
  })

  // Expose broadcast on a shared registry so MosaicCanvas can call it
  useEffect(() => {
    syncChannels.set(node.id, { broadcast, broadcastUrl, sendClip })
    return () => syncChannels.delete(node.id)
  }, [node.id, broadcast, broadcastUrl, sendClip])

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
      const newTiles = [...p]
      let changed = false
      viewers.forEach(v => {
        if (!newTiles.find(t => t.viewerId === v.id)) {
          newTiles.push({
            id: v.id, // sync id
            viewerId: v.id,
            viewerDevice: v.device,
            x: (src?.x ?? 300) + 260 + Math.random() * 40,
            y: (src?.y ?? 60)  + Math.random() * 40,
            w: 160,
            h: 160 * (v.device.h / v.device.w),
            clip: "full",
          })
          changed = true
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
    setNodes((p) => p.map((n) => n.id === nodeId ? { ...n, url, name } : n))
    // Broadcast url to all viewers of this room
    setTimeout(() => {
      syncChannels.get(nodeId)?.broadcastUrl(url)
    }, 100)
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
    if (drag.type === "node")
      setNodes((p) => p.map((n) => n.id === drag.id ? { ...n, x: drag.ox + dx, y: drag.oy + dy } : n))
    else
      setTiles((p) => p.map((t) => t.id === drag.id ? { ...t, x: drag.ox + dx, y: drag.oy + dy } : t))
  }, [drag, resize, panning, zoom])

  const onMouseUp   = useCallback(() => { 
    if (drag && drag.type === "tile") {
      const tile = tiles.find(t => t.id === drag.id)
      const conn = connections.find(c => c.tileId === tile.id)
      if (tile && conn && tile.viewerId) {
        const node = nodes.find(n => n.id === conn.nodeId)
        if (node) {
          // Bounding box of Video thumbnail in standard layout
          const vx = node.x + 12
          const vy = node.y + 56
          const vw = 200
          const vh = 112.5
          
          const cx = (tile.x - vx) / vw
          const cy = (tile.y - vy) / vh
          const cw = tile.w / vw
          const ch = tile.h / vh

          // Construct an accurate float rect
          const clipData = { x: cx, y: cy, w: cw, h: ch }
          
          // Send to viewer via sync channel
          const channel = syncChannels.get(node.id)
          if (channel) channel.sendClip(tile.viewerId, clipData)

          setTiles(p => p.map(t => t.id === tile.id ? { ...t, clip: clipData } : t))
        }
      }
    }
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

  const setTileClip = (tileId, clip) =>
    setTiles((p) => p.map((t) => t.id === tileId ? { ...t, clip } : t))

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
        <NodeSyncBridge
          key={node.id}
          node={node}
          videoRef={videoRefs.current[node.id]}
          connections={connections}
          tileVideoRefs={tileVideoRefs}
          onViewers={handleViewersUpdate}
        />
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
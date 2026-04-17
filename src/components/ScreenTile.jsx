import { useRef, useEffect, useCallback } from "react"
import { getClipVideoStyle, resolveClip } from "../lib/clips"

/** Full-frame strip under the live crop: same source, viewport drawn on top. */
function FullVideoMinimap({ videoUrl, clip, tileId }) {
  const miniRef = useRef(null)
  const c = resolveClip(clip)

  useEffect(() => {
    const tick = () => {
      const main = document.querySelector(`[data-mosaic-tile-main="${tileId}"]`)
      const mini = miniRef.current
      if (!(main instanceof HTMLVideoElement) || !mini) return
      try {
        if (Math.abs(mini.currentTime - main.currentTime) > 0.2)
          mini.currentTime = main.currentTime
      } catch {
        /* ignore */
      }
    }
    const id = window.setInterval(tick, 280)
    return () => window.clearInterval(id)
  }, [tileId])

  return (
    <div
      className="relative w-full shrink-0 border-t border-accent/25 bg-black"
      style={{ height: "30%", minHeight: 44, maxHeight: 100 }}
    >
      <p className="pointer-events-none absolute left-1.5 top-1 z-10 text-[6px] font-mono uppercase tracking-[0.12em] text-muted">
        full frame · viewport
      </p>
      <div className="absolute inset-x-1 top-5 bottom-1 overflow-hidden rounded-sm bg-[#080807]">
        <video
          ref={miniRef}
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-fill opacity-80"
        />
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
        >
          <div
            className="absolute box-border border-2 border-accent shadow-[0_0_0_1px_rgba(0,0,0,0.92),0_0_10px_rgba(200,240,74,0.25)] rounded-[1px]"
            style={{
              left: `${c.x * 100}%`,
              top: `${c.y * 100}%`,
              width: `${c.w * 100}%`,
              height: `${c.h * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function ScreenTile({ tile, isSelected, videoUrl, videoRef, onMouseDown, onClick, onDelete, onResizeStart }) {
  const showMinimap = !!(tile.viewerDevice && videoUrl)

  const setMainRef = useCallback(
    (el) => {
      if (typeof videoRef === "function") videoRef(el)
      if (el) el.setAttribute("data-mosaic-tile-main", tile.id)
    },
    [videoRef, tile.id],
  )

  return (
    <div
      className={`absolute overflow-hidden rounded border transition-[border-color,box-shadow] select-none ${
        isSelected
          ? "border-accent shadow-[0_0_0_1px_rgba(200,240,74,0.18),0_8px_32px_rgba(0,0,0,0.8)]"
          : "border-border hover:border-[#3a3a36]"
      }`}
      style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h, background: "#161614", cursor: "grab" }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <div
        className={`absolute top-0 left-0 right-0 z-30 flex justify-between items-center px-2 py-1 transition-opacity bg-gradient-to-b from-black/80 to-transparent ${
          isSelected ? "opacity-100" : "opacity-0 hover:opacity-100"
        }`}
      >
        <span className="text-[8px] uppercase tracking-widest font-mono text-muted">
          {tile.viewerDevice ? `${tile.viewerDevice.type} - ${tile.viewerDevice.w}x${tile.viewerDevice.h}` : "Custom Tile"}
        </span>
        <button
          type="button"
          className="text-border hover:text-danger text-sm leading-none transition-colors"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          ×
        </button>
      </div>

      <div className={`absolute inset-0 z-0 top-6 ${showMinimap ? "flex flex-col" : ""}`}>
        <div className={showMinimap ? "relative min-h-0 flex-1 overflow-hidden" : "absolute inset-0 overflow-hidden"}>
          {videoUrl ? (
            <video
              ref={setMainRef}
              src={videoUrl}
              style={getClipVideoStyle(tile.clip)}
              loop
              muted
              playsInline
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
              <span className="text-2xl opacity-20 text-border">▣</span>
              <span className="text-[9px] uppercase tracking-widest font-mono text-border">no source</span>
            </div>
          )}
        </div>
        {showMinimap && (
          <FullVideoMinimap videoUrl={videoUrl} clip={tile.clip} tileId={tile.id} />
        )}
      </div>

      <div
        className={`absolute bottom-0 right-0 z-30 flex h-4 w-4 cursor-se-resize items-end justify-end pb-0.5 pr-0.5 transition-opacity ${
          isSelected ? "opacity-100" : "opacity-0 hover:opacity-100"
        }`}
        onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e) }}
        onClick={(e) => e.stopPropagation()}
        style={{ display: tile.viewerDevice ? "none" : "flex" }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 7L7 1M4 7L7 4M7 7L7 7" stroke="#c8f04a" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
        </svg>
      </div>

      {isSelected && (
        <div className="pointer-events-none absolute bottom-1 left-2 z-30 text-[7px] font-mono text-muted">
          {Math.round(tile.w)}×{Math.round(tile.h)}
        </div>
      )}
    </div>
  )
}

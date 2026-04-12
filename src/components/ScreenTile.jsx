function getCustomClipStyle(clip) {
  if (!clip || clip === "full") {
    return { position: "absolute", width: "100%", height: "100%", left: 0, top: 0, objectFit: "cover", pointerEvents: "none" }
  }
  return {
    position: "absolute",
    width:  `${100 / clip.w}%`,
    height: `${100 / clip.h}%`,
    left:   `-${(clip.x / clip.w) * 100}%`,
    top:    `-${(clip.y / clip.h) * 100}%`,
    objectFit: "cover",
    pointerEvents: "none",
  }
}

export default function ScreenTile({ tile, isSelected, videoUrl, videoRef, onMouseDown, onClick, onDelete, onResizeStart }) {
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
      {/* header bar — visible on hover or select */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 flex justify-between items-center px-2 py-1 transition-opacity bg-gradient-to-b from-black/80 to-transparent ${
          isSelected ? "opacity-100" : "opacity-0 hover:opacity-100"
        }`}
      >
        <span className="text-[8px] uppercase tracking-widest font-mono text-muted">
          {tile.viewerDevice ? `${tile.viewerDevice.type} - ${tile.viewerDevice.w}x${tile.viewerDevice.h}` : "Custom Tile"}
        </span>
        <button
          className="text-border hover:text-danger text-sm leading-none transition-colors"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          ×
        </button>
      </div>

      {/* video / placeholder */}
      <div className="absolute inset-0 overflow-hidden">
        {videoUrl ? (
          <video ref={videoRef} src={videoUrl} style={getCustomClipStyle(tile.clip)} loop muted playsInline />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
            <span className="text-2xl opacity-20 text-border">▣</span>
            <span className="text-[9px] uppercase tracking-widest font-mono text-border">no source</span>
          </div>
        )}
      </div>

      {/* resize handle — bottom-right corner */}
      <div
        className={`absolute bottom-0 right-0 w-4 h-4 z-20 flex items-end justify-end pb-0.5 pr-0.5 cursor-se-resize transition-opacity ${
          isSelected ? "opacity-100" : "opacity-0 hover:opacity-100"
        }`}
        onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e) }}
        onClick={(e) => e.stopPropagation()}
        style={{ display: tile.viewerDevice ? "none" : "flex" }} // Can't resize linked devices as their auto aspect ratio is physical
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 7L7 1M4 7L7 4M7 7L7 7" stroke="#c8f04a" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
        </svg>
      </div>

      {/* size badge */}
      {isSelected && (
        <div className="absolute bottom-1 left-2 z-10 text-[7px] font-mono text-muted pointer-events-none">
          {Math.round(tile.w)}×{Math.round(tile.h)}
        </div>
      )}
    </div>
  )
}
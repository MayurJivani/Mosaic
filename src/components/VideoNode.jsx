import { useRef, useState } from "react"
import { useUpload } from "../lib/useUpload"

export default function VideoNode({
  node, isSelected, videoRef,
  onMouseDown, onDelete, onVideoLoaded,
  onAddTile, onTogglePlay, tileCount,
}) {
  const { upload, uploading, progress } = useUpload()
  const [playing, setPlaying] = useState(false)
  const internalRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await upload(file)
    onVideoLoaded(url, file.name)
  }

  const handleTogglePlay = (ev) => {
    ev.stopPropagation()
    setPlaying((p) => !p)
    onTogglePlay()
  }

  return (
    <div
      className={`absolute w-56 rounded-md border cursor-grab active:cursor-grabbing select-none transition-all ${
        isSelected
          ? "border-accent shadow-[0_0_0_1px_rgba(200,240,74,0.2),0_12px_40px_rgba(0,0,0,0.9)] bg-[#131311]"
          : "border-border bg-surface hover:border-[#3a3a36]"
      }`}
      style={{ left: node.x, top: node.y }}
      onMouseDown={onMouseDown}
    >
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            uploading ? "bg-amber-400 animate-pulse"
            : node.url   ? "bg-accent"
            :              "bg-border"
          }`}
        />
        <span className="text-[10px] font-mono text-muted tracking-wide truncate flex-1">
          {node.name}
        </span>
        <button
          className="text-border hover:text-danger text-base leading-none transition-colors"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >×</button>
      </div>

      <div className="p-3 flex flex-col gap-2">
        {/* upload progress bar */}
        {uploading && (
          <div className="w-full h-0.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {node.url ? (
          /* thumbnail preview */
          <div className="w-full aspect-video rounded-sm bg-black overflow-hidden">
            <video
              ref={(el) => {
                internalRef.current = el
                if (videoRef) videoRef(el)
              }}
              src={node.url}
              className="w-full h-full object-cover block"
              loop muted playsInline
            />
          </div>
        ) : (
          /* drop zone */
          <label
            className="block border border-dashed border-border rounded-sm px-3 py-5 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-all group"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file?.type.startsWith("video/")) {
                const url = await upload(file)
                onVideoLoaded(url, file.name)
              }
            }}
          >
            <span className="text-[10px] font-mono tracking-wide text-muted group-hover:text-accent transition-colors">
              {uploading ? `uploading… ${progress}%` : "↑ click or drop video"}
            </span>
            <input type="file" accept="video/*" className="hidden" onChange={handleFile} disabled={uploading} />
          </label>
        )}

        {/* action buttons */}
        <div className="flex gap-1.5">
          {node.url && (
            <button
              className={`flex-1 text-[9px] uppercase tracking-widest font-mono py-1.5 rounded-sm transition-colors ${
                playing
                  ? "bg-accent text-canvas hover:bg-accent/80"
                  : "bg-border text-muted hover:bg-accent hover:text-canvas"
              }`}
              onClick={handleTogglePlay}
            >
              {playing ? "⏸ pause" : "▶ sync"}
            </button>
          )}
          <button
            className="flex-1 bg-border text-muted text-[9px] uppercase tracking-widest font-mono py-1.5 rounded-sm hover:bg-accent hover:text-canvas transition-colors"
            onClick={(e) => { e.stopPropagation(); onAddTile() }}
          >
            + tile{tileCount > 0 ? ` (${tileCount})` : ""}
          </button>
        </div>

        {/* room id row */}
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] uppercase tracking-widest font-mono text-border flex-shrink-0">room</span>
          <span className="text-[7px] font-mono text-muted/60 truncate">{node.roomId}</span>
          <button
            className="ml-auto text-[7px] font-mono text-border hover:text-accent transition-colors flex-shrink-0"
            title="Copy viewer link"
            onClick={(e) => {
              e.stopPropagation()
              navigator.clipboard.writeText(`${location.origin}/view?room=${node.roomId}`)
                .then(() => { /* toast */ })
            }}
          >
            copy link
          </button>
        </div>
      </div>
    </div>
  )
}
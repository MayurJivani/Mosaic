import { CLIP_PRESETS, presetKeyFromClip, resolveClip, CLIP_PRESET_ORDER } from "../lib/clips"

export default function Inspector({ selectedTile, selectedNode, connTileCount, onSetClip, onAddTile }) {
  const visible = selectedTile || selectedNode
  const activePreset = selectedTile ? presetKeyFromClip(selectedTile.clip) : null
  const resolved = selectedTile ? resolveClip(selectedTile.clip) : null

  return (
    <div className={`fixed right-5 top-16 bottom-5 w-52 z-50 bg-surface border border-border rounded-md p-4 flex flex-col gap-4 overflow-y-auto transition-transform duration-200 ${!visible ? "translate-x-[260px]" : ""}`}>
      {selectedTile && (
        <>
          <h2 className="font-display text-xl text-accent tracking-widest">TILE</h2>
          <div className="flex flex-col gap-2">
            <p className="text-[9px] uppercase tracking-[0.15em] text-muted">Clip region</p>
            <div className="grid grid-cols-3 gap-1">
              {CLIP_PRESET_ORDER.map((key) => {
                const val = CLIP_PRESETS[key]
                if (!val) return null
                const isActive = activePreset === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSetClip(selectedTile.id, key)}
                    className={`text-[8px] uppercase tracking-wide py-1.5 rounded-sm transition-all border ${
                      isActive
                        ? "bg-accent text-canvas border-accent"
                        : "bg-border text-muted border-transparent hover:border-accent-dim hover:text-ink"
                    }`}
                  >
                    {val.label}
                  </button>
                )
              })}
            </div>
            {activePreset === null && resolved && (
              <p className="text-[8px] font-mono text-muted/90 leading-relaxed border border-border/60 rounded-sm px-2 py-1.5 bg-canvas/40">
                <span className="text-accent/90 uppercase tracking-widest text-[7px]">Custom</span>
                <span className="block mt-1 text-muted">
                  From canvas ·{" "}
                  {resolved.x.toFixed(2)},{resolved.y.toFixed(2)} →{" "}
                  {(resolved.x + resolved.w).toFixed(2)},{(resolved.y + resolved.h).toFixed(2)}
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[9px] uppercase tracking-[0.15em] text-muted">Size</p>
            <p className="text-[10px] font-mono text-muted">{Math.round(selectedTile.w)} × {Math.round(selectedTile.h)}px</p>
          </div>
        </>
      )}
      {selectedNode && !selectedTile && (
        <>
          <h2 className="font-display text-xl text-accent tracking-widest">SOURCE</h2>
          <div className="flex flex-col gap-1">
            <p className="text-[9px] uppercase tracking-[0.15em] text-muted">Status</p>
            {selectedNode.url
              ? <><span className="inline-block bg-accent text-canvas text-[8px] font-mono px-1.5 py-0.5 rounded-sm w-fit">loaded</span>
                  <p className="text-[10px] font-mono text-muted mt-1">Tiles: {connTileCount}</p></>
              : <p className="text-[10px] font-mono text-muted">No video loaded</p>
            }
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[9px] uppercase tracking-[0.15em] text-muted">Room ID</p>
            <p className="text-[8px] font-mono text-muted break-all bg-border px-2 py-1 rounded-sm">{selectedNode.roomId}</p>
          </div>
          {selectedNode.url && (
            <button
              type="button"
              onClick={() => onAddTile(selectedNode.id)}
              className="text-[9px] uppercase tracking-widest font-mono bg-border text-muted hover:bg-accent hover:text-canvas py-2 rounded-sm transition-colors"
            >
              + Add Tile
            </button>
          )}
        </>
      )}
    </div>
  )
}

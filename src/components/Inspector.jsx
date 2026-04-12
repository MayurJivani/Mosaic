import { CLIP_PRESETS } from "../lib/clips"

export default function Inspector({ selectedTile, selectedNode, connTileCount, onSetClip, onAddTile }) {
  const visible = selectedTile || selectedNode
  return (
    <div className={`fixed right-5 top-16 bottom-5 w-52 z-50 bg-surface border border-border rounded-md p-4 flex flex-col gap-4 overflow-y-auto transition-transform duration-200 ${!visible ? "translate-x-[260px]" : ""}`}>
      {selectedTile && (
        <>
          <h2 className="font-display text-xl text-accent tracking-widest">TILE</h2>
          <div className="flex flex-col gap-2">
            <p className="text-[9px] uppercase tracking-[0.15em] text-muted">Clip Region</p>
            <div className="grid grid-cols-3 gap-1">
              {Object.entries(CLIP_PRESETS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => onSetClip(selectedTile.id, key)}
                  className={`text-[8px] uppercase tracking-wide py-1.5 rounded-sm transition-all border ${
                    selectedTile.clip === key
                      ? "bg-accent text-canvas border-accent"
                      : "bg-border text-muted border-transparent hover:border-accent-dim hover:text-ink"
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
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
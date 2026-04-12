export default function Toolbar({ onAddNode, onResetView, nodeCount, tileCount, connCount }) {
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 bg-surface border border-border rounded-md p-1 shadow-[0_8px_40px_rgba(0,0,0,0.8)]">
      <button
        id="btn-add-node"
        className="px-3 py-2 text-[10px] uppercase tracking-widest font-mono bg-accent text-canvas font-bold rounded-sm hover:brightness-110 active:scale-95 transition-all"
        onClick={onAddNode}
      >
        + Video Source
      </button>

      <div className="w-px h-6 bg-border mx-0.5" />

      <button
        id="btn-reset-view"
        className="px-3 py-2 text-[10px] uppercase tracking-widest font-mono text-muted hover:bg-border hover:text-ink rounded-sm transition-colors active:scale-95"
        onClick={onResetView}
      >
        Reset View
      </button>

      <div className="w-px h-6 bg-border mx-0.5" />

      <span className="px-3 text-[9px] font-mono text-muted tracking-wide tabular-nums">
        {nodeCount} <span className="opacity-50">src</span>
        &nbsp;·&nbsp;
        {tileCount} <span className="opacity-50">tiles</span>
        &nbsp;·&nbsp;
        {connCount} <span className="opacity-50">conn</span>
      </span>
    </div>
  )
}
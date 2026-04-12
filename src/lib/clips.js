export const CLIP_PRESETS = {
  full:   { label: "Full",       x: 0,   y: 0,   w: 1,   h: 1   },
  left:   { label: "Left",       x: 0,   y: 0,   w: 0.5, h: 1   },
  right:  { label: "Right",      x: 0.5, y: 0,   w: 0.5, h: 1   },
  top:    { label: "Top",        x: 0,   y: 0,   w: 1,   h: 0.5 },
  bottom: { label: "Bottom",     x: 0,   y: 0.5, w: 1,   h: 0.5 },
  tl:     { label: "Top-left",   x: 0,   y: 0,   w: 0.5, h: 0.5 },
  tr:     { label: "Top-right",  x: 0.5, y: 0,   w: 0.5, h: 0.5 },
  bl:     { label: "Bot-left",   x: 0,   y: 0.5, w: 0.5, h: 0.5 },
  br:     { label: "Bot-right",  x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
}

export function getClipVideoStyle(clip) {
  const c = CLIP_PRESETS[clip] ?? CLIP_PRESETS.full
  return {
    position: "absolute",
    width:  `${100 / c.w}%`,
    height: `${100 / c.h}%`,
    left:   `-${(c.x / c.w) * 100}%`,
    top:    `-${(c.y / c.h) * 100}%`,
    objectFit: "cover",
    pointerEvents: "none",
  }
}
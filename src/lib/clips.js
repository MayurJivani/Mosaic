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

/** @param {string|{x:number,y:number,w:number,h:number}|null|undefined} clip */
export function resolveClip(clip) {
  if (clip == null || clip === "full") return { x: 0, y: 0, w: 1, h: 1 }
  if (typeof clip === "object" && Number.isFinite(clip.w) && Number.isFinite(clip.h))
    return { x: clip.x ?? 0, y: clip.y ?? 0, w: clip.w, h: clip.h }
  const preset = CLIP_PRESETS[clip]
  if (preset) return { x: preset.x, y: preset.y, w: preset.w, h: preset.h }
  return { x: 0, y: 0, w: 1, h: 1 }
}

export function getClipVideoStyle(clip) {
  const c = resolveClip(clip)
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

const PRESET_EPS = 0.004

/** @returns {keyof typeof CLIP_PRESETS | null} */
export function presetKeyFromClip(clip) {
  const c = resolveClip(clip)
  for (const [key, p] of Object.entries(CLIP_PRESETS)) {
    if (
      Math.abs(c.x - p.x) < PRESET_EPS &&
      Math.abs(c.y - p.y) < PRESET_EPS &&
      Math.abs(c.w - p.w) < PRESET_EPS &&
      Math.abs(c.h - p.h) < PRESET_EPS
    )
      return /** @type {keyof typeof CLIP_PRESETS} */ (key)
  }
  return null
}

/** Preset grid order: primary edges, then corners. */
export const CLIP_PRESET_ORDER = [
  "full",
  "left",
  "right",
  "top",
  "bottom",
  "tl",
  "tr",
  "bl",
  "br",
]
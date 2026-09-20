/**
 * The single definition of how a widget's transform properties become CSS.
 *
 * The mod board is sold to mods as a preview of the stream, so any property one
 * side honours and the other ignores turns the board into a liar. Keeping two
 * copies in sync by hand already failed once — every control in the inspector
 * (rotation, opacity, blur, z-index, flip, visibility) worked on the board and
 * did nothing on stream. Both renderers now compute from here.
 */

/**
 * @param {object} w                widget
 * @param {object} [opts]
 * @param {boolean} [opts.editor]   board-side: hidden layers stay faintly visible
 *                                  so they remain findable and selectable
 */
export function widgetStyle(w, { editor = false } = {}) {
  const transforms = []
  if (w.rotation) transforms.push(`rotate(${w.rotation}deg)`)
  if (w.flipX) transforms.push("scaleX(-1)")
  if (w.flipY) transforms.push("scaleY(-1)")

  const hidden = w.visible === false

  return {
    position: "absolute",
    left: w.x,
    top: w.y,
    width: w.w,
    height: w.h,
    opacity: hidden && editor ? 0.25 : (w.opacity ?? 1),
    transform: transforms.length ? transforms.join(" ") : undefined,
    filter: w.blur ? `blur(${w.blur}px)` : undefined,
    zIndex: w.zIndex || undefined,
  }
}

/**
 * Whether a widget reaches the stream at all.
 *
 * The eye is a moderation control: hidden has to mean *gone*, not dimmed, or a
 * mod pulling something off screen would not actually pull it. Sound is the one
 * exception — it has no visual, so hiding it would only make the trigger
 * silently do nothing.
 */
export function isRenderedOnStream(w) {
  return !(w.visible === false && w.type !== "sound")
}

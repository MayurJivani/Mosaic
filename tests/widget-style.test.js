import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { widgetStyle, isRenderedOnStream } from "../src/lib/widgetStyle.js"

const w = (over = {}) => ({ id: "a", type: "image", x: 10, y: 20, w: 100, h: 50, ...over })

test("position and size pass straight through", () => {
  const s = widgetStyle(w())
  assert.equal(s.position, "absolute")
  assert.equal(s.left, 10)
  assert.equal(s.top, 20)
  assert.equal(s.width, 100)
  assert.equal(s.height, 50)
})

test("rotation, flips and blur become real CSS", () => {
  const s = widgetStyle(w({ rotation: 180, flipX: true, flipY: true, blur: 4 }))
  assert.match(s.transform, /rotate\(180deg\)/)
  assert.match(s.transform, /scaleX\(-1\)/)
  assert.match(s.transform, /scaleY\(-1\)/)
  assert.equal(s.filter, "blur(4px)")
})

test("untouched widgets carry no transform or filter at all", () => {
  const s = widgetStyle(w())
  assert.equal(s.transform, undefined, "an empty transform string would still create a stacking context")
  assert.equal(s.filter, undefined)
  assert.equal(s.zIndex, undefined)
  assert.equal(s.opacity, 1)
})

test("opacity and z-index are honoured", () => {
  const s = widgetStyle(w({ opacity: 0.4, zIndex: 100 }))
  assert.equal(s.opacity, 0.4)
  assert.equal(s.zIndex, 100)
})

// ── the bug this module exists to prevent ────────────────────────────────────

test("the board and the stream agree on every visible widget", () => {
  const sample = w({ rotation: 33, flipX: true, blur: 2, opacity: 0.6, zIndex: 7 })
  const board = widgetStyle(sample, { editor: true })
  const stream = widgetStyle(sample)
  assert.deepEqual(board, stream, "the board is sold as a preview; it must not render differently")
})

test("hiding a layer removes it from the stream, not just dims it", () => {
  const hidden = w({ visible: false })
  assert.equal(isRenderedOnStream(hidden), false,
    "the eye is a moderation control — hidden must mean gone on stream")
  // ...while the board keeps it faintly visible so it stays findable.
  assert.equal(widgetStyle(hidden, { editor: true }).opacity, 0.25)
})

test("hiding a sound does not silently break its trigger", () => {
  assert.equal(isRenderedOnStream(w({ type: "sound", visible: false })), true)
})

test("visible defaults to shown when the flag is absent or true", () => {
  assert.equal(isRenderedOnStream(w()), true)
  assert.equal(isRenderedOnStream(w({ visible: true })), true)
})

// ── guard against the renderers drifting apart again ─────────────────────────

test("neither renderer hand-rolls its own transform maths", () => {
  // The original bug was two copies of this logic, one of which was never
  // written. If a renderer starts building `rotate(...)` itself again, the two
  // can diverge without a single test failing — so forbid it outright.
  for (const file of ["src/components/OverlayCanvas.jsx", "src/components/WidgetBox.jsx"]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
    assert.ok(src.includes("widgetStyle"), `${file} must render through widgetStyle`)
    assert.ok(!/rotate\(\$\{/.test(src), `${file} rebuilds rotate() by hand — use widgetStyle`)
    assert.ok(!/scaleX\(-1\)/.test(src), `${file} rebuilds flips by hand — use widgetStyle`)
    assert.ok(!/blur\(\$\{/.test(src), `${file} rebuilds blur() by hand — use widgetStyle`)
  }
})

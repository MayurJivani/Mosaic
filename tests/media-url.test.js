import test from "node:test"
import assert from "node:assert/strict"

/**
 * Where the browser looks for the relay. This got it wrong once in the way that
 * only shows up in production: the relay serves the page there, so the page's
 * own origin *is* the relay — appending :4322 sent the socket to a port no edge
 * publishes, and the board loaded fine then reported the relay as unreachable.
 */

/** Pretend to be a page at this URL, then re-import the module fresh. */
async function at(url) {
  globalThis.window = { location: new URL(url) }
  // Cache-bust: the module reads window at call time, but a fresh copy keeps
  // these cases from depending on import order.
  return import(`../src/lib/mediaUrl.js?${encodeURIComponent(url)}`)
}

test("behind a proxy the relay is the page's own origin, port included", async () => {
  const { getFileServerOrigin, getWsUrl } = await at("https://mosaic.futile.studio/r_abc")
  assert.equal(getFileServerOrigin(), "https://mosaic.futile.studio")
  assert.equal(getWsUrl(), "wss://mosaic.futile.studio")
})

test("a non-standard production port is kept, not replaced", async () => {
  const { getWsUrl } = await at("http://192.168.1.50:8080/")
  assert.equal(getWsUrl(), "ws://192.168.1.50:8080")
})

test("served by the relay directly, the origin is left alone", async () => {
  const { getWsUrl } = await at("http://localhost:4322/")
  assert.equal(getWsUrl(), "ws://localhost:4322")
})

test("under astro dev the relay is the sibling process on its own port", async () => {
  // The dev server has the page; the relay is a separate process on 4322.
  const { getFileServerOrigin, getWsUrl } = await at("http://192.168.1.50:4321/")
  assert.equal(getFileServerOrigin(), "http://192.168.1.50:4322")
  assert.equal(getWsUrl(), "ws://192.168.1.50:4322")
})

test("uploaded files resolve against the relay, never a pinned localhost", async () => {
  // A phone on the LAN has to resolve /files/* against the host it can reach.
  const { resolvePlaybackUrl, stripToRelayPath } = await at("https://mosaic.futile.studio/")
  assert.equal(resolvePlaybackUrl("/files/clip.mp4"), "https://mosaic.futile.studio/files/clip.mp4")
  // What goes on the wire stays path-only so each client resolves it itself.
  assert.equal(stripToRelayPath("https://mosaic.futile.studio/files/clip.mp4"), "/files/clip.mp4")
})

test("blob URLs are left untouched — no other device can load them anyway", async () => {
  const { resolvePlaybackUrl, stripToRelayPath } = await at("https://mosaic.futile.studio/")
  assert.equal(resolvePlaybackUrl("blob:abc"), "blob:abc")
  assert.equal(stripToRelayPath("blob:abc"), "blob:abc")
})

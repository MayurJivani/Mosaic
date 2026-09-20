import test from "node:test"
import assert from "node:assert/strict"
import { search7TVEmotes, fetchBTTVGlobal, fetch7TVGlobal, fetchFFZGlobal, fetchStreamerEmotes } from "../src/lib/emotes.js"
import { resolvePlaybackUrl, stripToRelayPath } from "../src/lib/mediaUrl.js"

test("fetch7TVGlobal fetches live 7TV emotes directly from API", async () => {
  const list = await fetch7TVGlobal()
  assert.ok(Array.isArray(list))
  assert.ok(list.length > 0, "7TV API should return live emotes")
  assert.equal(list[0].provider, "7TV")
  assert.ok(list[0].url.startsWith("https://"))
})

test("search7TVEmotes performs live database search", async () => {
  const list = await search7TVEmotes("pepe", 10)
  assert.ok(Array.isArray(list))
  assert.ok(list.length > 0, "7TV search should return matching emotes")
  assert.equal(list[0].provider, "7TV")
})

test("fetchBTTVGlobal fetches live BTTV emotes directly from API", async () => {
  const list = await fetchBTTVGlobal()
  assert.ok(Array.isArray(list))
  assert.ok(list.length > 0, "BTTV API should return live emotes")
  assert.equal(list[0].provider, "BTTV")
  assert.ok(list[0].url.startsWith("https://"))
})

test("fetchFFZGlobal fetches live FrankerFaceZ emotes directly from API", async () => {
  const list = await fetchFFZGlobal()
  assert.ok(Array.isArray(list))
  assert.ok(list.length > 0, "FFZ API should return live emotes")
  assert.equal(list[0].provider, "FFZ")
  assert.ok(list[0].url.startsWith("https://"))
})

test("fetchStreamerEmotes looks up channel emotes directly across 7TV, BTTV, FFZ", async () => {
  const ludwigEmotes = await fetchStreamerEmotes("ludwig")
  assert.ok(Array.isArray(ludwigEmotes))
  assert.ok(ludwigEmotes.length > 0, "Ludwig channel emotes should be fetched directly")
})

test("mediaUrl utility resolves relay paths correctly", () => {
  assert.equal(resolvePlaybackUrl("/files/test.gif"), "http://localhost:4322/files/test.gif")
  assert.equal(stripToRelayPath("http://localhost:4322/files/test.gif"), "/files/test.gif")
})

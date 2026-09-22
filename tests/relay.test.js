import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import net from "node:net"
import path from "node:path"
import { WebSocket } from "ws"

// Claim an OS-assigned ephemeral port so a stale relay from a crashed run can
// never squat our port and make the protocol tests flap between passes.
let PORT, HTTP, WS
async function pickPort() {
  const srv = net.createServer()
  await new Promise((res, rej) => { srv.once("error", rej); srv.listen(0, "127.0.0.1", res) })
  PORT = srv.address().port
  HTTP = `http://127.0.0.1:${PORT}`
  WS = `ws://127.0.0.1:${PORT}`
  await new Promise((res) => srv.close(res))
}

let server
let uploadDir

before(async () => {
  await pickPort()
  uploadDir = mkdtempSync(path.join(tmpdir(), "mosaic-test-"))
  server = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      MOSAIC_PORT: String(PORT),
      MOSAIC_UPLOAD_DIR: uploadDir,
      // The whole suite joins from 127.0.0.1 inside one window; the limiter is
      // exercised deliberately in its own test against its own relay.
      MOSAIC_MAX_JOIN_RATE: "100000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  // Drain both pipes. An undrained stdio pipe fills its buffer and blocks the
  // relay mid-test; keep the tail so a crash can be reported, not guessed at.
  const log = []
  const keep = (d) => { log.push(d.toString()); if (log.length > 200) log.shift() }
  server.stdout.on("data", keep)
  server.stderr.on("data", keep)
  server.on("exit", (code) => {
    if (code) console.error(`[relay exited ${code}]\n${log.join("")}`)
  })

  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${HTTP}/net`)
      return
    } catch {
      await sleep(50)
    }
  }
  throw new Error("relay never came up")
})

after(() => {
  server?.kill("SIGKILL")
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true })
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const sockets = []

/** A test client that records everything it is sent. */
async function client() {
  const ws = new WebSocket(WS)
  const inbox = []
  ws.on("message", (d) => {
    try { inbox.push(JSON.parse(d.toString())) } catch { inbox.push({ type: "__unparsable" }) }
  })
  await new Promise((res, rej) => {
    ws.once("open", res)
    ws.once("error", rej)
  })
  sockets.push(ws)
  return {
    raw: ws,
    inbox,
    send: (m) => ws.send(JSON.stringify(m)),
    sendRaw: (s) => ws.send(s),
    clear: () => { inbox.length = 0 },
    close: () => ws.close(),
    async wait(type, timeout = 2000) {
      const deadline = Date.now() + timeout
      for (;;) {
        const at = inbox.findIndex((m) => m.type === type)
        if (at !== -1) return inbox.splice(at, 1)[0]
        if (Date.now() > deadline) throw new Error(`timed out waiting for "${type}"; got ${JSON.stringify(inbox.map((m) => m.type))}`)
        await sleep(10)
      }
    },
    async none(type, window = 250) {
      await sleep(window)
      assert.equal(inbox.find((m) => m.type === type), undefined, `did not expect a "${type}"`)
    },
  }
}

after(() => { for (const ws of sockets) try { ws.terminate() } catch { /* ignore */ } })

async function makeRoom(canvasW = 1920, canvasH = 1080) {
  const res = await fetch(`${HTTP}/room?canvasW=${canvasW}&canvasH=${canvasH}`, { method: "POST" })
  assert.equal(res.status, 200)
  return res.json()
}

// `wait` consumes the message it matches, so the join handshake has to be
// handed back rather than swallowed — several tests assert on it.
async function editorIn(roomId, token) {
  const e = await client()
  e.send({ type: "join", roomId, role: "editor", code: token })
  e.state = await e.wait("state")
  return e
}

async function overlayIn(roomId) {
  const o = await client()
  o.send({ type: "join", roomId, role: "overlay" })
  o.state = await o.wait("state")
  return o
}

const text = (id, over = {}) => ({
  id, type: "text", x: 10, y: 20, w: 300, h: 80,
  content: "hello", size: 48, color: "#ffffff", bold: true,
  rotation: 0, opacity: 1, zIndex: 0, blur: 0, flipX: false, flipY: false, locked: false, visible: true, name: "",
  ...over,
})

const sound = (id, url = "/files/sfx.mp3") => ({
  id, type: "sound", x: 0, y: 0, w: 100, h: 40, content: url, label: "airhorn",
  rotation: 0, opacity: 1, zIndex: 0, blur: 0, flipX: false, flipY: false, locked: false, visible: true, name: "",
})

// ── HTTP ─────────────────────────────────────────────────────────────────────

test("a room is created with a token and its canvas size sticks", async () => {
  const { roomId, token } = await makeRoom(1440, 2560)
  assert.ok(roomId)
  assert.ok(token && token.length >= 10)

  const o = await overlayIn(roomId)
  const state = o.state
  assert.equal(state.canvasW, 1440)
  assert.equal(state.canvasH, 2560)
})

test("upload stores a file and returns a path-only URL", async () => {
  const body = Buffer.from("fake video bytes")
  const res = await fetch(`${HTTP}/upload?name=my%20clip.mp4`, { method: "POST", body })
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.match(json.url, /^\/files\/\d+_[0-9a-f]{6}_my_clip\.mp4$/)
  assert.ok(json.url.startsWith("/"), "must be origin-relative so each client resolves its own host")
})

test("uploaded file streams back byte-identical", async () => {
  const body = Buffer.from("0123456789abcdef")
  const { url } = await (await fetch(`${HTTP}/upload?name=x.mp4`, { method: "POST", body })).json()
  const got = Buffer.from(await (await fetch(HTTP + url)).arrayBuffer())
  assert.deepEqual(got, body)
})

test("range requests work — playback in browsers needs them", async () => {
  const body = Buffer.from("0123456789abcdef")
  const { url } = await (await fetch(`${HTTP}/upload?name=r.mp4`, { method: "POST", body })).json()

  const res = await fetch(HTTP + url, { headers: { Range: "bytes=4-8" } })
  assert.equal(res.status, 206)
  assert.equal(res.headers.get("content-range"), `bytes 4-8/${body.length}`)
  assert.equal(res.headers.get("content-length"), "5")
  assert.equal(await res.text(), "456789".slice(0, 5))

  const openEnded = await fetch(HTTP + url, { headers: { Range: "bytes=10-" } })
  assert.equal(openEnded.status, 206)
  assert.equal(await openEnded.text(), "abcdef")

  const full = await fetch(HTTP + url)
  assert.equal(full.headers.get("accept-ranges"), "bytes")
})

test("an unsatisfiable range is refused, not silently clamped", async () => {
  const { url } = await (await fetch(`${HTTP}/upload?name=u.mp4`, { method: "POST", body: Buffer.from("abc") })).json()
  const res = await fetch(HTTP + url, { headers: { Range: "bytes=99-200" } })
  assert.equal(res.status, 416)
})

test("CORS is open — the page and the relay are different origins", async () => {
  const pre = await fetch(`${HTTP}/upload`, { method: "OPTIONS" })
  assert.equal(pre.status, 204)
  assert.equal(pre.headers.get("access-control-allow-origin"), "*")
  const netRes = await fetch(`${HTTP}/net`)
  assert.equal(netRes.headers.get("access-control-allow-origin"), "*")
})

test("/net reports LAN addresses", async () => {
  const json = await (await fetch(`${HTTP}/net`)).json()
  assert.ok(Array.isArray(json.ips))
  assert.equal(json.port, PORT)
  for (const ip of json.ips) assert.match(ip, /^\d+\.\d+\.\d+\.\d+$/)
})

test("unknown routes 404", async () => {
  assert.equal((await fetch(`${HTTP}/bogus-route-xyz`)).status, 404)
  assert.equal((await fetch(`${HTTP}/files/nope.mp4`)).status, 404)
})

test("upload names cannot escape the upload directory", async () => {
  for (const name of ["../escaped.mp4", "..%2f..%2fescaped.mp4", "/etc/passwd", "..", "."]) {
    const res = await fetch(`${HTTP}/upload?name=${encodeURIComponent(name)}`, {
      method: "POST",
      body: Buffer.from("x"),
    })
    if (res.status === 200) {
      const { url } = await res.json()
      const stored = decodeURIComponent(url.replace("/files/", ""))
      assert.equal(path.dirname(path.resolve(uploadDir, stored)), uploadDir, `"${name}" escaped`)
    }
  }
  assert.ok(!existsSync(path.join(uploadDir, "..", "escaped.mp4")))
  for (const f of readdirSync(uploadDir)) assert.ok(!f.includes("/"), `stored a path, not a name: ${f}`)
})

/**
 * fetch() normalises "/files/.." to "/" before it leaves the process, so a
 * traversal test written with fetch never reaches the server at all. Speak raw
 * HTTP to put the hostile path genuinely on the wire.
 */
function rawGet(target) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, "127.0.0.1", () => {
      sock.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`)
    })
    let buf = ""
    sock.setTimeout(3000, () => { sock.destroy(); reject(new Error(`timeout on ${target}`)) })
    sock.on("data", (d) => { buf += d.toString() })
    sock.on("end", () => resolve(buf))
    sock.on("error", reject)
  })
}

test("file reads cannot escape the upload directory", async () => {
  const hostile = [
    "/files/../../etc/passwd",
    "/files/..%2F..%2Fetc%2Fpasswd",
    "/files/....//....//etc/passwd",
    "/files/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "/files/..",
    "/files/.",
    "/files/",
  ]
  for (const target of hostile) {
    const res = await rawGet(target)
    const status = Number(res.split(" ")[1])
    assert.ok(status === 404 || status === 400, `${target} returned ${status}`)
    assert.ok(!/root:x:/.test(res), `${target} leaked /etc/passwd`)
  }
})

test("a directory is never served as if it were a file", async () => {
  const res = await rawGet("/files/..")
  assert.match(res, /^HTTP\/1\.1 404/)
})

// ── room protocol ────────────────────────────────────────────────────────────

test("an editor needs the room code; a wrong code is shown the door", async () => {
  const { roomId, token } = await makeRoom()
  const bad = await client()
  bad.send({ type: "join", roomId, role: "editor", code: "nope" })
  await bad.wait("error")
  await sleep(100)
  assert.equal(bad.raw.readyState, WebSocket.CLOSED, "editor with a bad code must be dropped")

  const good = await editorIn(roomId, token)
  assert.equal(good.raw.readyState, WebSocket.OPEN)
})

test("an overlay joins open and is told the room state", async () => {
  const { roomId, token } = await makeRoom(1280, 720)
  const e = await editorIn(roomId, token)
  e.send({ type: "widget-put", widget: text("t1") })

  const o = await overlayIn(roomId)
  const state = o.state
  assert.equal(state.canvasW, 1280)
  assert.equal(state.canvasH, 720)
  assert.deepEqual(state.widgets.map((w) => w.id), ["t1"])
})

test("a widget put by an editor reaches the overlay and every editor", async () => {
  const { roomId, token } = await makeRoom()
  const e1 = await editorIn(roomId, token)
  const e2 = await editorIn(roomId, token)
  const o = await overlayIn(roomId)
  e1.clear(); e2.clear(); o.clear()

  const w = text("t1")
  e1.send({ type: "widget-put", widget: w })
  assert.deepEqual((await o.wait("widget-put")).widget, w)
  assert.deepEqual((await e2.wait("widget-put")).widget, w)
})

test("shadowing a widget id replaces it everywhere", async () => {
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  const o = await overlayIn(roomId)
  o.clear()

  e.send({ type: "widget-put", widget: text("t1", { content: "first" }) })
  e.send({ type: "widget-put", widget: text("t1", { content: "second" }) })
  assert.deepEqual((await o.wait("widget-put")).widget.content, "first")
  assert.deepEqual((await o.wait("widget-put")).widget.content, "second")
})

test("widget-del removes the widget from the room and broadcasts it", async () => {
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  const o = await overlayIn(roomId)
  e.send({ type: "widget-put", widget: text("gone") })
  await o.wait("widget-put")
  o.clear()

  e.send({ type: "widget-del", id: "gone" })
  assert.equal((await o.wait("widget-del")).id, "gone")

  const late = await overlayIn(roomId)
  const state = late.state
  assert.deepEqual(state.widgets, [], "a deleted widget survived in room state")
})

test("widgets persist across joins and an editor reconnecting picks them back up", async () => {
  const { roomId, token } = await makeRoom()
  const e1 = await editorIn(roomId, token)
  e1.send({ type: "widget-put", widget: text("keeper") })
  e1.send({ type: "widget-put", widget: sound("sfx") })
  await sleep(150)
  e1.close()
  await sleep(150)

  const e2 = await editorIn(roomId, token)
  const state = e2.state
  assert.deepEqual(state.widgets.map((w) => w.id), ["keeper", "sfx"])
})

test("play-sound reaches overlays only, and only for real sound widgets", async () => {
  const { roomId, token } = await makeRoom()
  const e1 = await editorIn(roomId, token)
  const e2 = await editorIn(roomId, token)
  const o = await overlayIn(roomId)
  e1.send({ type: "widget-put", widget: sound("sfx") })
  e1.send({ type: "widget-put", widget: text("txt") })
  await o.wait("widget-put")
  await sleep(50)
  o.clear()

  e1.send({ type: "play-sound", id: "sfx" })
  assert.equal((await o.wait("play-sound")).id, "sfx")
  await e2.none("play-sound", 150)

  o.clear(); e2.clear()
  e1.send({ type: "play-sound", id: "txt" })   // text is not a sound
  await o.none("play-sound", 150)
  await e2.none("play-sound", 150)
})

test("an overlay cannot mutate the room", async () => {
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  const o = await overlayIn(roomId)
  e.clear(); o.clear()

  o.send({ type: "widget-put", widget: text("rogue") })
  o.send({ type: "widget-del", id: "rogue" })
  await e.none("widget-put", 150)
  await e.none("widget-del", 150)

  const late = await overlayIn(roomId)
  const state = late.state
  assert.deepEqual(state.widgets, [], "an overlay smuggled a widget into the room")
})

test("garbage widget payloads are coerced, not broadcast raw", async () => {
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  const o = await overlayIn(roomId)
  o.clear()

  e.send({ type: "widget-put", widget: null })
  e.send({ type: "widget-put", widget: "hi" })
  e.send({ type: "widget-put", widget: { id: "no-type" } })
  e.send({ type: "widget-put", widget: { type: "text" } }) // no id
  e.send({ type: "widget-put", widget: text("ok", { size: 99999, x: "NaN", w: "big" }) })
  await sleep(150)

  const late = await overlayIn(roomId)
  const state = late.state
  assert.deepEqual(state.widgets.map((w) => w.id), ["ok"])
  const w = state.widgets[0]
  assert.equal(w.size, 400, "size clamped")
  assert.equal(w.x, 0, "NaN positional field falls back to its default")
  assert.equal(w.w, 240, "non-numeric size falls back to its default")
})

test("rooms are sealed off from each other", async () => {
  const { roomId: r1, token: t1 } = await makeRoom()
  const { roomId: r2, token: t2 } = await makeRoom()
  const e1 = await editorIn(r1, t1)
  await editorIn(r2, t2)
  const o1 = await overlayIn(r1)
  const o2 = await overlayIn(r2)
  o1.clear(); o2.clear()

  e1.send({ type: "widget-put", widget: text("only-in-one") })
  await o1.wait("widget-put")
  await o2.none("widget-put")
})

// ── robustness ───────────────────────────────────────────────────────────────

test("garbage on the socket does not take the connection down", async () => {
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  const o = await overlayIn(roomId)
  o.clear()

  e.sendRaw("this is not json")
  e.sendRaw("{ unclosed")
  e.sendRaw("null")
  e.send({ type: "no-such-message", roomId })
  e.send({ type: "join" })                       // join with no room
  e.send({ type: "play-sound", id: "missing" })
  await sleep(200)

  e.send({ type: "widget-put", widget: text("still-alive") })
  assert.equal((await o.wait("widget-put")).widget.id, "still-alive", "socket stopped working after bad input")
})

test("messages sent before joining are ignored", async () => {
  const stray = await client()
  stray.send({ type: "widget-put", widget: text("premature") })
  stray.send({ type: "play-sound", id: "x" })
  await sleep(150)
  assert.equal(stray.raw.readyState, WebSocket.OPEN)
})

test("ping is answered so idle tabs are not culled", async () => {
  const v = await client()
  v.send({ type: "ping" })
  await v.wait("pong")
})

test("a bad room code leaves the room usable for everyone else", async () => {
  const { roomId, token } = await makeRoom()
  const bad = await client()
  bad.send({ type: "join", roomId, role: "editor", code: "wrong" })
  await bad.wait("error")
  await sleep(100)

  const e = await editorIn(roomId, token)
  assert.equal(e.raw.readyState, WebSocket.OPEN)
})
test("two mods uploading the same filename do not clobber each other", async () => {
  // Mods drop files called "clip.mp4" and "image.png" constantly. If the second
  // overwrote the first, every widget already pointing at it would silently
  // change content mid-stream.
  const a = await (await fetch(`${HTTP}/upload?name=clip.mp4`, { method: "POST", body: Buffer.from("AAAA") })).json()
  const b = await (await fetch(`${HTTP}/upload?name=clip.mp4`, { method: "POST", body: Buffer.from("BBBB") })).json()
  assert.notEqual(a.url, b.url)
  assert.equal(await (await fetch(HTTP + a.url)).text(), "AAAA")
  assert.equal(await (await fetch(HTTP + b.url)).text(), "BBBB")
})

test("an upload survives the response completing", async () => {
  // Regression: cleanup was wired to res "close", which also fires on success,
  // so every finished upload was deleted a tick after it was stored.
  const { url } = await (await fetch(`${HTTP}/upload?name=keep.png`, { method: "POST", body: Buffer.from("keepme") })).json()
  await sleep(250)
  const res = await fetch(HTTP + url)
  assert.equal(res.status, 200)
  assert.equal(await res.text(), "keepme")
})

test("join attempts are rate limited per IP", async () => {
  // Brute-forcing a room code should get nowhere. Own relay, own tiny budget.
  const srv = net.createServer()
  await new Promise((res) => srv.listen(0, "127.0.0.1", res))
  const port = srv.address().port
  await new Promise((res) => srv.close(res))

  const dir = mkdtempSync(path.join(tmpdir(), "mosaic-rl-"))
  const relay = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, MOSAIC_PORT: String(port), MOSAIC_UPLOAD_DIR: dir, MOSAIC_MAX_JOIN_RATE: "3" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  relay.stdout.on("data", () => {})
  relay.stderr.on("data", () => {})

  try {
    const base = `http://127.0.0.1:${port}`
    for (let i = 0; i < 100; i++) {
      try { await fetch(`${base}/net`); break } catch { await sleep(50) }
    }
    const { roomId } = await (await fetch(`${base}/room`, { method: "POST" })).json()

    const results = []
    for (let i = 0; i < 5; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      const inbox = []
      ws.on("message", (d) => inbox.push(JSON.parse(d.toString())))
      await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej) })
      ws.send(JSON.stringify({ type: "join", roomId, role: "overlay" }))
      await sleep(120)
      results.push(inbox.find((m) => m.type === "state") ? "state" : inbox.find((m) => m.type === "error")?.message ?? "nothing")
      ws.terminate()
    }
    assert.deepEqual(results.slice(0, 3), ["state", "state", "state"], "first joins inside the budget must work")
    assert.ok(results.slice(3).every((r) => r === "slow down"), `over-budget joins must be refused, got ${JSON.stringify(results)}`)
  } finally {
    relay.kill("SIGKILL")
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── clip library ─────────────────────────────────────────────────────────────

const asset = (id, over = {}) => ({ id, kind: "video", url: "/files/clip.mp4", name: "airhorn", ts: 1, ...over })

test("a library entry reaches every mod and survives a rejoin", async () => {
  const { roomId, token } = await makeRoom()
  const a = await editorIn(roomId, token)
  const b = await editorIn(roomId, token)
  b.clear()

  a.send({ type: "asset-put", asset: asset("clip1") })
  const got = await b.wait("asset-put")
  assert.equal(got.asset.id, "clip1")
  assert.equal(got.asset.url, "/files/clip.mp4")

  // A mod joining later must see the whole library, not an empty one.
  const late = await editorIn(roomId, token)
  assert.deepEqual(late.state.assets.map((x) => x.id), ["clip1"])
})

test("the library never leaks to the overlay", async () => {
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  const o = await overlayIn(roomId)
  o.clear()
  e.send({ type: "asset-put", asset: asset("clip2") })
  await o.none("asset-put")
})

test("an overlay cannot write to the library", async () => {
  const { roomId, token } = await makeRoom()
  const o = await overlayIn(roomId)
  o.send({ type: "asset-put", asset: asset("evil") })
  await sleep(150)
  const e = await editorIn(roomId, token)
  assert.deepEqual(e.state.assets, [])
})

test("library entries must point at the relay, not anywhere on the internet", async () => {
  // Otherwise one mod could aim every other mod's board at arbitrary remote
  // content just by naming it in the library.
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  for (const bad of [
    asset("x1", { url: "https://evil.example/pwn.mp4" }),
    asset("x2", { url: "javascript:alert(1)" }),
    asset("x3", { url: "//evil.example/x.mp4" }),
    asset("x4", { kind: "script" }),
    asset("", {}),
  ]) {
    e.send({ type: "asset-put", asset: bad })
  }
  await sleep(200)
  const check = await editorIn(roomId, token)
  assert.deepEqual(check.state.assets, [], "a hostile library entry was accepted")
})

test("removing a library entry leaves the overlay alone", async () => {
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  e.send({ type: "asset-put", asset: asset("keep") })
  e.send({ type: "widget-put", widget: { id: "w1", type: "video", x: 0, y: 0, w: 10, h: 10, content: "/files/clip.mp4" } })
  await sleep(200)

  e.clear()
  e.send({ type: "asset-del", id: "keep" })
  const del = await e.wait("asset-del")
  assert.equal(del.id, "keep")

  const late = await editorIn(roomId, token)
  assert.deepEqual(late.state.assets, [])
  assert.deepEqual(late.state.widgets.map((w) => w.id), ["w1"], "deleting from the library must not pull it off stream")
})

// ── live stream preview ──────────────────────────────────────────────────────

test("a connected stream reaches every mod and survives a rejoin", async () => {
  const { roomId, token } = await makeRoom()
  const a = await editorIn(roomId, token)
  const b = await editorIn(roomId, token)
  b.clear()

  a.send({ type: "stream-set", stream: { platform: "twitch", channel: "ludwig" } })
  const got = await b.wait("stream-set")
  assert.deepEqual(got.stream, { platform: "twitch", channel: "ludwig" })

  const late = await editorIn(roomId, token)
  assert.deepEqual(late.state.stream, { platform: "twitch", channel: "ludwig" })
})

test("the stream never reaches the OBS overlay", async () => {
  // The overlay is composited over the real stream inside OBS. Sending the
  // stream there too would show the broadcast inside its own broadcast.
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  const o = await overlayIn(roomId)
  o.clear()
  e.send({ type: "stream-set", stream: { platform: "twitch", channel: "ludwig" } })
  await o.none("stream-set")
  assert.equal(o.state.stream, undefined, "overlay state must not carry the stream")
})

test("an overlay cannot change which stream the mods watch", async () => {
  const { roomId, token } = await makeRoom()
  const o = await overlayIn(roomId)
  o.send({ type: "stream-set", stream: { platform: "twitch", channel: "hijacked" } })
  await sleep(150)
  const e = await editorIn(roomId, token)
  assert.deepEqual(e.state.stream, { platform: null, channel: "" })
})

test("a hostile channel name cannot be smuggled into the player URL", async () => {
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  for (const bad of [
    { platform: "twitch", channel: "a&parent=evil.example" },
    { platform: "twitch", channel: "../../x" },
    { platform: "twitch", channel: "a b" },
    { platform: "twitch", channel: "<script>" },
    { platform: "evil", channel: "ludwig" },
  ]) {
    e.send({ type: "stream-set", stream: bad })
  }
  await sleep(200)
  const check = await editorIn(roomId, token)
  assert.deepEqual(check.state.stream, { platform: null, channel: "" },
    "a channel name that could rewrite the embed URL was accepted")
})

test("disconnecting the stream is allowed and clears it", async () => {
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  e.send({ type: "stream-set", stream: { platform: "twitch", channel: "ludwig" } })
  await sleep(120)
  e.send({ type: "stream-set", stream: { platform: null, channel: "" } })
  await sleep(120)
  const check = await editorIn(roomId, token)
  assert.deepEqual(check.state.stream, { platform: null, channel: "" })
})

test("the overlay is never handed the clip library", async () => {
  // OBS opens the overlay with only a room id, so it is the least trusted peer
  // in the room. The library is a list of every file the mods have uploaded.
  const { roomId, token } = await makeRoom()
  const e = await editorIn(roomId, token)
  e.send({ type: "asset-put", asset: asset("secret") })
  await sleep(150)
  const o = await overlayIn(roomId)
  assert.equal(o.state.assets, undefined, "overlay state must not carry the library")
})

// ── client IP behind a tunnel / reverse proxy ────────────────────────────────

/** Spawn a second relay with its own env, on its own port. */
async function spawnRelay(env = {}) {
  const srv = net.createServer()
  await new Promise((res) => srv.listen(0, "127.0.0.1", res))
  const port = srv.address().port
  await new Promise((res) => srv.close(res))
  const dir = mkdtempSync(path.join(tmpdir(), "mosaic-ip-"))
  const proc = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, MOSAIC_PORT: String(port), MOSAIC_UPLOAD_DIR: dir, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  })
  proc.stdout.on("data", () => {})
  proc.stderr.on("data", () => {})
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/net`); break } catch { await sleep(50) }
  }
  return { port, base, dir, kill: () => { proc.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }) } }
}

/** Join once as an overlay, carrying the given headers. Returns what came back. */
function joinWithHeaders(port, roomId, headers) {
  return new Promise(async (resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers })
    const inbox = []
    ws.on("message", (d) => inbox.push(JSON.parse(d.toString())))
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", roomId, role: "overlay" })))
    ws.on("error", () => {})
    setTimeout(() => {
      ws.terminate()
      resolve(inbox.find((m) => m.type === "state") ? "state" : inbox.find((m) => m.type === "error")?.message ?? "nothing")
    }, 200)
  })
}

test("a forwarded IP is ignored unless the proxy is explicitly trusted", async () => {
  // Otherwise anyone reaching the relay directly claims a fresh IP per request
  // and walks straight through the join limit.
  const relay = await spawnRelay({ MOSAIC_MAX_JOIN_RATE: "3" })
  try {
    const { roomId } = await (await fetch(`${relay.base}/room`, { method: "POST" })).json()
    const results = []
    for (let i = 0; i < 5; i++) {
      results.push(await joinWithHeaders(relay.port, roomId, { "CF-Connecting-IP": `9.9.9.${i}` }))
    }
    assert.deepEqual(results.slice(0, 3), ["state", "state", "state"])
    assert.ok(results.slice(3).every((r) => r === "slow down"),
      `spoofed headers bypassed the limit: ${JSON.stringify(results)}`)
  } finally {
    relay.kill()
  }
})

test("behind a trusted tunnel each viewer gets its own rate-limit budget", async () => {
  // Every connection arrives from the tunnel, so without this one mod joining
  // repeatedly would lock out every other mod and the overlay too.
  const relay = await spawnRelay({ MOSAIC_MAX_JOIN_RATE: "3", MOSAIC_TRUST_PROXY: "1" })
  try {
    const { roomId } = await (await fetch(`${relay.base}/room`, { method: "POST" })).json()

    // One client burns its own budget...
    const heavy = []
    for (let i = 0; i < 5; i++) {
      heavy.push(await joinWithHeaders(relay.port, roomId, { "CF-Connecting-IP": "203.0.113.7" }))
    }
    assert.ok(heavy.slice(3).every((r) => r === "slow down"), "the noisy client should be throttled")

    // ...without taking anyone else down with it.
    const other = await joinWithHeaders(relay.port, roomId, { "CF-Connecting-IP": "203.0.113.8" })
    assert.equal(other, "state", "a different viewer must not inherit someone else's throttle")
  } finally {
    relay.kill()
  }
})

test("X-Forwarded-For is honoured when trusted, first hop only", async () => {
  const relay = await spawnRelay({ MOSAIC_MAX_JOIN_RATE: "2", MOSAIC_TRUST_PROXY: "1" })
  try {
    const { roomId } = await (await fetch(`${relay.base}/room`, { method: "POST" })).json()
    const hdr = { "X-Forwarded-For": "198.51.100.5, 10.0.0.1" }
    assert.equal(await joinWithHeaders(relay.port, roomId, hdr), "state")
    assert.equal(await joinWithHeaders(relay.port, roomId, hdr), "state")
    assert.equal(await joinWithHeaders(relay.port, roomId, hdr), "slow down")
    // A different first hop is a different client.
    assert.equal(await joinWithHeaders(relay.port, roomId, { "X-Forwarded-For": "198.51.100.6" }), "state")
  } finally {
    relay.kill()
  }
})

// ── static files out of dist/ ────────────────────────────────────────────────

test("the favicon is served, and typed as an icon", async () => {
  // The static allowlist was /_astro/ only, so every root asset 404'd in
  // production no matter what the page linked. And an .ico missing from the
  // MIME map arrives as application/octet-stream, which some browsers decline
  // to draw rather than sniff.
  const r = await fetch(`${HTTP}/favicon.ico`)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get("content-type"), "image/x-icon")
  assert.ok(Number(r.headers.get("content-length")) > 0, "favicon must not be empty")

  const svg = await fetch(`${HTTP}/favicon.svg`)
  assert.equal(svg.status, 200)
  assert.equal(svg.headers.get("content-type"), "image/svg+xml")
})

test("only content-addressed assets are cached forever", async () => {
  // favicon.ico keeps its name across deploys, so caching it immutably for a
  // year means a replacement icon reaches nobody, ever.
  const icon = await fetch(`${HTTP}/favicon.ico`)
  assert.ok(!/immutable/.test(icon.headers.get("cache-control") ?? ""),
    `stable-named asset must not be immutable: ${icon.headers.get("cache-control")}`)

  // The hashed bundles are safe to pin, and must stay pinned.
  const html = await (await fetch(`${HTTP}/`)).text()
  const hashed = html.match(/\/_astro\/[^"']+/)?.[0]
  assert.ok(hashed, "index.html should reference a hashed asset")
  const asset = await fetch(`${HTTP}${hashed}`)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get("cache-control") ?? "", /immutable/)

  // HTML names the hashed assets, so it can never be the stale one.
  assert.equal((await fetch(`${HTTP}/`)).headers.get("cache-control"), "no-cache")
})

test("serving statics by path does not expose the repo", async () => {
  // Widening past /_astro/ must not turn the relay into a file server for the
  // checkout: dist/ is build output, everything above it is not.
  for (const target of ["/package.json", "/server/index.js", "/.env", "/Dockerfile"]) {
    const r = await fetch(`${HTTP}${target}`)
    assert.equal(r.status, 404, `${target} must not be served`)
  }
  for (const target of ["/../package.json", "/..%2Fpackage.json", "/%2e%2e/%2e%2e/etc/passwd"]) {
    const raw = await rawGet(target)
    assert.match(raw.split("\r\n")[0], /40[0-9]/, `${target} must not be served: ${raw.split("\r\n")[0]}`)
  }
})

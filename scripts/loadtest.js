/**
 * Load test: many rooms, each with an overlay and a crew of mods dragging
 * widgets, against a real relay process.
 *
 *   node scripts/loadtest.js [rooms=100] [modsPerRoom=9] [seconds=20]
 *
 * Starts its own relay on a spare port with a raised join limit (every client
 * comes from this one machine). Each room gets one overlay and its mods; every
 * mod drags a widget at 10 updates a second, the way a drag streams
 * widget-puts, and chats now and then. Every client times each update it
 * receives against the send time stamped into the widget. Reports join time,
 * update fan-out, the relay's CPU and RSS, and fails if an overlay missed
 * updates or a socket dropped.
 */
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { WebSocket } from "ws"

const ROOMS = Number(process.argv[2] ?? 100)
const MODS = Number(process.argv[3] ?? 9)
const SECONDS = Number(process.argv[4] ?? 20)
const PORT = 4600 + Math.floor(Math.random() * 300)
const HTTP = `http://127.0.0.1:${PORT}`
const root = path.join(import.meta.dirname, "..")

const server = spawn(process.execPath, [path.join(root, "server", "index.js")], {
  env: { ...process.env, NODE_ENV: "production", MOSAIC_PORT: String(PORT), MOSAIC_MAX_JOIN_RATE: "100000", MOSAIC_UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), "mosaic-load-")) },
  stdio: ["ignore", "ignore", "inherit"],
})
process.on("exit", () => server.kill())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; !(await fetch(`${HTTP}/net`).then((r) => r.ok, () => false)); i++) {
  if (i > 100) throw new Error("relay did not come up")
  await sleep(100)
}

// Relay CPU (ms) and RSS (MB) from /proc, so the clients in this process do not count.
const usage = () => {
  const stat = readFileSync(`/proc/${server.pid}/stat`, "utf8").split(") ")[1].split(" ")
  const rss = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${server.pid}/status`, "utf8"))[1]) / 1024
  return { cpu: (Number(stat[11]) + Number(stat[12])) * 10, rss }
}
let peakRss = 0
const sampler = setInterval(() => (peakRss = Math.max(peakRss, usage().rss)), 250)
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? NaN
const fmt = (xs) => `p50 ${pct(xs, 50).toFixed(0)}ms, p95 ${pct(xs, 95).toFixed(0)}ms, max ${xs.reduce((a, b) => Math.max(a, b), 0).toFixed(0)}ms`

const joinMs = []
const fanout = []
let drops = 0
let failed = 0

function join(roomId, role, code) {
  const s = performance.now()
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
  ws.puts = 0
  ws.on("message", (raw) => {
    const m = JSON.parse(raw)
    if (m.type === "widget-put") {
      ws.puts++
      fanout.push(Date.now() - Number(m.widget.content))
    }
  })
  ws.on("close", () => ws.done || drops++)
  return new Promise((res, rej) => {
    ws.once("open", () => ws.send(JSON.stringify({ type: "join", roomId, role, code, nickname: `mod${joinMs.length}` })))
    ws.once("message", (raw) => (JSON.parse(raw).type === "state" ? (joinMs.push(performance.now() - s), res(ws)) : rej(new Error(String(raw)))))
    ws.once("error", rej)
  })
}

const cpu0 = usage().cpu
const t0 = performance.now()
const rooms = await Promise.all(
  Array.from({ length: ROOMS }, async () => {
    const { roomId, token } = await fetch(`${HTTP}/room`, { method: "POST" }).then((r) => r.json())
    const overlay = await join(roomId, "overlay")
    const mods = await Promise.all(Array.from({ length: MODS }, () => join(roomId, "editor", token)))
    return { overlay, mods }
  }),
)
console.log(`${ROOMS} rooms, ${ROOMS * (MODS + 1)} sockets joined in ${((performance.now() - t0) / 1000).toFixed(1)}s; join ${fmt(joinMs)}`)

// Every mod drags its own widget at 10 Hz; the send time rides in `content`.
let sent = 0
const drags = rooms.flatMap(({ mods }) =>
  mods.map((ws, i) =>
    setInterval(() => {
      sent++
      ws.send(JSON.stringify({ type: "widget-put", widget: { id: `w${i}`, type: "text", content: String(Date.now()), x: Math.random() * 1800, y: Math.random() * 1000, w: 200, h: 80 } }))
      if (Math.random() < 0.01) ws.send(JSON.stringify({ type: "chat", text: "nice" }))
    }, 100),
  ),
)
await sleep(SECONDS * 1000)
drags.forEach(clearInterval)
await sleep(500)

const cpu = usage().cpu - cpu0
const wall = performance.now() - t0
clearInterval(sampler)
const perOverlay = sent / ROOMS
const short = rooms.filter(({ overlay }) => overlay.puts < perOverlay * 0.99).length
if (short) failed += short
console.log(`${sent} widget updates sent, ${fanout.length} delivered; fan-out ${fmt(fanout)}`)
console.log(`relay: ${(cpu / 1000).toFixed(1)}s CPU over ${(wall / 1000).toFixed(1)}s (${((cpu / wall) * 100).toFixed(0)}% of one core), peak RSS ${peakRss.toFixed(0)} MB`)
for (const { overlay, mods } of rooms) for (const ws of [overlay, ...mods]) (ws.done = true), ws.terminate()
if (drops) failed += drops
console.log(failed ? `FAIL: ${short} overlays missed updates, ${drops} sockets dropped` : "ok")
process.exit(failed ? 1 : 0)

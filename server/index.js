/**
 * Mosaic relay — one process, one origin. It both serves the stream UI and the
 * widget relay, so everything runs over a single-origin WebSocket:
 *
 *   HTTP  :  GET  /             built mod board (dist/index.html)
 *            GET  /overlay      built OBS overlay (dist/overlay/index.html)
 *            POST /room         create a stream room -> { roomId, token }
 *            POST /session      exchange a room code for a login cookie
 *            DELETE /session    sign out (drop the cookie + session)
 *            POST /upload       raw body -> uploads/, returns { url: "/files/<name>" }
 *            GET  /files/<name> range-capable serving (video, image, audio)
 *            GET  /net          LAN addresses
 *   WS    :  room-scoped widget sync between mod editors (mods) and overlays (OBS)
 *
 * Rooms own widget state. A mod (editor) mutates; the OBS overlay renders live.
 * The overlay is deliberately open — OBS must load it with zero fuss — but it is
 * strict read-only. Mods log in once with the room code and are remembered by an
 * httpOnly SameSite=Lax cookie; same-origin serving is what makes that cookie
 * work on plain-LAN http (cross-origin Set-Cookie is dead without https).
 *
 * OWASP 2026 bits, enforced here rather than hoped for:
 *   - opaque httpOnly session cookie, timing-safe code compare
 *   - per-IP join rate limit (brute-forcing a room code is pointless)
 *   - WS max payload, upload size cap, canvas/widget caps
 *   - security headers on every response (no CSP hacks in the pages)
 */
import { randomBytes, createHash, timingSafeEqual } from "node:crypto"
import { createServer } from "node:http"
import { createWriteStream, createReadStream, existsSync, mkdirSync, statSync, rmSync } from "node:fs"
import { networkInterfaces } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { WebSocketServer } from "ws"

const PORT = Number(process.env.MOSAIC_PORT ?? 4322)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DIST = path.join(ROOT, "dist")
const UPLOAD_DIR = path.resolve(process.env.MOSAIC_UPLOAD_DIR ?? path.join(ROOT, "uploads"))

// Safety knobs — sane defaults, tune per deployment. Uploads are streamed so a
// mod can push a big clip, but the ceiling must still exist.
const MAX_JOIN_RATE = Number(process.env.MOSAIC_MAX_JOIN_RATE ?? 20)        // joins per IP per window
const JOIN_WINDOW_MS = Number(process.env.MOSAIC_JOIN_WINDOW_MS ?? 10_000)
const MAX_WS_PAYLOAD = Number(process.env.MOSAIC_MAX_WS_PAYLOAD ?? 512 * 1024) // bytes
const MAX_UPLOAD_BYTES = Number(process.env.MOSAIC_MAX_UPLOAD_BYTES ?? 2 * 1024 * 1024 * 1024)
const MAX_WIDGETS_PER_ROOM = Number(process.env.MOSAIC_MAX_WIDGETS ?? 400)
const MAX_ASSETS_PER_ROOM = Number(process.env.MOSAIC_MAX_ASSETS ?? 500)
const SESSION_TTL_MS = Number(process.env.MOSAIC_SESSION_TTL_MS ?? 30 * 24 * 60 * 60 * 1000) // 30d sliding
const SESSION_REFRESH_MS = 12 * 60 * 60 * 1000 // sliding refresh on use after this idle gap

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })

const MIME = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".css": "text/css",
  ".js": "application/javascript",
  ".html": "text/html",
}

// Security headers on every response. CSP allows emote CDNs explicitly so
// BTTV / 7TV / FFZ / Twitch emotes render and their APIs are reachable.
const EMOTE_IMG_CDNS = "https://cdn.betterttv.net https://cdn.7tv.app https://cdn.frankerfacez.com https://static-cdn.jtvnw.net"
const EMOTE_API_ORIGINS = "https://api.betterttv.net https://7tv.io https://api.frankerfacez.com"
// The mod board frames the live stream under the overlay so mods can place
// things against what is actually on screen. The overlay itself never does.
const STREAM_FRAME_ORIGINS = "https://player.twitch.tv https://www.twitch.tv https://www.youtube.com https://www.youtube-nocookie.com"

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  // SAMEORIGIN, not DENY: the mod board previews the overlay in a same-origin
  // iframe, and DENY blocks that too. Cross-origin framing stays blocked, which
  // is what the clickjacking protection is actually for.
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-DNS-Prefetch-Control": "off",
  "Content-Security-Policy": [
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline'",
    // Google Fonts serves the stylesheet from one origin and the font files
    // from another; both are needed or the board and the overlay silently fall
    // back to system fonts — visible on stream, not just in the editor.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: ${EMOTE_IMG_CDNS}`,
    "media-src 'self' data: blob:",
    `connect-src 'self' ws: wss: ${EMOTE_API_ORIGINS}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `frame-src 'self' ${STREAM_FRAME_ORIGINS}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}
// CORS is ONLY for the cross-origin dev/overlay case (Astro on :4321 in dev,
// OBS source on its own origin). Sessions never cross origins in production.
const WITH_SECURITY = { ...CORS, ...SECURITY }

const WIDGET_TYPES = new Set(["text", "image", "video", "sound", "emoji"])

/** Strip anything that could climb out of uploads/ or confuse a URL. */
function safeName(raw) {
  const base = path.basename(raw || "file")
  return base.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "").slice(-120) || "file"
}

/**
 * Resolve a request into uploads/, or null. Belt and braces over safeName:
 * the check is on the resolved path, so it holds no matter what the sanitiser
 * lets through.
 */
function resolveUploadPath(raw) {
  const full = path.resolve(UPLOAD_DIR, safeName(raw))
  return path.dirname(full) === UPLOAD_DIR ? full : null
}

/** Constant-time code comparison via HMAC-length digests. */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

function lanAddresses() {
  const out = []
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address)
    }
  }
  return out
}

const STREAM_PLATFORMS = new Set(["twitch", "youtube"])

/**
 * Which live stream the mod board shows under the overlay. Channel names are
 * restricted to the character set the platforms actually use so this can never
 * become a way to inject a URL into every other mod's iframe.
 */
function sanitizeStream(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const platform = STREAM_PLATFORMS.has(raw.platform) ? raw.platform : null
  const channel = String(raw.channel ?? "").trim().slice(0, 64)
  if (!platform || !channel) return { platform: null, channel: "" } // clearing is valid
  if (!/^[A-Za-z0-9_\-]+$/.test(channel)) return null
  return { platform, channel }
}

const ASSET_KINDS = new Set(["image", "video", "sound"])

/**
 * A library entry: something a mod uploaded once and can drop on the overlay
 * again later without re-uploading. Only relay-relative paths are accepted —
 * a library that could hold arbitrary remote URLs would let one mod point every
 * other mod's board at anything.
 */
function sanitizeAsset(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const id = String(raw.id ?? "").slice(0, 64)
  const kind = ASSET_KINDS.has(raw.kind) ? raw.kind : null
  const url = String(raw.url ?? "")
  if (!id || !kind) return null
  if (!url.startsWith("/files/") || url.length > 512) return null
  return {
    id,
    kind,
    url,
    name: String(raw.name ?? "").slice(0, 120),
    ts: Number.isFinite(Number(raw.ts)) ? Number(raw.ts) : Date.now(),
  }
}

/** Coerce a widget into a safe canonical shape; null rejects the whole put. */
function sanitizeWidget(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const id = String(raw.id ?? "").slice(0, 64)
  const type = WIDGET_TYPES.has(raw.type) ? raw.type : null
  if (!id || !type) return null
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)

  const base = { id, type, content: String(raw.content ?? "").slice(0, 5000) }

  // Common transform properties for all widget types
  base.rotation = clamp(num(raw.rotation, 0), -360, 360)
  base.opacity = Math.max(0, Math.min(1, num(raw.opacity, 1)))
  base.zIndex = clamp(num(raw.zIndex, 0), -999, 9999)
  base.blur = Math.max(0, Math.min(50, num(raw.blur, 0)))
  base.flipX = !!raw.flipX
  base.flipY = !!raw.flipY
  base.locked = !!raw.locked
  base.visible = raw.visible !== false // default true
  base.name = String(raw.name ?? "").slice(0, 80)

  if (type === "text") {
    base.x = num(raw.x, 0)
    base.y = num(raw.y, 0)
    base.w = Math.max(8, num(raw.w, 240))
    base.h = Math.max(8, num(raw.h, 80))
    base.color = String(raw.color ?? "#ffffff").slice(0, 32)
    base.size = Math.max(6, Math.min(400, num(raw.size, 40)))
    base.bold = !!raw.bold
  } else if (type === "emoji") {
    base.x = num(raw.x, 0)
    base.y = num(raw.y, 0)
    base.w = Math.max(8, num(raw.w, 150))
    base.h = Math.max(8, num(raw.h, 150))
    base.size = Math.max(16, Math.min(600, num(raw.size, 110)))
  } else {
    base.x = num(raw.x, 0)
    base.y = num(raw.y, 0)
    base.w = Math.max(4, num(raw.w, 240))
    base.h = Math.max(4, num(raw.h, 160))
    base.label = String(raw.label ?? "").slice(0, 120)
  }
  return base
}

/** A carried numeric field clamped hard — OBS overlay sizing and QoL z moves. */
const clamp = (v, min, max) => Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : 0

// ── Rooms ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   token: string|null,
 *   editors: Set<import("ws").WebSocket>,
 *   overlays: Set<import("ws").WebSocket>,
 *   widgets: Map<string, object>,
 *   canvasW: number,
 *   canvasH: number,
 * }} Room
 */

/** @type {Map<string, Room>} */
const rooms = new Map()

function getRoom(id) {
  let r = rooms.get(id)
  if (!r) {
    r = {
      token: null,
      editors: new Set(),
      overlays: new Set(),
      widgets: new Map(),
      assets: new Map(),
      stream: { platform: null, channel: "" },
      canvasW: 1920,
      canvasH: 1080,
    }
    rooms.set(id, r)
  }
  return r
}

// ── Sessions (mods remember themselves; overlays are url-open by design) ──────

/**
 * @typedef {{
 *   roomId: string,
 *   expiresAt: number,
 *   lastSeen: number,
 * }} Session
 */

/** @type {Map<string, Session>} */
const sessions = new Map()

const COOKIE = "mosaic_sess"

function cookieFrom(req) {
  const raw = req?.headers?.cookie ?? ""
  for (const part of raw.split(";")) {
    const i = part.indexOf("=")
    if (i === -1) continue
    const name = part.slice(0, i).trim()
    const val = part.slice(i + 1).trim()
    if (name === COOKIE) return decodeURIComponent(val)
  }
  return null
}

/** The session cookie value for a room token, or null if invalid/expired. */
function sessionForRoom(req, roomId) {
  const sid = cookieFrom(req)
  if (!sid) return null
  const s = sessions.get(sid)
  if (!s || s.roomId !== roomId || s.expiresAt <= Date.now()) return null
  return s
}

/** `Set-Cookie` for a fresh session. Sliding expiry, refreshed on real use. */
function issueSession(res, roomId) {
  const sid = randomBytes(24).toString("base64url")
  sessions.set(sid, {
    roomId,
    expiresAt: Date.now() + SESSION_TTL_MS,
    lastSeen: Date.now(),
  })
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.round(SESSION_TTL_MS / 1000)}`)
  return sid
}

function clearSession(res, sid) {
  if (sid) sessions.delete(sid)
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
}

// ── Per-IP join rate limit ────────────────────────────────────────────────────

/** @type {Map<string, number[]>} */
const joinerHits = new Map()

function allowJoin(ip) {
  const now = Date.now()
  const hits = (joinerHits.get(ip) ?? []).filter((t) => now - t < JOIN_WINDOW_MS)
  if (hits.length >= MAX_JOIN_RATE) {
    joinerHits.set(ip, hits)
    return false
  }
  hits.push(now)
  joinerHits.set(ip, hits)
  return true
}

// ── Content negotiation ───────────────────────────────────────────────────────

function send(ws, payload, isOverlay) {
  if (ws.readyState !== ws.OPEN) return
  const msg = JSON.stringify(payload)
  if (msg.length > MAX_WS_PAYLOAD) {
    console.warn(`[ws] dropped oversized broadcast (${msg.length}B) to ${isOverlay ? "overlay" : "editor"}`)
    return
  }
  ws.send(msg)
}

function toEditors(room, payload) {
  for (const e of room.editors) send(e, payload, false)
}

function toOverlays(room, payload) {
  for (const o of room.overlays) send(o, payload, true)
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

const http = createServer((req, res) => {
  const host = req.headers.host ?? "localhost"
  const parsed = new URL(req.url ?? "/", `http://${host}`)
  const ip = req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "?"

  const applyBase = () => {
    for (const [k, v] of Object.entries(WITH_SECURITY)) res.setHeader(k, v)
  }

  res.on("error", () => {})

  // Options preflight is only interesting for cross-origin dev clients.
  if (req.method === "OPTIONS") {
    applyBase()
    res.writeHead(204)
    res.end()
    return
  }

  // ── same-origin static: the built board + overlay from dist/ ──────────────
  if (req.method === "GET" || req.method === "HEAD") {
    if (req.url.includes("..")) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found")
      return
    }
    let filePath = null
    if (parsed.pathname === "/" || parsed.pathname === "/index.html") {
      filePath = path.join(DIST, "index.html")
    } else if (parsed.pathname === "/overlay" || parsed.pathname === "/overlay/") {
      filePath = path.join(DIST, "overlay", "index.html")
    } else if (parsed.pathname.startsWith("/_astro/")) {
      filePath = path.join(DIST, parsed.pathname.replace(/^\/+/, ""))
    }
    if (filePath) return serveDist(req, res, filePath)
  }

  if (req.method === "POST" && parsed.pathname === "/room") {
    applyBase()
    const roomId = `r_${randomBytes(4).toString("hex")}`
    const token = randomBytes(6).toString("hex")
    const room = getRoom(roomId)
    room.token = token
    room.canvasW = clamp(Number(parsed.searchParams.get("canvasW") ?? 1920), 32, 8192) || 1920
    room.canvasH = clamp(Number(parsed.searchParams.get("canvasH") ?? 1080), 32, 8192) || 1080
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ roomId, token }))
    console.log(`[http] created room ${roomId}`)
    return
  }

  // ── sessions: mod remembers itself; sign-out kills the cookie ─────────────
  if (req.method === "POST" && parsed.pathname === "/session") {
    applyBase()
    let body = ""
    let tooBig = false
    req.on("data", (chunk) => {
      body += chunk
      if (body.length > 64 * 1024) tooBig = true
    })
    req.on("end", () => {
      if (tooBig) {
        res.writeHead(413, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "payload too large" }))
        return
      }
      let in_
      try { in_ = JSON.parse(body) } catch {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "bad json" }))
        return
      }
      const roomId = String(in_.roomId ?? "")
      const code = String(in_.code ?? "")
      const room = rooms.get(roomId)
      if (!room || !room.token || !safeEqual(code, room.token)) {
        res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "bad room code" }))
        return
      }
      issueSession(res, roomId)
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }))
      console.log(`[http] session issued for ${roomId}`)
    })
    return
  }

  if (req.method === "DELETE" && parsed.pathname === "/session") {
    applyBase()
    clearSession(res, cookieFrom(req))
    res.writeHead(204).end()
    return
  }

  if (req.method === "POST" && parsed.pathname === "/upload") {
    applyBase()
    handleUpload(req, res, parsed)
    return
  }

  if (req.method === "GET" && parsed.pathname === "/net") {
    applyBase()
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ips: lanAddresses(), port: PORT }))
    return
  }

  const uploadMatch = parsed.pathname.match(/^\/files\/(.+)$/)
  if ((req.method === "GET" || req.method === "HEAD") && uploadMatch) {
    applyBase()
    let raw
    try { raw = decodeURIComponent(uploadMatch[1]) } catch {
      res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "bad filename" }))
      return
    }
    const file = resolveUploadPath(raw)
    if (!file) {
      res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }))
      return
    }
    serveFile(req, res, file)
    return
  }

  applyBase()
  res.writeHead(404, { "Content-Type": "text/plain" }).end("not found")
})

/** Serve a single built static file with the MIME map + security headers + ranges. */
function serveDist(req, res, filePath) {
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(DIST)) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found")
    return
  }
  // The HTML documents are exactly what the CSP is for. Without this the policy
  // was only ever delivered on JSON endpoints, where it does nothing — the board
  // and the overlay ran with no CSP, no nosniff and no framing rules at all.
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v)
  serveFile(req, res, resolved)
}

function serveFile(req, res, filePath) {
  let stat
  try {
    stat = statSync(filePath)
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found")
    return
  }
  if (!stat.isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found")
    return
  }

  const type = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
  const range = req.headers.range

  /**
   * Hashed assets and uploaded files are content-unique by name, so they can be
   * cached forever. HTML cannot: it is the thing that names the hashed assets,
   * so caching it immutably pins every mod to the version they first loaded —
   * a deploy would reach nobody until the cache expired a year later.
   */
  const cacheControl = filePath.endsWith(".html")
    ? "no-cache"
    : "public, max-age=31536000, immutable"

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    let start = m?.[1] ? Number(m[1]) : 0
    let end = m?.[2] ? Number(m[2]) : stat.size - 1
    if (Number.isNaN(start) || start < 0) start = 0
    if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end()
      return
    }
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
    })
    createReadStream(filePath, { start, end }).pipe(res)
    return
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
  })
  createReadStream(filePath).pipe(res)
}

function handleUpload(req, res, parsed) {
  const len = Number(req.headers["content-length"])
  if (Number.isFinite(len) && len > MAX_UPLOAD_BYTES) {
    res.writeHead(413, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "too large" }))
    return
  }
  // Unique prefix: two mods dropping "clip.mp4" must not overwrite each other
  // and silently repoint every widget already using the first one.
  const name = `${Date.now()}_${randomBytes(3).toString("hex")}_${safeName(parsed.searchParams.get("name"))}`
  const dest = resolveUploadPath(name)
  if (!dest) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "bad filename" }))
    return
  }
  let written = 0
  const out = createWriteStream(dest)
  const fail = () => {
    out.destroy()
    try { rmSync(dest, { force: true }) } catch {}
  }
  // `close` fires on a *successful* response too — cleaning up unconditionally
  // deleted every file the moment it finished uploading.
  res.on("close", () => { if (!res.writableFinished) fail() })
  req.on("aborted", fail)
  req.on("error", fail)
  req.on("data", (chunk) => {
    written += chunk.length
    if (written > MAX_UPLOAD_BYTES) {
      res.destroy()
      return
    }
  })
  req.pipe(out)
  out.on("finish", () => {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ url: `/files/${encodeURIComponent(name)}` }))
    console.log(`[http] stored ${name}`)
  })
  out.on("error", () => {
    try { res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "write failed" })) } catch {}
    fail()
  })
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({
  server: http,
  maxPayload: MAX_WS_PAYLOAD,
  perMessageDeflate: false,
})

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "?"
  ws.isAlive = true
  ws.on("pong", () => { ws.isAlive = true })

  /** @type {{ roomId: string|null, editor: boolean, overlay: boolean, nickname: string }} */
  const meta = { roomId: null, editor: false, overlay: false, nickname: "mod" }

  ws.on("message", (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return

    if (msg.type === "ping") {
      send(ws, { type: "pong" }, meta.overlay)
      return
    }

    if (msg.type === "join") {
      if (!msg.roomId) return
      const roomId = String(msg.roomId)
      const room = rooms.get(roomId)
      if (!room) {
        send(ws, { type: "error", message: "no such room" }, false)
        ws.close()
        return
      }

      // Joining the relay is cheap, but hammering it to brute-force a room code
      // must not be. Editor AND overlay joins both count against the same bucket
      // so a rotation of tabs can't leak the room id either.
      if (!allowJoin(ip)) {
        send(ws, { type: "error", message: "slow down" }, false)
        ws.close()
        return
      }

      if (msg.nickname) meta.nickname = String(msg.nickname).slice(0, 32) || "mod"

      if (msg.role === "editor") {
        // Two acceptable proofs the caller is a mod for this room:
        //   1. a valid session cookie for this room (same-origin production)
        //   2. the room code sent with the join (cross-origin dev / first boot)
        const session = sessionForRoom(req, roomId)
        const ok = session
          ? true
          : room.token && typeof msg.code === "string" && safeEqual(msg.code, room.token)
        if (!ok) {
          send(ws, { type: "error", message: "bad room code" }, false)
          ws.close()
          return
        }
        if (session && Date.now() - session.lastSeen > SESSION_REFRESH_MS) {
          session.lastSeen = Date.now()
          session.expiresAt = Date.now() + SESSION_TTL_MS
        }
        meta.editor = true
        meta.roomId = roomId
        room.editors.add(ws)
      } else {
        meta.overlay = true
        meta.roomId = roomId
        room.overlays.add(ws)
      }

      // The overlay is opened by OBS with nothing but a room id, so it is the
      // least trusted thing in the room. It gets the widgets it has to draw and
      // nothing else — the clip library and the connected channel are mod-only
      // and would otherwise leak to anyone holding the browser-source URL.
      const state = {
        type: "state",
        widgets: [...room.widgets.values()],
        canvasW: room.canvasW,
        canvasH: room.canvasH,
      }
      if (meta.editor) {
        state.assets = [...room.assets.values()]
        state.stream = room.stream
      }
      send(ws, state, false)
      console.log(`[ws] ${meta.editor ? "editor" : "overlay"} joined ${roomId}`)
      return
    }

    const room = meta.roomId ? rooms.get(meta.roomId) : null
    if (!room) return

    if (meta.editor) {
      switch (msg.type) {
        case "widget-put": {
          const w = sanitizeWidget(msg.widget)
          if (!w) break
          if (room.widgets.size >= MAX_WIDGETS_PER_ROOM && !room.widgets.has(w.id)) {
            send(ws, { type: "error", message: "widget cap reached" }, false)
            break
          }
          room.widgets.set(w.id, w)
          toEditors(room, { type: "widget-put", widget: w })
          toOverlays(room, { type: "widget-put", widget: w })
          break
        }

        case "widget-del": {
          const id = String(msg.id ?? "")
          if (!room.widgets.delete(id)) break
          toEditors(room, { type: "widget-del", id })
          toOverlays(room, { type: "widget-del", id })
          break
        }

        case "widget-reorder": {
          // Expects { order: [{ id, zIndex }] }
          const order = Array.isArray(msg.order) ? msg.order : []
          for (const entry of order) {
            const w = room.widgets.get(String(entry.id ?? ""))
            if (w) w.zIndex = clamp(Number(entry.zIndex) || 0, -999, 9999)
          }
          const payload = { type: "widget-reorder", order: order.map(e => ({ id: String(e.id), zIndex: clamp(Number(e.zIndex) || 0, -999, 9999) })) }
          toEditors(room, payload)
          toOverlays(room, payload)
          break
        }

        case "clear-all": {
          room.widgets.clear()
          toEditors(room, { type: "clear-all" })
          toOverlays(room, { type: "clear-all" })
          break
        }

        case "play-sound": {
          const w = room.widgets.get(String(msg.id ?? ""))
          if (w?.type !== "sound") break
          toOverlays(room, { type: "play-sound", id: w.id })
          break
        }

        case "asset-put": {
          const asset = sanitizeAsset(msg.asset)
          if (!asset) break
          if (!room.assets.has(asset.id) && room.assets.size >= MAX_ASSETS_PER_ROOM) break
          room.assets.set(asset.id, asset)
          // Editors only: the library is a mod tool, the overlay never needs it.
          toEditors(room, { type: "asset-put", asset })
          break
        }

        case "asset-del": {
          const id = String(msg.id ?? "")
          if (!room.assets.delete(id)) break
          toEditors(room, { type: "asset-del", id })
          break
        }

        case "stream-set": {
          const next = sanitizeStream(msg.stream)
          if (!next) break
          room.stream = next
          // Editors only. The overlay must stay a transparent widget layer —
          // OBS composites it over the real stream itself, so sending the
          // stream there would double it up on air.
          toEditors(room, { type: "stream-set", stream: next })
          break
        }

        case "chat": {
          const text = String(msg.text ?? "").slice(0, 500).trim()
          if (!text) break
          const chatMsg = {
            type: "chat",
            sender: meta.nickname,
            text,
            ts: Date.now(),
          }
          toEditors(room, chatMsg)
          break
        }
      }
    }
  })

  ws.on("close", () => {
    if (!meta.roomId) return
    const room = rooms.get(meta.roomId)
    if (!room) return
    room.editors.delete(ws)
    room.overlays.delete(ws)
  })
})

// Sweep dead sessions periodically; rooms live forever (a show runs for days).
const sessionSweep = setInterval(() => {
  const now = Date.now()
  for (const [sid, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(sid)
  }
}, 15 * 60 * 1000)

// Reap half-open sockets — a computer that sleeps never sends a close frame.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, 30_000)

// Let the process die cleanly so a dev watch can restart without port fights.
process.on("SIGTERM", () => { process.exit(0) })
process.on("SIGINT", () => { process.exit(0) })

http.listen(PORT, "0.0.0.0", () => {
  const ips = lanAddresses()
  console.log(`[mosaic] relay on http://0.0.0.0:${PORT}`)
  console.log(`[mosaic] serving ${existsSync(DIST) ? "dist/" : "NO BUILD — run: npm run build"}`)
  if (ips.length) console.log(`[mosaic] LAN: ${ips.map((i) => `http://${i}:${PORT}`).join("  ")}`)
})
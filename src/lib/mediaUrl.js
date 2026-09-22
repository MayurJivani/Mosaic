/**
 * Mosaic file + WS server share one origin.
 * URLs must never pin "localhost" from the host machine — phones on the LAN
 * need the same path resolved against *their* page hostname (or PUBLIC_WS_URL).
 */

const RELAY_PORT = 4322
/** Astro's own dev/preview server — the one case where it is not the relay. */
const ASTRO_PORT = 4321

function wsUrlToHttp(wsUrl) {
  if (wsUrl.startsWith("wss://")) return "https://" + wsUrl.slice(6)
  if (wsUrl.startsWith("ws://")) return "http://" + wsUrl.slice(5)
  return wsUrl
}

function httpUrlToWs(httpUrl) {
  if (httpUrl.startsWith("https://")) return "wss://" + httpUrl.slice(8)
  if (httpUrl.startsWith("http://")) return "ws://" + httpUrl.slice(7)
  return httpUrl
}

/** HTTP origin of the Mosaic relay (upload + /files + /net). */
export function getFileServerOrigin() {
  if (import.meta.env?.PUBLIC_WS_URL) return wsUrlToHttp(import.meta.env.PUBLIC_WS_URL)
  if (typeof window !== "undefined") {
    const { protocol, hostname, port, origin } = window.location
    // In production the relay serves this very page, so its origin is already
    // the right answer — port and all. Pinning :4322 onto the hostname instead
    // sent the browser to a port no edge publishes: behind Cloudflare the page
    // loads over 443 and the socket then reaches for :4322 and never connects.
    //
    // Astro's dev/preview server is the one case where the page is not the
    // relay: it serves on its own port with the relay a separate process.
    if (port !== String(ASTRO_PORT)) return origin
    // Match the page's scheme so an https tunnel doesn't trip mixed-content blocking.
    const scheme = protocol === "https:" ? "https" : "http"
    return `${scheme}://${hostname}:${RELAY_PORT}`
  }
  return `http://localhost:${RELAY_PORT}`
}

export function getWsUrl() {
  if (import.meta.env?.PUBLIC_WS_URL) return import.meta.env.PUBLIC_WS_URL
  return httpUrlToWs(getFileServerOrigin())
}

/**
 * What we put on the wire and in room meta: path-only for uploaded files
 * so every client resolves against its own reachable host.
 * Blob URLs are returned unchanged (viewers cannot load them — host-only fallback).
 */
export function stripToRelayPath(url) {
  if (!url || url.startsWith("blob:")) return url
  try {
    const u = new URL(url, getFileServerOrigin())
    if (u.pathname.startsWith("/files/")) return u.pathname + u.search
  } catch {
    /* ignore */
  }
  return url
}

/** Final <video src> on this device (viewer or host). */
export function resolvePlaybackUrl(url) {
  if (!url) return null
  if (url.startsWith("blob:")) return url
  if (url.startsWith("/")) return getFileServerOrigin() + url
  try {
    const u = new URL(url)
    if (u.pathname.startsWith("/files/")) return getFileServerOrigin() + u.pathname + u.search
    return url
  } catch {
    return url
  }
}

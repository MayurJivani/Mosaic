/**
 * Mosaic file + WS server share one origin (port 4322 by default).
 * URLs must never pin "localhost" from the host machine — phones on the LAN
 * need the same path resolved against *their* page hostname (or PUBLIC_WS_URL).
 */

const RELAY_PORT = 4322

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
    // Match the page's scheme so an https tunnel doesn't trip mixed-content blocking.
    const scheme = window.location.protocol === "https:" ? "https" : "http"
    return `${scheme}://${window.location.hostname}:${RELAY_PORT}`
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

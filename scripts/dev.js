/**
 * Runs the relay and Astro together, both bound to 0.0.0.0 — the whole point of
 * Mosaic is phones on the same wifi, and a localhost-only dev server can't be reached.
 */
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { networkInterfaces } from "node:os"
import path from "node:path"

const require = createRequire(import.meta.url)
// Resolve through the package rather than guessing a path — the bin moved once already.
const astroBin = path.join(path.dirname(require.resolve("astro/package.json")), "bin/astro.mjs")

const children = []

function run(label, colour, cmd, args) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" })
  const tag = `\x1b[${colour}m[${label}]\x1b[0m `
  const pipe = (stream, to) => {
    let buf = ""
    stream.on("data", (chunk) => {
      buf += chunk.toString()
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) to.write(tag + line + "\n")
    })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${tag}exited with code ${code}`)
      shutdown(code)
    }
  })
  children.push(child)
  return child
}

function shutdown(code = 0) {
  for (const c of children) if (!c.killed) c.kill("SIGTERM")
  process.exit(code)
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))

run("relay", "36", process.execPath, ["server/index.js"])
run("astro", "35", process.execPath, [astroBin, "dev", "--host"])

const ip = Object.values(networkInterfaces())
  .flat()
  .find((a) => a && a.family === "IPv4" && !a.internal)?.address

setTimeout(() => {
  console.log("\n\x1b[32m  MOSAIC ready\x1b[0m")
  console.log(`  host canvas : http://${ip ?? "localhost"}:4321/`)
  console.log(`  phones join : scan the QR on a source node (or open the copied link)\n`)
}, 1500).unref()

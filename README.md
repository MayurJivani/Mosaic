# MOSAIC

**Mod-controlled stream overlay.** Your mods drag GIFs, clips, sounds, emotes and
text onto a shared board, and it lands on stream instantly — while you keep
playing.

One page goes in OBS as a browser source. Another is the mod board. Anyone
holding the mod link can move things; the overlay only ever draws.

```sh
npm install
npm run build
npm run dev:relay        # http://localhost:4322
```

Open the board, hit **Start a show**, then hand out the two links it gives you:
the **OBS overlay** URL for your browser source, and the **mod link** for your mods.

---

## What mods can do

| | |
| :-- | :-- |
| **Text** | Colour, size, bold — for callouts and bits |
| **Emotes** | Twitch, BTTV, 7TV and FFZ, global or your channel's |
| **GIFs / images** | Drag on, drop anywhere |
| **Clips** | Muted looping video |
| **Sounds** | A soundboard fired at the stream on cue |
| **Transforms** | Rotate, flip, fade, blur, re-stack |
| **Layers** | Rename, lock, hide, reorder |
| **Library** | Everything uploaded, reusable in one click |
| **Chat** | Mod-to-mod, never touches the stream |

Scroll to zoom, drag the canvas to pan, `Del` to remove, `Esc` to deselect.

---

## The stream preview

Pick **Twitch** or **YouTube** and enter the channel. The player is layered
*under* the overlay in the preview, so mods place things against the real frame
instead of a black rectangle. Every mod sees the same stream.

Audio starts muted — browsers refuse to autoplay sound. Hit the speaker to
unmute; volume applies when you let go of the slider. The **overlay** slider
fades only the overlay layer, so you can see what's underneath.

> **Twitch will not embed on an IP address.** It requires `parent` to be a real
> hostname, so use `localhost` or a domain — on a LAN IP the player stays blank.
> The panel warns you when it spots this.

---

## Two rules this holds to

**The OBS overlay never carries the stream or its audio.** OBS already
composites the overlay over your scene; pulling the broadcast into the overlay
would put the stream inside its own stream, with an audio loop to match.

**The overlay is the least trusted peer in the room.** OBS opens it with nothing
but a room id, and that URL is effectively public. It receives the widgets it
has to draw — never the clip library, never the connected channel — and it can
never write anything back.

Hiding a layer with the eye icon **removes it from the stream**, not just from
your board. It's a moderation control, so it has to actually pull things off
air. Sounds are the exception: they have no visual, so hiding one leaves its
trigger working.

---

## Deploying to mosaic.futile.studio

One container, one origin. The relay serves the board, the overlay and the
WebSocket, so there's no second service and no cross-origin cookie problem.

```sh
docker compose up -d --build
```

Point `mosaic.futile.studio` at the host's public IP with an `A` record and
Caddy fetches the certificate on first request. **HTTPS isn't optional** —
Twitch refuses to embed into an insecure page, and the mod session cookie is
`SameSite=Lax` on a single origin.

Uploads live on the `mosaic-uploads` volume. Without it, a redeploy erases every
mod's clip library.

### Tuning

| Variable | Default | |
| :-- | :-- | :-- |
| `MOSAIC_PORT` | `4322` | Relay port |
| `MOSAIC_MAX_UPLOAD_BYTES` | 2 GB | Per-file ceiling |
| `MOSAIC_MAX_JOIN_RATE` | 20 / 10s / IP | Makes brute-forcing a room code pointless |
| `MOSAIC_MAX_WIDGETS` | 400 | Per room |
| `MOSAIC_MAX_ASSETS` | 500 | Library entries per room |
| `MOSAIC_UPLOAD_DIR` | `./uploads` | Where files land |

---

## Commands

| | |
| :-- | :-- |
| `npm run dev` | Relay + Astro with hot reload |
| `npm run dev:relay` | Relay alone, serving `dist/` |
| `npm run build` | Build the board and overlay |
| `npm test` | Full suite — protocol, security, rendering |

---

## How it fits together

```
mod board  ──┐
mod board  ──┼──  relay (rooms, widgets, library, uploads)  ──►  OBS overlay
mod board  ──┘                                                   (draw only)
```

Rooms own the state. Mods mutate it; the overlay renders it. Everything survives
a reload on either side — OBS refreshes browser sources constantly, and a mod
dropping off wifi rejoins to exactly what they left.

Built by [futile.studio](https://futile.studio).

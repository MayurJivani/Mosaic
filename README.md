<div align="center">

<h1 align="center">Mosaic</h1>

### _A live overlay your mods control._

**[mosaic.futile.studio](https://mosaic.futile.studio)**

[![Live](https://img.shields.io/website?url=https%3A%2F%2Fmosaic.futile.studio&label=mosaic.futile.studio&style=flat-square)](https://mosaic.futile.studio)
![Astro](https://img.shields.io/badge/Astro-5-BC52EE?style=flat-square&logo=astro&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)
![WebSockets](https://img.shields.io/badge/WebSockets-relay-010101?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
[![Last commit](https://img.shields.io/github/last-commit/MayurJivani/Mosaic?style=flat-square)](https://github.com/MayurJivani/Mosaic/commits/main)
[![Stars](https://img.shields.io/github/stars/MayurJivani/Mosaic?style=flat-square)](https://github.com/MayurJivani/Mosaic/stargazers)
[![Issues](https://img.shields.io/github/issues/MayurJivani/Mosaic?style=flat-square)](https://github.com/MayurJivani/Mosaic/issues)
![Code size](https://img.shields.io/github/languages/code-size/MayurJivani/Mosaic?style=flat-square)

</div>

<br>

> _For the streamer with both hands on the controller. For the mod who saw the bit before anyone else and had nowhere to put it. Drag the emote on, drop the airhorn, pull it back off, all of it live, none of it yours to babysit._

---

## What your mods get

One page goes in OBS as a browser source. The other is the mod board. Anyone with
the mod link can move things; the overlay only ever draws.

| | |
| :-- | :-- |
| **Emotes** | Twitch, BTTV, 7TV and FFZ, global or your channel's |
| **GIFs & images** | Drag on, drop anywhere |
| **Clips** | Muted looping video |
| **Sounds** | A soundboard fired at the stream on cue |
| **Text** | Colour, size, bold, for callouts and bits |
| **Transforms** | Rotate, flip, fade, blur, re-stack |
| **Layers** | Rename, lock, hide, reorder |
| **Library** | Everything uploaded, reusable in one click |
| **Mod chat** | Coordination that never touches the stream |

Scroll to zoom, drag to pan, `Del` to remove, `Esc` to deselect.

---

## Placing things against the real frame

Pick **Twitch** or **YouTube**, enter the channel, and the player is layered
*under* the overlay in the preview. Mods position things against what is actually
on screen instead of a black rectangle. Every mod sees the same stream.

Audio starts muted, because browsers refuse to autoplay sound. Hit the speaker to
unmute; volume applies when you let go of the slider. The **overlay** slider
fades only the overlay layer, so you can check what's underneath.

> **Twitch will not embed on an IP address.** It needs `parent` to be a real
> hostname, so use `localhost` or a domain. On a LAN IP the player stays blank.
> The panel says so when it spots this.

---

## Two rules this holds to

**The OBS overlay never carries the stream or its audio.** OBS already composites
the overlay over your scene. Pulling the broadcast into the overlay would put the
stream inside its own stream, with an audio loop to match.

**The overlay is the least trusted peer in the room.** OBS opens it with nothing
but a room id, and that URL is effectively public. It receives the widgets it has
to draw, never the clip library and never the connected channel, and it can never
write anything back.

Hiding a layer with the eye **removes it from the stream**, not just from your
board. It's a moderation control, so it has to actually pull things off air.
Sounds are the exception: no visual, so hiding one leaves its trigger working.

Room codes are compared in constant time, joins are rate limited per IP, uploads
are capped and sandboxed to one directory, and every widget is re-sanitised on
the relay before it reaches anyone.

---

## Sound check

```bash
npm install
npm run build
npm run dev:relay        # http://localhost:4322
```

Hit **Start a show**, then hand out the two links it gives you: the **OBS
overlay** URL for your browser source, and the **mod link** for your mods.

| Script | What it does |
| :-- | :-- |
| `dev` | relay + Astro, watch mode |
| `dev:relay` | relay alone, serving `dist/` |
| `build` | production build |
| `test` | full suite: protocol, access rules, rendering |

---

## Deploy

One container behind Caddy. The relay serves the board, the overlay and the
WebSocket together, so there's no second service and no cross-origin cookie
problem.

```bash
docker compose up -d --build
```

Point `mosaic.futile.studio` at the host with an `A` record. Caddy fetches the
certificate on first request and upgrades the WebSocket on its own.

### Or via Cloudflare Tunnel

No open ports, no certificate to manage. `cloudflared` dials out and Cloudflare
terminates TLS at its edge, which makes the Caddy service redundant. Use this
file *instead of* the default one.

```bash
echo "CLOUDFLARE_TUNNEL_TOKEN=..." > .env
docker compose -f docker-compose.tunnel.yml up -d --build
```

In the dashboard, point the tunnel's public hostname `mosaic.futile.studio` at
the service URL **`http://mosaic:4322`**.

Two things the tunnel changes, both already set in that compose file:

- **`MOSAIC_TRUST_PROXY=1`.** Every request now arrives from `cloudflared`, so
  without it the per-IP join limit puts every mod and the overlay in one bucket
  and throttles them together. It is opt-in because trusting a forwarding header
  on a directly-reachable relay would let anyone claim a fresh IP per request.
- **Uploads cap at 100 MB.** Cloudflare refuses larger request bodies on Free,
  Pro and Business, and that 413 never reaches the relay, so the ceiling is
  lowered to match rather than failing confusingly at the edge.

### Onto a box that already has an edge

If the host already runs its own `cloudflared` and reverse proxy for other
sites, it needs neither of the services above, only the relay, reachable on
loopback for the proxy already there.

```bash
docker compose -f docker-compose.tunnel.yml up -d --build mosaic
sudo deploy/install.sh
```

`deploy/install.sh` swaps a `mosaic.futile.studio` block into the system
`Caddyfile` and reloads it. That is only half the route: the tunnel's ingress
for the hostname has to point at `http://localhost:80` in the Cloudflare
dashboard, which no script on the box can do.

**HTTPS isn't optional.** Twitch refuses to embed into an insecure page, and the
mod session cookie is `SameSite=Lax` on a single origin.

Two volumes matter: `mosaic-uploads` holds the clip library, and `caddy-data`
holds the certificates. Lose the first and every mod's library is gone; lose the
second and you re-issue certs on every deploy.

| Variable | Default | |
| :-- | :-- | :-- |
| `PORT` | `4322` | Relay port |
| `MOSAIC_MAX_UPLOAD_BYTES` | 2 GB | Per-file ceiling, keep in step with the Caddyfile |
| `MOSAIC_MAX_JOIN_RATE` | 20 / 10s / IP | Makes guessing a room code pointless |
| `MOSAIC_MAX_WIDGETS` | 400 | Per room |
| `MOSAIC_MAX_ASSETS` | 500 | Library entries per room |
| `MOSAIC_UPLOAD_DIR` | `./uploads` | Where files land |

---

## How it fits together

```
mod board  ──┐
mod board  ──┼──  relay (rooms · widgets · library · uploads)  ──►  OBS overlay
mod board  ──┘                                                      (draw only)
```

Rooms own the state. Mods mutate it, the overlay renders it. Everything survives
a reload on either side. OBS refreshes browser sources constantly, and a mod
dropping off wifi rejoins to exactly what they left.

Astro · React · WebSockets · no database.

---

<div align="center">

Built by [futile.studio](https://futile.studio)

</div>

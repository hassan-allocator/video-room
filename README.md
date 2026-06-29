# Video Room

Self-hosted group video calls — like a Discord voice channel, but you own the stack. No accounts, no passwords. Share a link, enter your name, join the call.

Built with [LiveKit](https://livekit.io/) (open-source WebRTC SFU) for scalable multi-party video.

## How it works

1. **Host** visits the page and clicks **Create room** — a unique 64-character token is generated in the URL (`/?room=abc123…`).
2. **Host** copies the invite link and shares it with trusted members.
3. **Guests** open the link, enter their name, and join — no sign-up required.
4. Everyone appears in a responsive video grid. Camera and mic are off by default; enable them from the control bar.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Docker](https://www.docker.com/) (for the LiveKit media server)

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start LiveKit (WebRTC media server)
npm run livekit:up

# 3. Start the app (API + frontend)
npm run dev
```

Open **https://localhost:5177** (accept the certificate warning), create a room, and share the link.

To test with multiple people, open the invite link in another browser tab or send it to a friend.

## Local network (other devices)

Other machines on your Wi‑Fi can join using your host's LAN IP (e.g. `http://192.168.1.109:5177`).

1. Copy `.env.example` to `.env` and set `LIVEKIT_NODE_IP` to your machine's LAN IP:
   ```bash
   cp .env.example .env
   # edit LIVEKIT_NODE_IP=192.168.1.109
   ```
2. Restart LiveKit so it advertises the correct IP for WebRTC:
   ```bash
   npm run livekit:down && npm run livekit:up
   ```
3. Restart the dev server: `npm run dev`
4. On another device, open `https://<your-ip>:5177` and accept the certificate warning (required for camera/mic).

Browsers block camera/mic on plain `http://` LAN addresses — HTTPS is required. Dev certs are auto-generated in `certs/` on `npm run dev`.

## Deploy on Render

**Live URL:** https://video-room-ze7p.onrender.com

The web app is deployed on Render. **Render cannot host the LiveKit media server** (WebRTC requires UDP, which Render blocks). You need a separate LiveKit instance for video/audio to work.

### Option A: LiveKit Cloud (easiest for Render)

1. Create a free project at [cloud.livekit.io](https://cloud.livekit.io)
2. Copy your **WebSocket URL**, **API Key**, and **API Secret**
3. In the [Render dashboard](https://dashboard.render.com) → **video-room** → **Environment**, set:
   - `LIVEKIT_URL` = `wss://your-project.livekit.cloud`
   - `LIVEKIT_API_KEY` = your API key
   - `LIVEKIT_API_SECRET` = your API secret
4. Save — Render will redeploy automatically

### Option B: Self-hosted LiveKit (VPS / Fly.io)

Run LiveKit on a provider that supports UDP (DigitalOcean, Fly.io, Hetzner, etc.) and point the same env vars at your server (`wss://your-server:7880` or your TLS endpoint).

### Redeploy

```bash
npm run deploy:render
```

Repo: https://github.com/hassan-allocator/video-room

## Production (self-hosted)

```bash
npm run build
NODE_ENV=production npm start
```

Set these environment variables when deploying:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3007` | HTTP server port |
| `LIVEKIT_NODE_IP` | — | Your LAN IP — required for other devices (see `.env.example`) |
| `LIVEKIT_URL` | `(auto)` | Override LiveKit WebSocket URL (use `wss://` in production) |
| `LIVEKIT_API_KEY` | `devkey` | Must match `livekit.yaml` |
| `LIVEKIT_API_SECRET` | `secret` | Must match `livekit.yaml` |

For production, update `livekit.yaml` with strong keys and configure TURN/STUN for clients behind restrictive NATs. See [LiveKit self-hosting docs](https://docs.livekit.io/home/self-hosting/deployment/).

## Architecture

```
Browser ←→ Express (token API) ←→ LiveKit Server (SFU)
   ↑                                      ↑
   └──────── WebRTC media streams ────────┘
```

- **Express** serves the frontend and mints short-lived LiveKit access tokens per join.
- **LiveKit** handles all WebRTC routing (SFU), so every participant can publish and subscribe without mesh limits.

## Privacy

All media flows through your own LiveKit instance — nothing touches Google, Discord, or third-party servers. The room token in the URL is the only access control (security through obscurity for trusted groups).

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Dev server (API on :3007, UI on :5177) |
| `npm run build` | Build frontend for production |
| `npm start` | Run production server |
| `npm run livekit:up` | Start LiveKit via Docker |
| `npm run livekit:down` | Stop LiveKit |

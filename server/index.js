import express from "express";
import { randomBytes } from "crypto";
import { AccessToken } from "livekit-server-sdk";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

const API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "secret";
const PORT = process.env.PORT || 3007;

function livekitUrlForHost(host, secure) {
  if (process.env.LIVEKIT_URL) return process.env.LIVEKIT_URL;

  // Production (e.g. Render) always serves HTTPS — require explicit LiveKit URL.
  if (isProd) {
    throw new Error("LIVEKIT_URL is not configured");
  }

  const h = String(host || "localhost").split(":")[0];
  const tls = secure === "1" || secure === "true";
  const proto = tls ? "wss" : "ws";
  const port = tls ? process.env.LIVEKIT_WSS_PORT || 7443 : 7880;
  if (h === "localhost" || h === "127.0.0.1") {
    return `${proto}://127.0.0.1:${port}`;
  }
  return `${proto}://${h}:${port}`;
}

const app = express();
app.use(express.json());

if (isProd) {
  app.use(express.static(join(__dirname, "../dist")));
}

app.post("/api/rooms", (_req, res) => {
  const token = randomBytes(32).toString("hex");
  res.json({ room: token });
});

app.get("/api/token", async (req, res) => {
  const { room, name, host, secure } = req.query;

  if (!room || !name) {
    return res.status(400).json({ error: "room and name are required" });
  }

  const displayName = String(name).trim().slice(0, 50);
  if (!displayName) {
    return res.status(400).json({ error: "name cannot be empty" });
  }

  const identity = `${displayName}-${randomBytes(4).toString("hex")}`;

  const accessToken = new AccessToken(API_KEY, API_SECRET, {
    identity,
    name: displayName,
    ttl: "24h",
  });

  accessToken.addGrant({
    roomJoin: true,
    room: String(room),
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await accessToken.toJwt();

  let url;
  try {
    url = livekitUrlForHost(host || req.hostname, secure);
  } catch {
    return res.status(503).json({
      error: "LiveKit is not configured. Set LIVEKIT_URL on the server.",
    });
  }

  res.json({
    token: jwt,
    url,
    identity,
    name: displayName,
  });
});

app.get("/api/config", (req, res) => {
  res.json({ livekitUrl: livekitUrlForHost(req.query.host || req.hostname) });
});

if (isProd) {
  app.get("*", (_req, res) => {
    res.sendFile(join(__dirname, "../dist/index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`Public URL: ${process.env.RENDER_EXTERNAL_URL}`);
  }
  console.log(`LiveKit URL: ${process.env.LIVEKIT_URL || "(local dev auto-detect)"}`);
});

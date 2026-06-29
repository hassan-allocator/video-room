import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import httpProxy from "http-proxy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const certDir = path.join(root, "certs");
const PORT = Number(process.env.LIVEKIT_WSS_PORT || 7443);
const TARGET = process.env.LIVEKIT_INTERNAL_URL || "http://127.0.0.1:7880";

const certPath = path.join(certDir, "cert.pem");
const keyPath = path.join(certDir, "key.pem");

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error("Missing certs/ — run: npm run certs");
  process.exit(1);
}

const proxy = httpProxy.createProxyServer({
  target: TARGET,
  ws: true,
  changeOrigin: true,
});

proxy.on("error", (err, _req, socket) => {
  console.error("WSS proxy error:", err.message);
  socket?.end?.();
});

const server = https.createServer(
  {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  },
  (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("LiveKit WSS proxy");
  }
);

server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head, { target: TARGET });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LiveKit WSS proxy on https://0.0.0.0:${PORT} -> ${TARGET}`);
});

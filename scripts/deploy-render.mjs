import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keyFile = resolve(root, ".render-api-key");

function apiKey() {
  if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY;
  try {
    return readFileSync(keyFile, "utf8").trim();
  } catch {
    console.error("Set RENDER_API_KEY or create .render-api-key");
    process.exit(1);
  }
}

async function api(path, options = {}) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const REPO = "https://github.com/hassan-allocator/video-room";

const owners = await api("/owners");
const ownerId = owners[0]?.owner?.id;
if (!ownerId) throw new Error("No Render workspace found");

console.log("Workspace:", owners[0]?.owner?.name || ownerId);

const existing = await api(`/services?limit=50&name=video-room`);
const found = existing.find((s) => s.service?.name === "video-room");

if (found) {
  console.log("Service exists:", found.service.id);
  const deploy = await api(`/services/${found.service.id}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "clear" }),
  });
  console.log("Deploy triggered:", deploy.id);
  console.log("URL:", found.service.serviceDetails?.url || "(check dashboard)");
  process.exit(0);
}

const body = {
  type: "web_service",
  name: "video-room",
  ownerId,
  repo: REPO,
  branch: "main",
  autoDeploy: "yes",
  serviceDetails: {
    runtime: "node",
    plan: "free",
    region: "oregon",
    buildCommand: "npm install && npm run build",
    startCommand: "npm start",
    healthCheckPath: "/",
    envSpecificDetails: {
      buildCommand: "npm install && npm run build",
      startCommand: "npm start",
    },
    envVars: [
      { key: "NODE_ENV", value: "production" },
      { key: "LIVEKIT_URL", value: "" },
      { key: "LIVEKIT_API_KEY", value: "" },
      { key: "LIVEKIT_API_SECRET", value: "" },
    ],
  },
};

const created = await api("/services", {
  method: "POST",
  body: JSON.stringify(body),
});

console.log("Service created:", created.service.id);
console.log("URL:", created.service.serviceDetails?.url);
console.log("\nAdd LiveKit env vars in Render dashboard (see README).");

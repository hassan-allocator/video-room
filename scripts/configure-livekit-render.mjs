import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keyFile = resolve(root, ".render-api-key");
const SERVICE_ID = "srv-d9142slaeets73ejftag";

function apiKey() {
  if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY;
  return readFileSync(keyFile, "utf8").trim();
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

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

const fileVars = loadEnvFile(resolve(root, ".env.production"));
const required = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];

const missing = required.filter((k) => !(process.env[k] || fileVars[k]));
if (missing.length) {
  console.error("Missing LiveKit credentials. Set in .env.production or environment:");
  console.error(`
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxx
LIVEKIT_API_SECRET=your-secret
`);
  console.error("Get these from https://cloud.livekit.io → Project → Settings → Keys");
  process.exit(1);
}

const values = Object.fromEntries(
  required.map((k) => [k, process.env[k] || fileVars[k]])
);

console.log("Configuring LiveKit on Render service", SERVICE_ID);
console.log("  LIVEKIT_URL:", values.LIVEKIT_URL);

for (const key of required) {
  await api(`/services/${SERVICE_ID}/env-vars/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value: values[key] }),
  });
}

const deploy = await api(`/services/${SERVICE_ID}/deploys`, {
  method: "POST",
  body: JSON.stringify({ clearCache: "clear" }),
});

console.log("Env vars set. Deploy triggered:", deploy.id);
console.log("App: https://video-room-ze7p.onrender.com");

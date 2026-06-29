import { defineConfig } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const certDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "certs");
const certPath = path.join(certDir, "cert.pem");
const keyPath = path.join(certDir, "key.pem");

const https =
  fs.existsSync(certPath) && fs.existsSync(keyPath)
    ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }
    : false;

export default defineConfig({
  root: "client",
  server: {
    port: 5177,
    strictPort: true,
    host: true,
    https,
    proxy: {
      "/api": "http://127.0.0.1:3007",
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});

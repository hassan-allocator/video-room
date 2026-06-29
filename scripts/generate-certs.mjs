import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const certDir = join(root, "certs");
const certFile = join(certDir, "cert.pem");
const keyFile = join(certDir, "key.pem");

function readLanIp() {
  const envPath = join(root, ".env");
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, "utf8").match(/^LIVEKIT_NODE_IP=(.+)$/m);
    if (match) return match[1].trim();
  }
  return null;
}

function certNeedsRegeneration(ip) {
  if (!existsSync(certFile)) return true;
  const cert = readFileSync(certFile, "utf8");
  if (ip && !cert.includes(ip)) return true;
  return false;
}

const lanIp = readLanIp();

if (!certNeedsRegeneration(lanIp)) {
  process.exit(0);
}

mkdirSync(certDir, { recursive: true });

const san = ["DNS.1 = localhost", "IP.1 = 127.0.0.1"];
if (lanIp) san.push(`IP.2 = ${lanIp}`);

const opensslCnf = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = video-room.local

[v3_req]
subjectAltName = @alt_names
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
${san.join("\n")}
`;

const cnfPath = join(certDir, "openssl.cnf");
writeFileSync(cnfPath, opensslCnf);

execSync(
  `openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout "${keyFile}" -out "${certFile}" -config "${cnfPath}" -extensions v3_req`,
  { stdio: "inherit" }
);

console.log(`Generated dev TLS certs in certs/`);
if (lanIp) console.log(`  LAN IP included: ${lanIp}`);

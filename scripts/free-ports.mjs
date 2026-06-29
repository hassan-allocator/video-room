import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORTS = [3007, 5177, 7443];

function commandFor(pid) {
  try {
    return execSync(`ps -p ${pid} -o command=`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function cwdFor(pid) {
  try {
    return execSync(`lsof -p ${pid} -Fn 2>/dev/null | grep ^n | head -1`, {
      encoding: "utf8",
    })
      .trim()
      .slice(1);
  } catch {
    return "";
  }
}

function belongsToProject(pid) {
  const cmd = commandFor(pid);
  const cwd = cwdFor(pid);
  return cmd.includes(projectRoot) || cwd.startsWith(projectRoot);
}

for (const port of PORTS) {
  let pids = [];
  try {
    pids = execSync(`lsof -ti :${port} -sTCP:LISTEN`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    continue;
  }

  for (const pid of pids) {
    if (belongsToProject(pid)) {
      console.log(`Stopping stale process ${pid} on port ${port}`);
      try {
        execSync(`kill ${pid}`);
      } catch {
        execSync(`kill -9 ${pid}`);
      }
    }
  }
}

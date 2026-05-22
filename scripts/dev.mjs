import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const localAppData = path.join(rootDir, ".local-appdata");
const electronCache = path.join(rootDir, ".electron-cache");
const electronBuilderCache = path.join(rootDir, ".electron-builder-cache");
const childEnv = {
  ...process.env,
  LOCALAPPDATA: localAppData,
  ELECTRON_CACHE: electronCache,
  ELECTRON_BUILDER_CACHE: electronBuilderCache
};

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: childEnv,
    ...options
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function ping() {
      const request = http.get(url, () => resolve());

      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(ping, 250);
      });

      request.setTimeout(1000, () => {
        request.destroy();
      });
    }

    ping();
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error(`No open port found from ${startPort} to ${startPort + 19}`);
}

const port = await findOpenPort(5173);
const devServerUrl = `http://127.0.0.1:${port}`;
const vite = run("npm", ["run", "dev:renderer", "--", "--port", String(port), "--strictPort"]);

try {
  await waitForServer(devServerUrl);

  const electronBin =
    process.platform === "win32"
      ? path.join(rootDir, "node_modules", "electron", "dist", "electron.exe")
      : path.join(rootDir, "node_modules", ".bin", "electron");

  const electron = run(electronBin, ["."], {
    shell: false,
    env: {
      ...childEnv,
      VITE_DEV_SERVER_URL: devServerUrl
    }
  });

  electron.on("exit", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
} catch (error) {
  vite.kill();
  console.error(error);
  process.exit(1);
}

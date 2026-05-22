import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const electronBin =
  process.platform === "win32"
    ? path.join(rootDir, "node_modules", "electron", "dist", "electron.exe")
    : path.join(rootDir, "node_modules", ".bin", "electron");

const child = spawn(electronBin, ["."], {
  cwd: rootDir,
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    LOCALAPPDATA: path.join(rootDir, ".local-appdata"),
    ELECTRON_CACHE: path.join(rootDir, ".electron-cache"),
    ELECTRON_BUILDER_CACHE: path.join(rootDir, ".electron-builder-cache")
  }
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

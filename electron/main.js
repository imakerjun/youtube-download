const { app, BrowserWindow } = require("electron");
const { spawn, execFileSync } = require("child_process");
const path = require("path");
const net = require("net");
const fs = require("fs");
const http = require("http");

// ── Paths ──────────────────────────────────────────────
const isDev = process.env.NODE_ENV === "development";
const APP_SUPPORT = path.join(
  app.getPath("appData"),
  "YouTube Downloader"
);
const VENV_DIR = path.join(APP_SUPPORT, "venv");
const DATA_DIR = APP_SUPPORT;
const DB_PATH = path.join(DATA_DIR, "youtube_dl.db");
const DOWNLOAD_DIR = path.join(app.getPath("movies"), "YouTube Downloads");

function getResourcePath(subpath) {
  if (isDev) {
    return path.join(__dirname, "..", subpath);
  }
  return path.join(process.resourcesPath, subpath);
}

// ── Port Discovery ─────────────────────────────────────
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// ── Venv Setup ─────────────────────────────────────────
function ensureVenv() {
  const python = path.join(VENV_DIR, "bin", "python");
  if (fs.existsSync(python)) return;

  console.log("Creating venv at", VENV_DIR);
  fs.mkdirSync(VENV_DIR, { recursive: true });
  execFileSync("python3", ["-m", "venv", VENV_DIR], { stdio: "inherit" });

  const requirementsPath = path.join(getResourcePath("backend"), "requirements.txt");
  console.log("Installing dependencies from", requirementsPath);
  execFileSync(
    path.join(VENV_DIR, "bin", "pip"),
    ["install", "-r", requirementsPath],
    { stdio: "inherit" }
  );
}

// ── Backend Process ────────────────────────────────────
let backendProcess = null;

function startBackend(port) {
  const python = path.join(VENV_DIR, "bin", "python");
  const backendDir = getResourcePath("backend");
  const frontendDist = getResourcePath("frontend-dist");

  // In dev mode, frontend-dist might not exist — that's fine
  const staticDir = isDev ? "" : frontendDist;

  const env = {
    ...process.env,
    YTD_DOWNLOAD_DIR: DOWNLOAD_DIR,
    YTD_DATA_DIR: DATA_DIR,
    YTD_DB_PATH: DB_PATH,
    ...(staticDir && fs.existsSync(staticDir) ? { YTD_STATIC_DIR: staticDir } : {}),
  };

  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  backendProcess = spawn(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)],
    { cwd: backendDir, env, stdio: ["ignore", "pipe", "pipe"] }
  );

  backendProcess.stdout.on("data", (data) => console.log("[backend]", data.toString().trim()));
  backendProcess.stderr.on("data", (data) => console.log("[backend]", data.toString().trim()));
  backendProcess.on("exit", (code) => {
    console.log(`Backend exited with code ${code}`);
    backendProcess = null;
  });
}

function waitForBackend(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("Backend did not start within timeout"));
      }
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        setTimeout(check, 300);
      });
      req.on("error", () => setTimeout(check, 300));
      req.end();
    }
    check();
  });
}

function stopBackend() {
  if (!backendProcess) return Promise.resolve();
  return new Promise((resolve) => {
    backendProcess.on("exit", resolve);
    backendProcess.kill("SIGTERM");
    // Force kill after 5 seconds
    setTimeout(() => {
      if (backendProcess) {
        backendProcess.kill("SIGKILL");
        resolve();
      }
    }, 5000);
  });
}

// ── Window ─────────────────────────────────────────────
let mainWindow = null;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "YouTube Downloader",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = isDev
    ? "http://localhost:5173"
    : `http://127.0.0.1:${port}`;

  mainWindow.loadURL(url);
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── App Lifecycle ──────────────────────────────────────
app.whenReady().then(async () => {
  try {
    const port = await findFreePort();
    console.log(`Using port ${port}`);

    if (!isDev) {
      ensureVenv();
    }

    startBackend(port);
    await waitForBackend(port);
    createWindow(port);
  } catch (err) {
    console.error("Failed to start:", err);
    app.quit();
  }
});

app.on("window-all-closed", async () => {
  await stopBackend();
  app.quit();
});

app.on("before-quit", async () => {
  await stopBackend();
});

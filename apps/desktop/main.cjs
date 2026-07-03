/**
 * SoftGlaze Stock Manager — Windows desktop shell (Phase 7).
 *
 * Production: spawns the BUILT Express server using Electron's own Node runtime
 * (ELECTRON_RUN_AS_NODE — no separate Node install needed on the PC). The server
 * serves both the API and the built web app on http://localhost:4000, so the window
 * just loads that one origin. Uploads live under %APPDATA%/SoftGlaze; the database URL
 * and JWT secrets come from an editable config file created on first run.
 *
 * Live-dev: run with SOFTGLAZE_DEV=1 (with `npm run dev` already running) to load the
 * Vite dev server instead of spawning anything.
 */
const { app, BrowserWindow, dialog, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");
const http = require("http");

const PORT = Number(process.env.SOFTGLAZE_PORT || 4000);
const BASE = `http://localhost:${PORT}`;
const DEV = process.env.SOFTGLAZE_DEV === "1";
const isPackaged = app.isPackaged;

// Bundled resource locations (packaged vs. running from source)
const RES = isPackaged ? process.resourcesPath : path.join(__dirname, "..");
const SERVER_ENTRY = path.join(RES, "server", "dist", "index.js");
const WEB_DIST = path.join(RES, "web", "dist");
const NODE_MODULES = isPackaged ? path.join(RES, "node_modules") : path.join(__dirname, "..", "..", "node_modules");

let serverProc = null;
let win = null;
const logs = [];
const log = (s) => { logs.push(String(s)); if (logs.length > 200) logs.shift(); process.stdout.write(String(s)); };

/** Editable config in %APPDATA%/SoftGlaze/softglaze.config.json */
function loadConfig() {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "softglaze.config.json");
  let cfg = {};
  if (fs.existsSync(file)) { try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* keep defaults */ } }
  let changed = false;
  if (!cfg.databaseUrl) { cfg.databaseUrl = process.env.DATABASE_URL || "postgresql://softglaze:softglaze_dev@localhost:5432/softglaze?schema=public"; changed = true; }
  if (!cfg.jwtSecret) { cfg.jwtSecret = crypto.randomBytes(32).toString("hex"); changed = true; }
  if (!cfg.jwtRefreshSecret) { cfg.jwtRefreshSecret = crypto.randomBytes(32).toString("hex"); changed = true; }
  if (changed) fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return cfg;
}

function startServer() {
  const uploadsDir = path.join(app.getPath("userData"), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const cfg = loadConfig();

  serverProc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: path.dirname(SERVER_ENTRY),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      NODE_PATH: NODE_MODULES,
      PORT: String(PORT),
      SERVE_WEB: "1",
      WEB_DIST,
      UPLOAD_DIR: uploadsDir,
      DATABASE_URL: cfg.databaseUrl,
      JWT_SECRET: cfg.jwtSecret,
      JWT_REFRESH_SECRET: cfg.jwtRefreshSecret,
      CORS_ORIGIN: BASE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", log);
  serverProc.stderr.on("data", log);
  serverProc.on("exit", (code) => {
    log(`\n[server exited: ${code}]`);
    if (!app.isQuitting && code !== 0) {
      dialog.showErrorBox("SoftGlaze — server stopped", `The background service stopped.\n\nLast messages:\n${logs.slice(-15).join("")}`);
    }
  });
}

function waitForHealth(cb, deadline = Date.now() + 45000) {
  const req = http.get(`${BASE}/api/v1/health`, (res) => {
    res.resume();
    if (res.statusCode === 200) return cb();
    retry();
  });
  req.on("error", retry);
  req.setTimeout(1500, () => req.destroy());
  function retry() {
    if (Date.now() > deadline) {
      dialog.showErrorBox("SoftGlaze — couldn't start", `The app service didn't come up in time.\n\nUsually this means the database isn't running or the connection settings are wrong.\n\nEdit:\n${path.join(app.getPath("userData"), "softglaze.config.json")}\n\nLast messages:\n${logs.slice(-15).join("")}`);
      return app.quit();
    }
    setTimeout(() => waitForHealth(cb, deadline), 500);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#101418",
    title: "SoftGlaze Stock Manager",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.cjs") },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());

  // wa.me / http links open in the real browser; blank print windows stay in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });

  win.loadURL(DEV ? "http://localhost:5173" : BASE);
}

// Single instance — focus the existing window instead of opening a second app
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(() => {
    if (DEV) { createWindow(); return; }
    startServer();
    waitForHealth(createWindow);
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on("before-quit", () => { app.isQuitting = true; });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("quit", () => { try { serverProc && serverProc.kill(); } catch { /* ignore */ } });

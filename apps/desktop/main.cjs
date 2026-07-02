/**
 * SoftGlaze desktop shell.
 * DEV MODE (now):  starts nothing — expects `npm run dev` already running,
 *                  and simply opens a window at the Vite dev URL.
 * PROD MODE (Phase 7): spawns the built server from resources and loads the
 *                  built web app — we wire this together in Phase 7.
 */
const { app, BrowserWindow } = require("electron");

const DEV_URL = process.env.IRONLEDGER_URL || "http://localhost:5173";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#101418",
    title: "SoftGlaze Stock Manager — Stock Management & POS",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(DEV_URL);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

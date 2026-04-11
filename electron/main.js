/**
 * פלאן · Electron Main Process
 *
 * Wraps the Next.js app in a native macOS window.
 * All persistent data lives in:
 *   ~/Library/Application Support/פלאן/verdant.json
 */

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// Force a stable folder name regardless of what package.json "name" is.
app.setName("פלאן");
const userData = path.join(app.getPath("appData"), "פלאן");
if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);

const DATA_FILE = path.join(userData, "verdant.json");
const BACKUP_DIR = path.join(userData, "backups");
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ─── IPC: data path discovery (called from preload) ───
ipcMain.on("plan:get-data-file", (event) => {
  event.returnValue = DATA_FILE;
});

ipcMain.on("plan:get-user-data", (event) => {
  event.returnValue = userData;
});

// ─── IPC: open the data folder in Finder (debug aid) ───
ipcMain.handle("plan:reveal-data", async () => {
  shell.showItemInFolder(DATA_FILE);
});

// ─── Daily backup snapshot ───
function rotateBackup() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const today = new Date().toISOString().slice(0, 10);
    const dest = path.join(BACKUP_DIR, `verdant_${today}.json`);
    if (fs.existsSync(dest)) return; // already backed up today
    fs.copyFileSync(DATA_FILE, dest);
    // Keep last 30
    const all = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("verdant_") && f.endsWith(".json"))
      .sort();
    while (all.length > 30) {
      const f = all.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {}
    }
  } catch (e) {
    console.error("backup failed", e);
  }
}

// ─── Window ───
let win = null;
const isDev = !app.isPackaged;
const DEV_URL = "http://localhost:3000";

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: "פלאן",
    backgroundColor: "#f9faf2",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL(DEV_URL);
    // win.webContents.openDevTools({ mode: "detach" });
  } else {
    // For packaged app: serve the static export from out/
    win.loadFile(path.join(__dirname, "..", "out", "index.html"));
  }

  win.on("closed", () => { win = null; });
}

app.whenReady().then(() => {
  rotateBackup();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

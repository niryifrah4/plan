/**
 * פלאן · Preload Bridge
 *
 * Bridges window.localStorage to a real JSON file on disk:
 *   ~/Library/Application Support/פלאן/verdant.json
 *
 * Strategy:
 *   1. At preload time (before page scripts run), synchronously read the
 *      JSON file and queue its contents into a hydration map.
 *   2. After the renderer's localStorage is available, replay the map
 *      into localStorage so all existing app code keeps working unchanged.
 *   3. Wrap Storage.prototype.{setItem,removeItem,clear} to also persist
 *      every change back to disk (debounced + atomic write).
 *
 * Result: every existing localStorage call in the app becomes a real
 * file-backed write — no app code needs to change.
 */

const fs = require("fs");
const path = require("path");
const { ipcRenderer, contextBridge } = require("electron");

const DATA_FILE = ipcRenderer.sendSync("plan:get-data-file");
const USER_DATA = ipcRenderer.sendSync("plan:get-user-data");

// ─── Load existing data (if any) ───
let initialStore = {};
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.store && typeof parsed.store === "object") {
      initialStore = parsed.store;
    }
  }
} catch (e) {
  console.error("[פלאן] failed to read verdant.json", e);
}

// ─── Atomic, debounced save ───
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const store = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k != null) store[k] = window.localStorage.getItem(k);
      }
      const payload = {
        version: 1,
        appName: "פלאן",
        lastModified: new Date().toISOString(),
        store,
      };
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf-8");
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) {
      console.error("[פלאן] save failed", e);
    }
  }, 400);
}

// ─── Hydrate localStorage and install write hooks ───
function installBridge() {
  try {
    // Replay JSON file into localStorage. We do NOT clear first — we only
    // overwrite keys present in the file. This way the app's own startup
    // can still write defaults that we then capture on the next save.
    for (const [k, v] of Object.entries(initialStore)) {
      if (typeof v === "string") {
        // Use the original setItem so this initial replay does not
        // immediately trigger another save.
        Storage.prototype._origSetItem.call(window.localStorage, k, v);
      }
    }
  } catch (e) {
    console.error("[פלאן] hydrate failed", e);
  }
}

// Patch Storage prototype as early as possible
try {
  if (!Storage.prototype._origSetItem) {
    Storage.prototype._origSetItem = Storage.prototype.setItem;
    Storage.prototype._origRemoveItem = Storage.prototype.removeItem;
    Storage.prototype._origClear = Storage.prototype.clear;

    Storage.prototype.setItem = function (k, v) {
      Storage.prototype._origSetItem.call(this, k, v);
      if (this === window.localStorage) scheduleSave();
    };
    Storage.prototype.removeItem = function (k) {
      Storage.prototype._origRemoveItem.call(this, k);
      if (this === window.localStorage) scheduleSave();
    };
    Storage.prototype.clear = function () {
      Storage.prototype._origClear.call(this);
      if (this === window.localStorage) scheduleSave();
    };
  }
} catch (e) {
  console.error("[פלאן] failed to patch Storage", e);
}

window.addEventListener("DOMContentLoaded", () => {
  installBridge();
  // Mark that bridge is active
  console.log(`[פלאן] persistence active → ${DATA_FILE}`);
});

// Expose a small API to the renderer for debug / settings
window.plan = {
  dataFile: DATA_FILE,
  userData: USER_DATA,
  revealDataFile: () => ipcRenderer.invoke("plan:reveal-data"),
  forceSave: () => scheduleSave(),
};

// Compatibility shim for tabs that still hold the previous Vite manifest.
// The dashboard panel is now bundled statically; returning a valid module
// prevents an old tab from crashing while it refreshes to the current build.
export function MacroPanel() {
  return null;
}

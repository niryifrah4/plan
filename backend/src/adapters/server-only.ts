/**
 * Shim for the `server-only` package. In Next.js it's a build-time marker that
 * throws if a module is pulled into a client bundle. The backend is entirely
 * server-side, so reused lib/* files that `import "server-only"` resolve here
 * to a harmless no-op (see tsconfig paths + build alias).
 */
export {};

/**
 * Re-export from shared/ so existing `@/lib/format` imports
 * keep working. The real implementation lives in shared/format.ts
 * and is reused by the mobile app.
 */
export * from "@shared/format";

/**
 * Re-export from shared/ so existing `@/lib/financial-math` imports
 * keep working. The real implementation lives in shared/financial-math.ts
 * and is reused by the mobile app.
 */
export * from "@shared/financial-math";

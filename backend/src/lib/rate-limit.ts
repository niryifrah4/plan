import type { Request } from "express";

/**
 * Sliding-window in-memory rate limiter. Ported from lib/rate-limit.ts.
 * Single-instance only; swap for Upstash Redis in multi-instance prod.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60_000).unref?.();

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(opts.key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs };
  }
  if (bucket.count >= opts.limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: opts.limit - bucket.count, resetAt: bucket.resetAt };
}

/** Extract client IP from an Express request (honors proxy headers). */
export function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const first = Array.isArray(xff) ? xff[0] : xff?.split(",")[0];
  return (
    first?.trim() ||
    (req.headers["x-real-ip"] as string) ||
    (req.headers["cf-connecting-ip"] as string) ||
    req.ip ||
    "unknown"
  );
}

export const RATE_LIMITS = {
  UPLOAD: { limit: 10, windowMs: 60_000 },
  PARSE: { limit: 20, windowMs: 60_000 },
  AUTH: { limit: 5, windowMs: 60_000 },
  INVITE: { limit: 10, windowMs: 60 * 60_000 },
  GENERIC: { limit: 60, windowMs: 60_000 },
} as const;

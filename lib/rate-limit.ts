/**
 * ═══════════════════════════════════════════════════════════
 *  Rate Limiter — הגנה בסיסית מפני abuse ב-API routes
 * ═══════════════════════════════════════════════════════════
 *
 * Sliding window in-memory limiter.
 * Production upgrade: החליפו ב-Upstash Redis rate-limit (`@upstash/ratelimit`).
 * הפתרון הנוכחי עובד על instance בודד בלבד.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup — prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60_000).unref?.();

export interface RateLimitOptions {
  /** Unique identifier per client (IP, user id, etc.) */
  key: string;
  /** Max requests in the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** Check if a request is allowed, and increment the counter */
export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(opts.key);

  if (!bucket || bucket.resetAt < now) {
    // Fresh window
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs };
  }

  if (bucket.count >= opts.limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: opts.limit - bucket.count, resetAt: bucket.resetAt };
}

/** Extract client IP from Next.js request headers */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/** Rate-limit presets (tuned for abuse vs. UX) */
export const RATE_LIMITS = {
  // Doc upload — expensive parsing
  UPLOAD: { limit: 10, windowMs: 60_000 }, // 10/min
  // Doc parsing API
  PARSE: { limit: 20, windowMs: 60_000 }, // 20/min
  // Auth endpoints (future)
  AUTH: { limit: 5, windowMs: 60_000 }, // 5/min — brute force defense
  // Generic API
  GENERIC: { limit: 60, windowMs: 60_000 }, // 60/min
} as const;

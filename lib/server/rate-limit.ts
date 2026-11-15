import { AppError } from "@/lib/services/core";

/**
 * Sliding-window rate limiter for expensive server operations (exports, imports).
 * In-memory: per server process. That is right for the local single-process app; a multi-instance
 * deployment should move this to a shared store (e.g. a Postgres table or Redis).
 */
const hits = new Map<string, number[]>();

export const LIMITS = {
  export: { max: 5, windowMs: 60_000 },
  import: { max: 20, windowMs: 60_000 },
} as const;

export function checkRateLimit(userId: string, bucket: keyof typeof LIMITS, now = Date.now()) {
  const { max, windowMs } = LIMITS[bucket];
  const key = `${bucket}:${userId}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const retry = Math.ceil((windowMs - (now - recent[0]!)) / 1000);
    throw new AppError("rate_limited", `Too many ${bucket} requests. Try again in ${retry}s.`);
  }
  recent.push(now);
  hits.set(key, recent);
}

export function resetRateLimits() {
  hits.clear();
}

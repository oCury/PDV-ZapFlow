const hits = new Map<string, { count: number; resetAt: number }>();

/** Returns true if allowed, false if over `max` within `windowMs`. In-memory (single region; MVP). */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const e = hits.get(key);
  if (!e || now > e.resetAt) { hits.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

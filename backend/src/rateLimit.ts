/**
 * Counts attempts per key (say, one IP address plus a username) inside a sliding
 * time window. It lives in memory, so it resets when the server restarts; that's
 * fine for slowing down password guessing on a small app.
 */
export class AttemptLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length > 0) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.max;
  }

  record(key: string): void {
    if (this.hits.size > 5000) for (const k of [...this.hits.keys()]) this.recent(k); // sweep stale keys
    this.hits.set(key, [...this.recent(key), this.now()]);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

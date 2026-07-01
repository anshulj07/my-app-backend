// lib/cache.ts
// ✅ Simple in-memory TTL cache for reducing repeated DB lookups
// Keeps user profile data and other hot data cached between requests

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// ─── Singleton caches (survive across requests in Node.js process) ─────────────

// User profile cache: clerkUserId → { name, avatar, isVerified }
// TTL: 2 minutes — fresh enough for display, saves DB round-trips
export type CachedUser = {
  name: string;
  avatar: string;
  isVerified: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var _userCache: TtlCache<CachedUser> | undefined;
  // eslint-disable-next-line no-var
  var _eventsEtag: string | undefined;
  // eslint-disable-next-line no-var
  var _eventsEtagTs: number | undefined;
}

// In development, reuse across hot reloads; in production create fresh
if (!global._userCache) {
  global._userCache = new TtlCache<CachedUser>(120); // 2 min TTL
}

export const userCache = global._userCache;

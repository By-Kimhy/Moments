// Short-lived values with a time to live: OTP codes and rate-limit counters. Redis when
// REDIS_URL is set, otherwise an in-memory map (one API process only).
import { Redis } from "ioredis";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export interface TtlStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Adds 1 and returns the new count; the TTL starts when the key is created. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

class MemoryStore implements TtlStore {
  private items = new Map<string, { value: string; expiresAt: number }>();

  private live(key: string) {
    const item = this.items.get(key);
    if (item && item.expiresAt <= Date.now()) {
      this.items.delete(key);
      return undefined;
    }
    return item;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.items.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string) {
    this.items.delete(key);
  }

  async incr(key: string, ttlSeconds: number) {
    const item = this.live(key);
    const count = Number(item?.value ?? 0) + 1;
    this.items.set(key, { value: String(count), expiresAt: item?.expiresAt ?? Date.now() + ttlSeconds * 1000 });
    return count;
  }
}

class RedisStore implements TtlStore {
  constructor(private redis: Redis) {}

  async get(key: string) {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(key, value, "EX", ttlSeconds);
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async incr(key: string, ttlSeconds: number) {
    const [[, count]] = (await this.redis.multi().incr(key).expire(key, ttlSeconds, "NX").exec()) as [[unknown, number]];
    return count;
  }
}

function createStore(): TtlStore {
  const url = config.redisUrl();
  // Tests use memory so they don't depend on Redis being up.
  if (!url || config.test) return new MemoryStore();
  return new RedisStore(new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 }));
}

export const store = createStore();

/** Throws 429 once `key` has been hit more than `limit` times in `windowSeconds`. */
export async function rateLimit(key: string, limit: number, windowSeconds: number, message: string) {
  const count = await store.incr(`rl:${key}`, windowSeconds);
  if (count > limit) throw new HttpError(429, message);
}

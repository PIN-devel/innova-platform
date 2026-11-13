import { randomUUID } from "node:crypto";
import { executeUpstashCommand, type UpstashRestClientOptions } from "./cache.js";

export interface LockLease {
  readonly key: string;
  readonly token: string;
  readonly expiresAtMs: number;
  release(): Promise<boolean>;
}

export interface DistributedLock {
  tryAcquire(key: string, ttlMs: number): Promise<LockLease | null>;
  withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }>;
}

interface MemoryLockEntry {
  token: string;
  expiresAtMs: number;
}

const RELEASE_LOCK_LUA_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

async function runWithLock<T>(
  lock: DistributedLock,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const lease = await lock.tryAcquire(key, ttlMs);
  if (!lease) return { acquired: false };
  try {
    const value = await fn();
    return { acquired: true, value };
  } finally {
    await lease.release().catch(() => false);
  }
}

export function createInMemoryDistributedLock(
  now: () => number = () => Date.now(),
): DistributedLock {
  const locks = new Map<string, MemoryLockEntry>();

  const lock: DistributedLock = {
    async tryAcquire(key: string, ttlMs: number): Promise<LockLease | null> {
      const safeTtlMs = Math.floor(ttlMs);
      if (safeTtlMs <= 0) return null;

      const currentTime = now();
      const existing = locks.get(key);
      if (existing && existing.expiresAtMs > currentTime) {
        return null;
      }

      const token = randomUUID();
      const expiresAtMs = currentTime + safeTtlMs;
      locks.set(key, { token, expiresAtMs });

      return {
        key,
        token,
        expiresAtMs,
        async release() {
          const current = locks.get(key);
          if (!current || current.token !== token) return false;
          locks.delete(key);
          return current.expiresAtMs > now();
        },
      };
    },

    withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>) {
      return runWithLock(lock, key, ttlMs, fn);
    },
  };

  return lock;
}

export function createUpstashRestDistributedLock(
  options: UpstashRestClientOptions & { now?: () => number },
): DistributedLock {
  const now = options.now ?? (() => Date.now());

  const lock: DistributedLock = {
    async tryAcquire(key: string, ttlMs: number): Promise<LockLease | null> {
      const safeTtlMs = Math.floor(ttlMs);
      if (safeTtlMs <= 0) return null;

      const lockToken = randomUUID();
      const acquiredAt = now();
      const result = await executeUpstashCommand<string | null>(options, [
        "SET",
        key,
        lockToken,
        "NX",
        "PX",
        safeTtlMs,
      ]);
      if (result !== "OK") return null;

      return {
        key,
        token: lockToken,
        expiresAtMs: acquiredAt + safeTtlMs,
        async release() {
          const deleted = await executeUpstashCommand<number>(options, [
            "EVAL",
            RELEASE_LOCK_LUA_SCRIPT,
            1,
            key,
            lockToken,
          ]);
          return deleted === 1;
        },
      };
    },

    withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>) {
      return runWithLock(lock, key, ttlMs, fn);
    },
  };

  return lock;
}

export function createRuntimeDistributedLock({
  url = process.env.UPSTASH_REDIS_REST_URL,
  token = process.env.UPSTASH_REDIS_REST_TOKEN,
  fetchImpl = fetch,
  timeoutMs,
}: {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): DistributedLock {
  if (url && token) {
    return createUpstashRestDistributedLock({ url, token, fetchImpl, timeoutMs });
  }
  return createInMemoryDistributedLock();
}

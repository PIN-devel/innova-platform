export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /**
   * Atomically sets a string value only when the key does not exist (SET NX PX).
   * Returns `true` if set, `false` if the key already exists.
   */
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
}

interface MemoryCacheEntry {
  raw: string;
  expiresAtMs: number;
}

export function createInMemoryCacheStore(now: () => number = () => Date.now()): CacheStore {
  const entries = new Map<string, MemoryCacheEntry>();

  function getActiveEntry(key: string): MemoryCacheEntry | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const entry = getActiveEntry(key);
      if (!entry) return undefined;
      return JSON.parse(entry.raw) as T;
    },

    async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
      if (ttlMs <= 0) {
        entries.delete(key);
        return;
      }
      entries.set(key, {
        raw: JSON.stringify(value),
        expiresAtMs: now() + ttlMs,
      });
    },

    async del(key: string): Promise<void> {
      entries.delete(key);
    },

    async setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
      if (ttlMs <= 0) return false;
      if (getActiveEntry(key)) return false;
      entries.set(key, {
        raw: JSON.stringify(value),
        expiresAtMs: now() + ttlMs,
      });
      return true;
    },
  };
}

export interface UpstashRestClientOptions {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_UPSTASH_TIMEOUT_MS = 2_000;

export async function executeUpstashCommand<T = unknown>(
  options: UpstashRestClientOptions,
  command: (string | number)[],
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPSTASH_TIMEOUT_MS;
  const endpoint = options.url.replace(/\/+$/, "");

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Upstash REST request failed with status ${response.status}`);
  }

  const body = (await response.json()) as { result?: T; error?: string };
  if (body.error) {
    throw new Error(`Upstash Redis error: ${body.error}`);
  }
  return body.result as T;
}

export function createUpstashRestCacheStore(options: UpstashRestClientOptions): CacheStore {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const result = await executeUpstashCommand<string | null>(options, ["GET", key]);
      if (result === null || result === undefined) return undefined;
      return JSON.parse(result) as T;
    },

    async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
      const safeTtlMs = Math.floor(ttlMs);
      if (safeTtlMs <= 0) {
        await executeUpstashCommand(options, ["DEL", key]);
        return;
      }
      await executeUpstashCommand(options, [
        "SET",
        key,
        JSON.stringify(value),
        "PX",
        safeTtlMs,
      ]);
    },

    async del(key: string): Promise<void> {
      await executeUpstashCommand(options, ["DEL", key]);
    },

    async setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
      const safeTtlMs = Math.floor(ttlMs);
      if (safeTtlMs <= 0) return false;
      const result = await executeUpstashCommand<string | null>(options, [
        "SET",
        key,
        JSON.stringify(value),
        "NX",
        "PX",
        safeTtlMs,
      ]);
      return result === "OK";
    },
  };
}

export function createRuntimeCacheStore({
  url = process.env.UPSTASH_REDIS_REST_URL,
  token = process.env.UPSTASH_REDIS_REST_TOKEN,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_UPSTASH_TIMEOUT_MS,
}: {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): CacheStore {
  if (url && token) {
    return createUpstashRestCacheStore({ url, token, fetchImpl, timeoutMs });
  }
  return createInMemoryCacheStore();
}

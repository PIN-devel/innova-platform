import { AppError, type CacheStore, type DistributedLock } from "@innova/auth-kit";
import type { RateGate, RateGateAcquireResult, RateGateLease } from "./types.js";

export class RateLimitError extends AppError {
  constructor(
    readonly retryAfterMs: number,
    message = "요청 한도(1 RPS)를 초과했습니다. 잠시 후 다시 시도해 주세요.",
  ) {
    super(429, "RATE_LIMITED", message);
  }
}

export class ExaoneRateGate implements RateGate {
  private inFlight = false;
  private lastRequestTime = 0;

  constructor(
    private readonly minIntervalMs = 1_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  tryAcquire(): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = this.now();
    const elapsed = now - this.lastRequestTime;

    if (this.inFlight) {
      const remaining = Math.max(this.minIntervalMs - elapsed, 200);
      return { allowed: false, retryAfterMs: Math.max(remaining, 1_000) };
    }

    if (elapsed < this.minIntervalMs) {
      const remaining = this.minIntervalMs - elapsed;
      return { allowed: false, retryAfterMs: Math.max(remaining, 100) };
    }

    this.inFlight = true;
    this.lastRequestTime = now;
    return { allowed: true };
  }

  release() {
    if (this.inFlight) {
      this.inFlight = false;
      this.lastRequestTime = this.now();
    }
  }

  reset() {
    this.inFlight = false;
    this.lastRequestTime = 0;
  }
}

const STREAM_LOCK_KEY = "lock:ai:exaone-stream";
const STREAM_COOLDOWN_KEY = "cooldown:ai:exaone-stream";

/**
 * Distributed 1-RPS and single-flight stream gate backed by `DistributedLock`
 * and `CacheStore.setIfAbsent` so concurrent Cloud Run instances share the same limit.
 */
export class DistributedExaoneRateGate implements RateGate {
  private readonly fallback: ExaoneRateGate;

  constructor(
    private readonly lock: DistributedLock,
    private readonly cache: CacheStore,
    private readonly minIntervalMs = 1_000,
    private readonly streamLockTtlMs = 65_000,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.fallback = new ExaoneRateGate(minIntervalMs, now);
  }

  async tryAcquire(): Promise<RateGateAcquireResult> {
    let lease: RateGateLease | null = null;
    try {
      lease = await this.lock.tryAcquire(STREAM_LOCK_KEY, this.streamLockTtlMs);
    } catch {
      return this.fallback.tryAcquire();
    }

    if (!lease) {
      return { allowed: false, retryAfterMs: Math.max(this.minIntervalMs, 1_000) };
    }

    try {
      const cooldownAcquired = await this.cache.setIfAbsent(
        STREAM_COOLDOWN_KEY,
        String(this.now()),
        this.minIntervalMs,
      );
      if (!cooldownAcquired) {
        try {
          await lease.release();
        } catch {
          // Best-effort lease release after cooldown rejection.
        }
        return { allowed: false, retryAfterMs: Math.max(this.minIntervalMs, 100) };
      }
      return { allowed: true, lease };
    } catch {
      return { allowed: true, lease };
    }
  }

  async release(lease?: RateGateLease): Promise<void> {
    if (lease) {
      try {
        await this.cache.set(STREAM_COOLDOWN_KEY, String(this.now()), this.minIntervalMs);
      } catch {
        // Best-effort cooldown refresh on stream completion.
      }
      try {
        await lease.release();
      } catch {
        // Best-effort lease release on stream completion.
      }
      return;
    }
    this.fallback.release();
  }
}

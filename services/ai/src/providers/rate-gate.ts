import { AppError } from "@innova/auth-kit";
import type { RateGate } from "./types.js";

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

  constructor(private readonly minIntervalMs = 1_000) {}

  tryAcquire(): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
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
    this.inFlight = false;
  }

  reset() {
    this.inFlight = false;
    this.lastRequestTime = 0;
  }
}

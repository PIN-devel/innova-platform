export const READINESS_TIMEOUT_MS = 3_000;

export async function runReadinessCheck(
  check: (signal: AbortSignal) => Promise<unknown>,
  timeoutMs = READINESS_TIMEOUT_MS,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => check(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new DOMException("Readiness check timed out", "TimeoutError");
          reject(error);
          controller.abort(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

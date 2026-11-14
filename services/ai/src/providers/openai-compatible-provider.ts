import { AppError } from "@innova/auth-kit";
import type { AiChatStreamEvent } from "@innova/contracts";
import type { AiChatProvider, AiChatStreamRequestParams, RateGate } from "./types.js";
import { RateLimitError } from "./rate-gate.js";

export interface OpenAiCompatibleProviderConfig {
  providerName?: string;
  modelId: string;
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  rateGate?: RateGate;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 1_200;
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;

const RATE_LIMIT_DIAGNOSTIC_HEADERS = [
  "x-second-rate-limit",
  "x-second-rate-limit-remaining",
  "x-minute-rate-limit",
  "x-minute-rate-limit-remaining",
  "x-day-rate-limit",
  "x-day-rate-limit-remaining",
  "retry-after",
  "retry-after-ms",
  "x-request-id",
] as const;

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    timer.unref?.();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class OpenAiCompatibleProvider implements AiChatProvider {
  readonly providerName: string;
  readonly modelId: string;
  readonly rateGate?: RateGate;
  protected readonly baseUrl: string;
  protected readonly apiKey?: string;
  protected readonly fetchImpl: typeof fetch;
  protected readonly maxRetries: number;
  protected readonly initialRetryDelayMs: number;
  protected readonly maxRetryDelayMs: number;
  protected readonly sleepImpl: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(config: OpenAiCompatibleProviderConfig) {
    this.providerName = config.providerName ?? "openai-compatible";
    this.modelId = config.modelId;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.rateGate = config.rateGate;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialRetryDelayMs = config.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS;
    this.maxRetryDelayMs = config.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.sleepImpl = config.sleepImpl ?? abortableSleep;
  }

  protected buildHeaders(): HeadersInit {
    if (!this.apiKey) {
      throw new AppError(500, "INTERNAL_ERROR", `${this.providerName} API 키가 설정되지 않았습니다.`);
    }
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
  }

  protected buildRequestBody(params: AiChatStreamRequestParams): Record<string, unknown> {
    return {
      model: this.modelId,
      messages: params.messages,
      stream: true,
      ...(params.reasoningEffort ? { reasoning_effort: params.reasoningEffort } : {}),
    };
  }

  protected getChatEndpoint(): URL {
    const trimmed = this.baseUrl.replace(/\/+$/, "");
    const suffix = trimmed.endsWith("/v1")
      ? "/chat/completions"
      : "/v1/chat/completions";
    return new URL(`${trimmed}${suffix}`);
  }

  protected extractRetryAfterMs(response: Response, errorBodyText?: string): number | undefined {
    const retryAfterMsHeader = response.headers.get("retry-after-ms");
    const retryAfterSecHeader = response.headers.get("retry-after");
    if (retryAfterMsHeader && !Number.isNaN(Number(retryAfterMsHeader))) {
      return Math.max(0, Math.round(Number(retryAfterMsHeader)));
    }
    if (retryAfterSecHeader && !Number.isNaN(Number(retryAfterSecHeader))) {
      return Math.max(0, Math.round(Number(retryAfterSecHeader) * 1_000));
    }
    if (errorBodyText) {
      try {
        const parsedBody = JSON.parse(errorBodyText) as {
          retryAfterMs?: unknown;
          retry_after?: unknown;
          error?: { retryAfterMs?: unknown; retry_after?: unknown };
        };
        const bodyRetryAfterMs = parsedBody.retryAfterMs ?? parsedBody.error?.retryAfterMs;
        const bodyRetryAfterSec = parsedBody.retry_after ?? parsedBody.error?.retry_after;
        if (
          typeof bodyRetryAfterMs === "number" &&
          Number.isFinite(bodyRetryAfterMs) &&
          bodyRetryAfterMs > 0
        ) {
          return Math.max(0, Math.round(bodyRetryAfterMs));
        }
        if (
          typeof bodyRetryAfterSec === "number" &&
          Number.isFinite(bodyRetryAfterSec) &&
          bodyRetryAfterSec > 0
        ) {
          return Math.max(0, Math.round(bodyRetryAfterSec * 1_000));
        }
      } catch {
        // Ignore non-JSON error bodies.
      }
    }
    return undefined;
  }

  protected collectRateLimitDiagnostics(
    response: Response,
    errorBodyText?: string,
  ): Record<string, unknown> {
    const headers: Record<string, string> = {};
    for (const key of RATE_LIMIT_DIAGNOSTIC_HEADERS) {
      const value = response.headers.get(key);
      if (value !== null) {
        headers[key] = value;
      }
    }
    return {
      upstreamStatus: response.status,
      headers,
      ...(errorBodyText ? { body: errorBodyText.slice(0, 300) } : {}),
    };
  }

  protected handleErrorStatus(response: Response, errorBodyText?: string): never {
    if (response.status === 400) {
      throw new AppError(
        400,
        "INVALID_INPUT",
        "입력 컨텍스트 한도를 초과했거나 요청 형식이 올바르지 않습니다.",
      );
    }
    if (response.status === 429) {
      const normalizedRetryAfterMs = this.extractRetryAfterMs(response, errorBodyText) ?? 1_000;
      const diagnostics = this.collectRateLimitDiagnostics(response, errorBodyText);
      const isDailyQuotaExhausted = response.headers.get("x-day-rate-limit-remaining") === "0";
      const message = isDailyQuotaExhausted
        ? "EXAONE API 일일 요청 한도를 초과했습니다. 내일 다시 시도해 주세요."
        : normalizedRetryAfterMs > 1_000
          ? `EXAONE API 요청 한도 또는 일시적 트래픽 제한(429)에 도달했습니다. 약 ${Math.ceil(normalizedRetryAfterMs / 1_000)}초 후 다시 시도해 주세요.`
          : "EXAONE API 요청 한도 또는 일시적 트래픽 제한(429)에 도달했습니다. 잠시 후 다시 시도해 주세요.";
      throw new RateLimitError(normalizedRetryAfterMs, message, diagnostics);
    }
    throw new AppError(502, "INTERNAL_ERROR", `${this.providerName} API 연동 중 오류가 발생했습니다.`);
  }

  async *streamChat(params: AiChatStreamRequestParams): AsyncGenerator<AiChatStreamEvent> {
    const endpoint = this.getChatEndpoint();
    const headers = this.buildHeaders();
    const body = JSON.stringify(this.buildRequestBody(params));

    let response: Response;
    let errorBodyText = "";
    let attempt = 0;

    while (true) {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers,
        body,
        signal: params.signal,
      });

      const isDailyQuotaExhausted = response.headers.get("x-day-rate-limit-remaining") === "0";
      if (response.status !== 429 || isDailyQuotaExhausted || attempt >= this.maxRetries) {
        break;
      }

      try {
        errorBodyText = await response.text();
      } catch {
        errorBodyText = "";
      }

      const headerOrBodyDelay = this.extractRetryAfterMs(response, errorBodyText);
      const exponentialBackoffMs = this.initialRetryDelayMs * 2 ** attempt;
      const delayMs = Math.min(
        Math.max(headerOrBodyDelay ?? 0, exponentialBackoffMs),
        this.maxRetryDelayMs,
      );
      attempt += 1;
      await this.sleepImpl(delayMs, params.signal);
    }

    if (!response.ok) {
      try {
        errorBodyText = await response.text();
      } catch {
        // ignore
      }
      this.handleErrorStatus(response, errorBodyText);
    }

    if (!response.body) {
      throw new AppError(502, "INTERNAL_ERROR", `${this.providerName} API 응답 본문이 비어 있습니다.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith("data:")) continue;

          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            yield { type: "done" };
            return;
          }

          const events = this.parseChunkPayload(payload);
          for (const event of events) {
            yield event;
          }
        }
      }

      if (buffer.trim()) {
        const line = buffer.trim();
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            yield { type: "done" };
            return;
          }
          const events = this.parseChunkPayload(payload);
          for (const event of events) {
            yield event;
          }
        }
      }

      yield { type: "done" };
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  protected parseChunkPayload(payload: string): AiChatStreamEvent[] {
    try {
      const parsed = JSON.parse(payload) as {
        choices?: Array<{
          delta?: {
            reasoning_content?: string | null;
            content?: string | null;
          };
        }>;
      };

      const delta = parsed.choices?.[0]?.delta;
      if (!delta) return [];

      const events: AiChatStreamEvent[] = [];
      if (delta.reasoning_content) {
        events.push({ type: "reasoning", delta: delta.reasoning_content });
      }
      if (delta.content) {
        events.push({ type: "content", delta: delta.content });
      }
      return events;
    } catch {
      return [];
    }
  }
}

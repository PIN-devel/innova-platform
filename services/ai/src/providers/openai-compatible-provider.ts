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
}

export class OpenAiCompatibleProvider implements AiChatProvider {
  readonly providerName: string;
  readonly modelId: string;
  readonly rateGate?: RateGate;
  protected readonly baseUrl: string;
  protected readonly apiKey?: string;
  protected readonly fetchImpl: typeof fetch;

  constructor(config: OpenAiCompatibleProviderConfig) {
    this.providerName = config.providerName ?? "openai-compatible";
    this.modelId = config.modelId;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.rateGate = config.rateGate;
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

  protected handleErrorStatus(response: Response, _errorBodyText?: string): never {
    if (response.status === 400) {
      throw new AppError(
        400,
        "INVALID_INPUT",
        "입력 컨텍스트 한도를 초과했거나 요청 형식이 올바르지 않습니다.",
      );
    }
    if (response.status === 429) {
      const retryAfterMsHeader = response.headers.get("retry-after-ms");
      const retryAfterSecHeader = response.headers.get("retry-after");
      let retryAfterMs = 1_000;
      if (retryAfterMsHeader && !Number.isNaN(Number(retryAfterMsHeader))) {
        retryAfterMs = Number(retryAfterMsHeader);
      } else if (retryAfterSecHeader && !Number.isNaN(Number(retryAfterSecHeader))) {
        retryAfterMs = Number(retryAfterSecHeader) * 1_000;
      }
      throw new RateLimitError(retryAfterMs);
    }
    throw new AppError(502, "INTERNAL_ERROR", `${this.providerName} API 연동 중 오류가 발생했습니다.`);
  }

  async *streamChat(params: AiChatStreamRequestParams): AsyncGenerator<AiChatStreamEvent> {
    const endpoint = this.getChatEndpoint();
    const headers = this.buildHeaders();
    const body = JSON.stringify(this.buildRequestBody(params));

    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers,
      body,
      signal: params.signal,
    });

    if (!response.ok) {
      let errorBodyText = "";
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

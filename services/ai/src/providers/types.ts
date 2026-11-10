import type {
  AiChatMessage,
  AiChatStreamEvent,
  AiReasoningEffort,
} from "@innova/contracts";

export interface AiChatStreamRequestParams {
  messages: AiChatMessage[];
  reasoningEffort?: AiReasoningEffort;
  signal?: AbortSignal;
}

export interface RateGate {
  tryAcquire(): { allowed: true } | { allowed: false; retryAfterMs: number };
  release(): void;
  reset?(): void;
}

export interface AiChatProvider {
  readonly providerName: string;
  readonly modelId: string;
  readonly rateGate?: RateGate;
  streamChat(params: AiChatStreamRequestParams): AsyncGenerator<AiChatStreamEvent>;
}

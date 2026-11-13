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

export interface RateGateLease {
  release(): Promise<boolean> | boolean;
}

export type RateGateAcquireResult =
  | { allowed: true; lease?: RateGateLease }
  | { allowed: false; retryAfterMs: number };

export interface RateGate {
  tryAcquire(): Promise<RateGateAcquireResult> | RateGateAcquireResult;
  release?(lease?: RateGateLease): Promise<void> | void;
  reset?(): Promise<void> | void;
}

export interface AiChatProvider {
  readonly providerName: string;
  readonly modelId: string;
  readonly rateGate?: RateGate;
  streamChat(params: AiChatStreamRequestParams): AsyncGenerator<AiChatStreamEvent>;
}

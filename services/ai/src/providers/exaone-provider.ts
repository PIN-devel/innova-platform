import { EXAONE_MODEL_ID, type AiChatStreamEvent } from "@innova/contracts";
import {
  OpenAiCompatibleProvider,
  type OpenAiCompatibleProviderConfig,
} from "./openai-compatible-provider.js";
import type { AiChatStreamRequestParams, RateGate } from "./types.js";
import { ExaoneRateGate } from "./rate-gate.js";

export interface ExaoneProviderConfig
  extends Partial<OpenAiCompatibleProviderConfig> {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  rateGate?: RateGate;
}

export class ExaoneChatProvider extends OpenAiCompatibleProvider {
  constructor(config: ExaoneProviderConfig = {}) {
    super({
      providerName: "exaone",
      modelId: EXAONE_MODEL_ID,
      baseUrl:
        config.baseUrl ??
        process.env.EXAONE_API_BASE_URL ??
        "https://api.exaone.ai/v1",
      apiKey: config.apiKey ?? process.env.EXAONE_API_KEY,
      fetchImpl: config.fetchImpl,
      rateGate: config.rateGate ?? new ExaoneRateGate(1_000),
      maxRetries: config.maxRetries,
      initialRetryDelayMs: config.initialRetryDelayMs,
      maxRetryDelayMs: config.maxRetryDelayMs,
      sleepImpl: config.sleepImpl,
    });
  }

  protected override buildRequestBody(
    params: AiChatStreamRequestParams,
  ): Record<string, unknown> {
    return {
      model: this.modelId,
      messages: params.messages,
      stream: true,
      temperature: 1.0,
      top_p: 0.95,
      chat_template_kwargs: { preserve_thinking: false },
      reasoning_effort: params.reasoningEffort ?? "low",
    };
  }

  override async *streamChat(
    params: AiChatStreamRequestParams,
  ): AsyncGenerator<AiChatStreamEvent> {
    let hasStartedContent = false;
    for await (const event of super.streamChat(params)) {
      if (event.type === "content") {
        if (!hasStartedContent) {
          const cleaned = event.delta.replace(/^\s+/, "");
          if (cleaned.length > 0) {
            hasStartedContent = true;
            yield { type: "content", delta: cleaned };
          }
        } else {
          yield event;
        }
      } else {
        yield event;
      }
    }
  }
}

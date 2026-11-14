import {
  aiChatStreamEventSchema,
  apiErrorResponseSchema,
  type AiChatMessage,
  type AiChatStreamEvent,
  type AiReasoningEffort,
  type ApiErrorCode,
} from "@innova/contracts";

export class AiStreamError extends Error {
  readonly status: number;
  readonly code?: ApiErrorCode;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    status: number,
    code?: ApiErrorCode,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AiStreamError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface StreamAiChatOptions {
  messages: AiChatMessage[];
  reasoningEffort?: AiReasoningEffort;
  signal?: AbortSignal;
  onEvent: (event: AiChatStreamEvent) => void;
}

export async function streamAiChat({
  messages,
  reasoningEffort = "low",
  signal,
  onEvent,
}: StreamAiChatOptions): Promise<void> {
  const response = await fetch("/api/ai/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    credentials: "include",
    body: JSON.stringify({ messages, reasoningEffort }),
    signal,
  });

  if (!response.ok) {
    const retryAfterMsHeader = response.headers.get("retry-after-ms");
    const retryAfterSecHeader = response.headers.get("retry-after");
    let retryAfterMs: number | undefined;
    if (retryAfterMsHeader && !Number.isNaN(Number(retryAfterMsHeader))) {
      retryAfterMs = Number(retryAfterMsHeader);
    } else if (retryAfterSecHeader && !Number.isNaN(Number(retryAfterSecHeader))) {
      retryAfterMs = Number(retryAfterSecHeader) * 1_000;
    }

    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      try {
        errorData = await response.text();
      } catch {
        errorData = undefined;
      }
    }

    const parsed = apiErrorResponseSchema.safeParse(errorData);
    const code = parsed.success ? parsed.data.error.code : undefined;
    let message = parsed.success ? parsed.data.error.message : undefined;

    if (!message) {
      if (response.status === 400) {
        message = "입력 컨텍스트 한도(524,288 토큰)를 초과했거나 요청이 올바르지 않습니다.";
      } else if (response.status === 429) {
        const seconds = retryAfterMs ? Math.ceil(retryAfterMs / 1_000) : 1;
        message = `요청 한도(1 RPS)를 초과했습니다. ${seconds}초 후 다시 시도해 주세요.`;
      } else if (response.status === 401) {
        message = "로그인이 필요합니다.";
      } else if (response.status === 403) {
        message = "AI Lab(K-EXAONE 2.5 PoC)은 관리자 전용 서비스입니다.";
      } else if (response.status === 502 || response.status === 504) {
        message = `서버 응답 시간이 초과되었거나 게이트웨이 오류가 발생했습니다 (${response.status}). 추론 강도를 '낮음(low)' 또는 '보통(medium)'으로 낮추어 다시 시도해 주세요.`;
      } else {
        message = `서버 응답 오류가 발생했습니다 (${response.status}).`;
      }
    }

    throw new AiStreamError(message, response.status, code, retryAfterMs);
  }

  if (!response.body) {
    throw new AiStreamError("스트리밍 응답 본문이 비어 있습니다.", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

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
      try {
        const rawJson = JSON.parse(payload);
        const parsedEvent = aiChatStreamEventSchema.safeParse(rawJson);
        if (parsedEvent.success) {
          const event = parsedEvent.data;
          if (event.type === "error") {
            throw new AiStreamError(event.message, 500, event.code, event.retryAfterMs);
          }
          onEvent(event);
          if (event.type === "done") {
            return;
          }
        }
      } catch (err) {
        if (err instanceof AiStreamError) throw err;
        // Ignore JSON chunk syntax issues
      }
    }
  }

  onEvent({ type: "done" });
}

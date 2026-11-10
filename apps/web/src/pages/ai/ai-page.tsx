import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { AiReasoningEffort } from "@innova/contracts";
import { useAiChat } from "@/features/ai-chat/use-ai-chat";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";

const REASONING_EFFORT_OPTIONS: Array<{ value: AiReasoningEffort; label: string }> = [
  { value: "low", label: "낮음 (low)" },
  { value: "medium", label: "보통 (medium)" },
  { value: "high", label: "높음 (high)" },
  { value: "max", label: "최대 (max)" },
];

export default function AiPage() {
  const {
    messages,
    isStreaming,
    reasoningEffort,
    setReasoningEffort,
    sendMessage,
    stopStreaming,
    resetChat,
  } = useAiChat();

  const [input, setInput] = useState("");
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to feed bottom when message content arrives or changes
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    void sendMessage(text);
  };

  const handleInputChange = (value: string, element: HTMLTextAreaElement) => {
    setInput(value);
    element.style.height = "auto";
    const maxHeight = 112; // ~4 lines
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-4 sm:py-6">
      <Card className="flex flex-col shadow-sm">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-primary">
                AI Lab
              </span>
              <span className="text-muted-foreground">·</span>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                K-EXAONE 2.5 실시간 스트리밍 채팅 PoC
              </h1>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                k-exaone_v2.5
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>추론 강도:</span>
                <select
                  aria-label="추론 강도 (reasoning_effort)"
                  value={reasoningEffort}
                  onChange={(e) => setReasoningEffort(e.target.value as AiReasoningEffort)}
                  disabled={isStreaming}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  {REASONING_EFFORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                variant="outline"
                size="sm"
                onClick={resetChat}
                disabled={isStreaming || messages.length === 0}
              >
                대화 초기화
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-[420px] max-h-[600px] flex-col overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-12 text-center text-muted-foreground">
              <p className="text-sm font-medium">
                LG AI연구원의 K-EXAONE 2.5 API 기반 한국어 실시간 스트리밍 대화 검증 환경입니다.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                1 RPS(초당 1회) 제한 정책에 따라 요청이 순차적으로 처리되며, 첫 토큰 도달 속도(TTFT)와 추론 품질을 바로 체감할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    {msg.role === "user" ? "나 (어드민)" : "EXAONE 2.5"}
                  </div>

                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-card-foreground shadow-xs"
                    }`}
                  >
                    {msg.status === "streaming" && !msg.content ? (
                      <div
                        role="status"
                        aria-live="polite"
                        className="flex items-center gap-2 py-0.5 text-muted-foreground"
                      >
                        <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
                        <span>EXAONE 2.5가 생각하고 있습니다…</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}

                    {msg.status === "aborted" && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        (생성이 중지되었습니다)
                      </p>
                    )}

                    {msg.status === "error" && msg.errorMessage && (
                      <div
                        role="alert"
                        className="mt-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive"
                      >
                        {msg.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={feedEndRef} />
            </div>
          )}
        </CardContent>

        <div className="border-t border-border p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => handleInputChange(e.target.value, e.currentTarget)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder={
                isStreaming
                  ? "답변 생성 중에는 새 메시지를 작성할 수 없습니다."
                  : "메시지를 입력하세요 (Enter: 전송, Shift+Enter: 줄바꿈)"
              }
              className="max-h-28 min-h-[44px] w-full resize-none overflow-y-auto rounded-lg border border-input bg-background p-3 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                K-EXAONE 2.5 API (1 RPS 직렬화, 제로 영속성)
              </span>
              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={stopStreaming}
                  >
                    생성 중지
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!input.trim()}
                  >
                    전송
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}

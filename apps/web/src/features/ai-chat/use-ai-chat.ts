import { useCallback, useEffect, useRef, useState } from "react";
import type { AiChatMessage, AiReasoningEffort } from "@innova/contracts";
import { streamAiChat } from "@/entities/ai/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "done" | "aborted" | "error";
  errorMessage?: string;
}

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<AiReasoningEffort>("max");
  const abortControllerRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(1);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isStreaming) return;

      const seq = nextIdRef.current++;
      const userMessageId = `user-${Date.now()}-${seq}`;
      const assistantMessageId = `assistant-${Date.now()}-${seq}`;

      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: text,
      };

      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        status: "streaming",
      };

      const validHistory = messages.filter(
        (m) => m.status !== "error" && m.content.trim().length > 0,
      );
      const updatedHistory: ChatMessage[] = [...validHistory, userMessage];
      setMessages([... messages, userMessage, assistantMessage]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Prepare payload messages
      const apiMessages: AiChatMessage[] = updatedHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        await streamAiChat({
          messages: apiMessages,
          reasoningEffort,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "content") {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: msg.content + event.delta }
                    : msg,
                ),
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, status: "done" }
                    : msg,
                ),
              );
            }
          },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    status: "aborted",
                    content: msg.content || "(응답 생성이 중지되었습니다.)",
                  }
                : msg,
            ),
          );
        } else {
          const message =
            error instanceof Error
              ? error.message
              : "응답을 받아오지 못했습니다. 잠시 후 다시 시도해 주세요.";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, status: "error", errorMessage: message }
                : msg,
            ),
          );
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsStreaming(false);
      }
    },
    [isStreaming, messages, reasoningEffort],
  );

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const resetChat = useCallback(() => {
    if (isStreaming) return;
    setMessages([]);
  }, [isStreaming]);

  return {
    messages,
    isStreaming,
    reasoningEffort,
    setReasoningEffort,
    sendMessage,
    stopStreaming,
    resetChat,
  };
}

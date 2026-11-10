import { z } from "zod";
import { apiErrorCodeSchema } from "./error.js";

export const EXAONE_MODEL_ID = "k-exaone_v2.5" as const;

export const aiReasoningEffortSchema = z.enum(["low", "medium", "high", "max"]);

export const aiChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(32_000),
});

export const aiChatStreamRequestSchema = z.object({
  messages: z.array(aiChatMessageSchema).min(1).max(100),
  reasoningEffort: aiReasoningEffortSchema.optional().default("max"),
});

export const aiChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reasoning"),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("content"),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("done"),
  }),
  z.object({
    type: z.literal("error"),
    code: apiErrorCodeSchema,
    message: z.string(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  }),
]);

export type AiReasoningEffort = z.infer<typeof aiReasoningEffortSchema>;
export type AiChatMessage = z.infer<typeof aiChatMessageSchema>;
export type AiChatStreamRequest = z.infer<typeof aiChatStreamRequestSchema>;
export type AiChatStreamEvent = z.infer<typeof aiChatStreamEventSchema>;

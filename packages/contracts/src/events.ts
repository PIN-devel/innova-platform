import { z } from "zod";
import { approvalStatusSchema, userRoleSchema } from "./auth.js";

export const domainEventTypeSchema = z.enum(["auth.user.status-changed"]);

export const userStatusChangedPayloadSchema = z.object({
  userId: z.string().min(1),
  email: z.email(),
  previousStatus: approvalStatusSchema,
  currentStatus: approvalStatusSchema,
  role: userRoleSchema,
  changedAt: z.iso.datetime(),
});

export const domainEventEnvelopeSchema = z.object({
  eventId: z.uuid(),
  eventType: domainEventTypeSchema,
  occurredAt: z.iso.datetime(),
  producer: z.string().min(1),
  payload: userStatusChangedPayloadSchema,
});

export const pubSubPushEnvelopeSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    messageId: z.string().min(1),
    publishTime: z.string().optional(),
    attributes: z.record(z.string(), z.string()).optional(),
  }),
  subscription: z.string().min(1),
  deliveryAttempt: z.number().int().positive().optional(),
});

export const deadLetterRecordSchema = z.object({
  eventId: z.string().optional(),
  messageId: z.string().min(1),
  subscription: z.string().min(1),
  reason: z.string().min(1),
  attempts: z.number().int().positive(),
  rawPayload: z.string(),
  failedAt: z.iso.datetime(),
});

export type DomainEventType = z.infer<typeof domainEventTypeSchema>;
export type UserStatusChangedPayload = z.infer<typeof userStatusChangedPayloadSchema>;
export type DomainEventEnvelope = z.infer<typeof domainEventEnvelopeSchema>;
export type PubSubPushEnvelope = z.infer<typeof pubSubPushEnvelopeSchema>;
export type DeadLetterRecord = z.infer<typeof deadLetterRecordSchema>;

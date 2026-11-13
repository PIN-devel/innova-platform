import { adminApprovalResponseSchema, adminRejectionResponseSchema, pendingUsersResponseSchema, type DomainEventEnvelope } from "@innova/contracts";
import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  AppError,
  userCacheKey,
  type CacheStore,
  type DistributedLock,
  type EventPublisher,
} from "@innova/auth-kit";
import type { UserRecord, UserRepository } from "../db/users.js";

const USER_STATUS_LOCK_TTL_MS = 5_000;
const EVENT_PRODUCER = "innova-auth-api";

function userStatusLockKey(userId: string): string {
  return `lock:auth:user-status:${userId}`;
}

async function publishUserStatusChanged(
  eventPublisher: EventPublisher | undefined,
  user: UserRecord,
  previousStatus: "pending" | "approved" | "rejected",
  logger: FastifyBaseLogger,
): Promise<void> {
  if (!eventPublisher) return;
  const now = new Date().toISOString();
  const event: DomainEventEnvelope = {
    eventId: randomUUID(),
    eventType: "auth.user.status-changed",
    occurredAt: now,
    producer: EVENT_PRODUCER,
    payload: {
      userId: user.id,
      email: user.email,
      previousStatus,
      currentStatus: user.approvalStatus,
      role: user.role,
      changedAt: now,
    },
  };
  try {
    await eventPublisher.publish(event);
  } catch (error) {
    logger.error(
      { event: "auth.user.status_changed_publish_failed", userId: user.id, eventId: event.eventId, err: error },
      "Failed to publish user status change event",
    );
  }
}

export const adminUserRoutes: FastifyPluginAsync<{
  users: UserRepository;
  requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  cacheStore?: CacheStore;
  distributedLock?: DistributedLock;
  eventPublisher?: EventPublisher;
}> = async (app, { users, requireAdmin, cacheStore, distributedLock, eventPublisher }) => {
  const runWithUserLock = async <T>(userId: string, fn: () => Promise<T>): Promise<T> => {
    if (!distributedLock) {
      return fn();
    }
    const result = await distributedLock.withLock(
      userStatusLockKey(userId),
      USER_STATUS_LOCK_TTL_MS,
      fn,
    );
    if (!result.acquired) {
      throw new AppError(409, "CONFLICT", "User status update is already in progress");
    }
    return result.value;
  };

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store").header("Vary", "Cookie");
  });
  app.addHook("preHandler", requireAdmin);

  app.get("/users/pending", async () => {
    const pending = await users.findPending();
    return pendingUsersResponseSchema.parse({ users: pending });
  });

  app.post<{ Params: { id: string } }>("/users/:id/approve", async (request) => {
    return runWithUserLock(request.params.id, async () => {
      const approved = await users.approvePending(request.params.id);
      const user = approved ?? await users.findById(request.params.id);
      if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
      if (user.approvalStatus !== "approved") {
        throw new AppError(409, "BUSINESS_RULE_VIOLATION", "Only pending users can be approved");
      }

      if (approved) {
        await cacheStore?.del(userCacheKey(user.id)).catch(() => undefined);
        await publishUserStatusChanged(eventPublisher, approved, "pending", request.log);
      }

      return adminApprovalResponseSchema.parse({
        user: { id: user.id, email: user.email, approvalStatus: user.approvalStatus, role: user.role },
      });
    });
  });

  app.post<{ Params: { id: string } }>("/users/:id/reject", async (request) => {
    return runWithUserLock(request.params.id, async () => {
      const rejected = await users.rejectPending(request.params.id);
      if (!rejected) {
        const user = await users.findById(request.params.id);
        if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
        throw new AppError(409, "BUSINESS_RULE_VIOLATION", "Only pending users can be rejected");
      }
      await cacheStore?.del(userCacheKey(rejected.id)).catch(() => undefined);
      await publishUserStatusChanged(eventPublisher, rejected, "pending", request.log);

      return adminRejectionResponseSchema.parse({
        user: { id: rejected.id, email: rejected.email, approvalStatus: rejected.approvalStatus, role: rejected.role },
      });
    });
  });
};

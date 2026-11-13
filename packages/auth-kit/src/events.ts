import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  domainEventEnvelopeSchema,
  pubSubPushEnvelopeSchema,
  type DeadLetterRecord,
  type DomainEventEnvelope,
  type PubSubPushEnvelope,
} from "@innova/contracts";
import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import type { CacheStore } from "./cache.js";
import { AppError, invalidInput } from "./errors.js";

export const INTERNAL_EVENT_TOKEN_HEADER = "x-internal-event-token";
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INFLIGHT_TTL_MS = 30_000;
const DEFAULT_MAX_DELIVERY_ATTEMPTS = 5;
const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const TOKEN_EXPIRY_SAFETY_MS = 60_000;
const METADATA_TIMEOUT_MS = 2_000;

export interface EventPublisher {
  publish(event: DomainEventEnvelope): Promise<{ messageId: string }>;
}

export interface DeadLetterSink {
  record(entry: DeadLetterRecord): Promise<void>;
  list?(): Promise<DeadLetterRecord[]>;
}

export interface EventProcessingResult {
  status: "processed" | "duplicate_ignored" | "dead_lettered";
  eventId: string;
}

export function createInMemoryDeadLetterSink(): DeadLetterSink & {
  list(): Promise<DeadLetterRecord[]>;
} {
  const entries: DeadLetterRecord[] = [];
  return {
    async record(entry) {
      entries.push(entry);
    },
    async list() {
      return [...entries];
    },
  };
}

export function createNoopEventPublisher(): EventPublisher {
  return {
    async publish() {
      return { messageId: randomUUID() };
    },
  };
}

export type GcpTokenProvider = () => Promise<string>;

export function createGcpMetadataTokenProvider({
  metadataUrl = METADATA_TOKEN_URL,
  fetchImpl = fetch,
  now = () => Date.now(),
}: {
  metadataUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}): GcpTokenProvider {
  let cachedToken: string | undefined;
  let expiresAtMs = 0;

  return async () => {
    if (cachedToken && now() < expiresAtMs) {
      return cachedToken;
    }
    const response = await fetchImpl(metadataUrl, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Metadata server token error: status ${response.status}`);
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new Error("Metadata server returned empty access_token");
    }
    cachedToken = body.access_token;
    const ttlMs = Math.max(0, (body.expires_in ?? 300) * 1000 - TOKEN_EXPIRY_SAFETY_MS);
    expiresAtMs = now() + ttlMs;
    return cachedToken;
  };
}

export function createGcpPubSubPublisher({
  projectId,
  topicId,
  tokenProvider = createGcpMetadataTokenProvider(),
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: {
  projectId: string;
  topicId: string;
  tokenProvider?: GcpTokenProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): EventPublisher {
  if (!projectId) throw new Error("PUBSUB_PROJECT_ID is required");
  if (!topicId) throw new Error("PUBSUB_USER_EVENTS_TOPIC is required");

  const endpoint = `https://pubsub.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}:publish`;

  return {
    async publish(event) {
      const accessToken = await tokenProvider();
      const encodedData = Buffer.from(JSON.stringify(event), "utf8").toString("base64");
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              data: encodedData,
              attributes: {
                eventId: event.eventId,
                eventType: event.eventType,
                producer: event.producer,
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Cloud Pub/Sub publish failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { messageIds?: string[] };
      const messageId = payload.messageIds?.[0];
      if (!messageId) {
        throw new Error("Cloud Pub/Sub publish returned no messageId");
      }
      return { messageId };
    },
  };
}

export interface HttpFanoutSubscriber {
  subscription: string;
  url: string;
}

export function createHttpFanoutPublisher({
  subscribers,
  internalToken,
  fetchImpl = fetch,
  maxAttempts = DEFAULT_MAX_DELIVERY_ATTEMPTS,
  baseDelayMs = 25,
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  deadLetterSink,
  logger,
}: {
  subscribers: HttpFanoutSubscriber[];
  internalToken?: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  deadLetterSink?: DeadLetterSink;
  logger?: FastifyBaseLogger;
}): EventPublisher {
  async function deliverToSubscriber(
    subscriber: HttpFanoutSubscriber,
    event: DomainEventEnvelope,
    messageId: string,
    encodedData: string,
    publishTime: string,
  ): Promise<void> {
    let lastError = "Unknown delivery error";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const envelope: PubSubPushEnvelope = {
        message: {
          data: encodedData,
          messageId,
          publishTime,
          attributes: {
            eventId: event.eventId,
            eventType: event.eventType,
            producer: event.producer,
          },
        },
        subscription: subscriber.subscription,
        deliveryAttempt: attempt,
      };

      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (internalToken) {
          headers[INTERNAL_EVENT_TOKEN_HEADER] = internalToken;
        }
        const response = await fetchImpl(subscriber.url, {
          method: "POST",
          headers,
          body: JSON.stringify(envelope),
          signal: AbortSignal.timeout(5_000),
        });

        if (response.ok) {
          return;
        }

        lastError = `HTTP ${response.status}`;
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) {
          await deadLetterSink?.record({
            eventId: event.eventId,
            messageId,
            subscription: subscriber.subscription,
            reason: `Non-retryable status ${response.status}`,
            attempts: attempt,
            rawPayload: encodedData,
            failedAt: new Date().toISOString(),
          });
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }

    logger?.error(
      {
        event: "events.fanout.dlq",
        eventId: event.eventId,
        subscription: subscriber.subscription,
        reason: lastError,
        attempts: maxAttempts,
      },
      "Fan-out delivery exhausted retries and moved to DLQ",
    );

    await deadLetterSink?.record({
      eventId: event.eventId,
      messageId,
      subscription: subscriber.subscription,
      reason: lastError,
      attempts: maxAttempts,
      rawPayload: encodedData,
      failedAt: new Date().toISOString(),
    });
  }

  return {
    async publish(event) {
      const messageId = randomUUID();
      const publishTime = new Date().toISOString();
      const encodedData = Buffer.from(JSON.stringify(event), "utf8").toString("base64");

      await Promise.allSettled(
        subscribers.map((subscriber) =>
          deliverToSubscriber(subscriber, event, messageId, encodedData, publishTime),
        ),
      );

      return { messageId };
    },
  };
}

export function createRuntimeEventPublisher({
  projectId = process.env.PUBSUB_PROJECT_ID,
  topicId = process.env.PUBSUB_USER_EVENTS_TOPIC,
  subscriberUrlsRaw = process.env.EVENT_SUBSCRIBER_URLS,
  internalToken = process.env.INTERNAL_EVENT_TOKEN,
  deadLetterSink,
  fetchImpl = fetch,
  logger,
}: {
  projectId?: string;
  topicId?: string;
  subscriberUrlsRaw?: string;
  internalToken?: string;
  deadLetterSink?: DeadLetterSink;
  fetchImpl?: typeof fetch;
  logger?: FastifyBaseLogger;
} = {}): EventPublisher {
  if (projectId && topicId) {
    return createGcpPubSubPublisher({ projectId, topicId, fetchImpl });
  }

  const urls = (subscriberUrlsRaw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (urls.length > 0) {
    return createHttpFanoutPublisher({
      subscribers: urls.map((url, index) => ({
        subscription: `local-fanout-${index + 1}`,
        url,
      })),
      internalToken,
      deadLetterSink,
      fetchImpl,
      logger,
    });
  }

  return createNoopEventPublisher();
}

export function verifyInternalEventToken(
  provided: string | string[] | undefined,
  expected: string | undefined,
): void {
  if (!expected) return;
  const candidate = Array.isArray(provided) ? provided[0] : provided;
  if (!candidate) {
    throw new AppError(401, "UNAUTHORIZED", "Missing internal event token");
  }
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid internal event token");
  }
}

export interface PubSubPushRouteOptions {
  consumerName: string;
  cacheStore: CacheStore;
  internalToken?: string;
  maxDeliveryAttempts?: number;
  idempotencyTtlMs?: number;
  deadLetterSink?: DeadLetterSink;
  onEvent: (event: DomainEventEnvelope, context: { messageId: string; subscription: string }) => Promise<void>;
}

export function decodePubSubEvent(envelope: PubSubPushEnvelope): DomainEventEnvelope {
  let decodedJson: unknown;
  try {
    const raw = Buffer.from(envelope.message.data, "base64").toString("utf8");
    decodedJson = JSON.parse(raw);
  } catch {
    throw invalidInput("Invalid base64 JSON event payload");
  }

  const parsedEvent = domainEventEnvelopeSchema.safeParse(decodedJson);
  if (!parsedEvent.success) {
    throw invalidInput("Invalid domain event envelope");
  }
  return parsedEvent.data;
}

export const pubSubPushRoutes: FastifyPluginAsync<PubSubPushRouteOptions> = async (
  app,
  {
    consumerName,
    cacheStore,
    internalToken,
    maxDeliveryAttempts = DEFAULT_MAX_DELIVERY_ATTEMPTS,
    idempotencyTtlMs = DEFAULT_IDEMPOTENCY_TTL_MS,
    deadLetterSink,
    onEvent,
  },
) => {
  app.addHook("onRequest", async (request) => {
    verifyInternalEventToken(request.headers[INTERNAL_EVENT_TOKEN_HEADER], internalToken);
  });

  app.post("/user-status", async (request, reply) => {
    const parsedEnvelope = pubSubPushEnvelopeSchema.safeParse(request.body);
    if (!parsedEnvelope.success) {
      throw invalidInput("Invalid Pub/Sub push envelope");
    }

    const envelope = parsedEnvelope.data;
    const event = decodePubSubEvent(envelope);
    const doneKey = `event:processed:${consumerName}:${event.eventId}`;
    const inFlightKey = `event:inflight:${consumerName}:${event.eventId}`;

    const alreadyDone = await cacheStore.get<string>(doneKey).catch(() => undefined);
    if (alreadyDone === "1") {
      const result: EventProcessingResult = {
        status: "duplicate_ignored",
        eventId: event.eventId,
      };
      return reply.code(200).send(result);
    }

    const acquiredInFlight = await cacheStore
      .setIfAbsent(inFlightKey, "1", DEFAULT_INFLIGHT_TTL_MS)
      .catch(() => true);
    if (!acquiredInFlight) {
      return reply.code(503).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "Event processing is already in progress",
        },
      });
    }

    try {
      await onEvent(event, {
        messageId: envelope.message.messageId,
        subscription: envelope.subscription,
      });
      await cacheStore.set(doneKey, "1", idempotencyTtlMs).catch(() => undefined);
      await cacheStore.del(inFlightKey).catch(() => undefined);
      const result: EventProcessingResult = {
        status: "processed",
        eventId: event.eventId,
      };
      return reply.code(200).send(result);
    } catch (error) {
      await cacheStore.del(inFlightKey).catch(() => undefined);
      const attempts = envelope.deliveryAttempt ?? 1;
      const reason = error instanceof Error ? error.message : "Event handler failed";

      if (attempts >= maxDeliveryAttempts) {
        await deadLetterSink?.record({
          eventId: event.eventId,
          messageId: envelope.message.messageId,
          subscription: envelope.subscription,
          reason,
          attempts,
          rawPayload: envelope.message.data,
          failedAt: new Date().toISOString(),
        });
        request.log.error(
          {
            event: "events.consumer.dead_lettered",
            consumerName,
            eventId: event.eventId,
            attempts,
            reason,
          },
          "Event exceeded max delivery attempts and was dead-lettered",
        );
        const result: EventProcessingResult = {
          status: "dead_lettered",
          eventId: event.eventId,
        };
        return reply.code(202).send(result);
      }

      request.log.warn(
        {
          event: "events.consumer.retryable_error",
          consumerName,
          eventId: event.eventId,
          attempts,
          reason,
        },
        "Event processing failed; requesting broker retry",
      );
      return reply.code(503).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "Temporary event processing failure",
        },
      });
    }
  });

  app.post("/dlq", async (request, reply) => {
    const parsedEnvelope = pubSubPushEnvelopeSchema.safeParse(request.body);
    if (!parsedEnvelope.success) {
      throw invalidInput("Invalid Pub/Sub DLQ push envelope");
    }
    const envelope = parsedEnvelope.data;
    let eventId: string | undefined;
    try {
      eventId = decodePubSubEvent(envelope).eventId;
    } catch {
      eventId = envelope.message.attributes?.eventId;
    }

    await deadLetterSink?.record({
      eventId,
      messageId: envelope.message.messageId,
      subscription: envelope.subscription,
      reason: "Routed to Pub/Sub DLQ",
      attempts: envelope.deliveryAttempt ?? maxDeliveryAttempts,
      rawPayload: envelope.message.data,
      failedAt: new Date().toISOString(),
    });

    request.log.error(
      {
        event: "events.dlq.received",
        consumerName,
        eventId,
        messageId: envelope.message.messageId,
        subscription: envelope.subscription,
      },
      "Received message on DLQ push endpoint",
    );

    return reply.code(202).send({ status: "dead_lettered", messageId: envelope.message.messageId });
  });
};

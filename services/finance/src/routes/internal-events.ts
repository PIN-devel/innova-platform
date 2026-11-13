import type { FastifyPluginAsync } from "fastify";
import {
  pubSubPushRoutes,
  userCacheKey,
  type CacheStore,
  type DeadLetterSink,
} from "@innova/auth-kit";
import type { PdfPasswordRepository } from "../db/finance-pdf-password.js";

export const internalEventRoutes: FastifyPluginAsync<{
  cacheStore: CacheStore;
  pdfPasswordRepository?: PdfPasswordRepository;
  internalToken?: string;
  deadLetterSink?: DeadLetterSink;
}> = async (app, { cacheStore, pdfPasswordRepository, internalToken, deadLetterSink }) => {
  await app.register(pubSubPushRoutes, {
    consumerName: "innova-finance-api",
    cacheStore,
    internalToken,
    deadLetterSink,
    onEvent: async (event) => {
      await cacheStore.del(userCacheKey(event.payload.userId));
      if (event.payload.currentStatus === "rejected") {
        await pdfPasswordRepository?.revokePendingAttempts?.(event.payload.userId);
      }
    },
  });
};

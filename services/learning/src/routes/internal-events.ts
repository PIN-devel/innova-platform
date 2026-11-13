import type { FastifyPluginAsync } from "fastify";
import {
  pubSubPushRoutes,
  userCacheKey,
  type CacheStore,
  type DeadLetterSink,
} from "@innova/auth-kit";

export const internalEventRoutes: FastifyPluginAsync<{
  cacheStore: CacheStore;
  internalToken?: string;
  deadLetterSink?: DeadLetterSink;
}> = async (app, { cacheStore, internalToken, deadLetterSink }) => {
  await app.register(pubSubPushRoutes, {
    consumerName: "innova-learning-api",
    cacheStore,
    internalToken,
    deadLetterSink,
    onEvent: async (event) => {
      await cacheStore.del(userCacheKey(event.payload.userId));
    },
  });
};

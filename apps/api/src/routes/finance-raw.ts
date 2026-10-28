import {createHash} from 'node:crypto';
import {AUTH_COOKIE_NAME} from '../auth.js';
import type { FastifyInstance, FastifyRequest } from "fastify";
import { financeRawImportSchema, financeRawResultSchema, financeRawFilesSchema, financeRawReadbackSchema } from "@innova/contracts";
import type { FinanceRawRepository } from "../db/finance-raw.js";
import { AppError, invalidInput } from "../errors.js";

export async function financeRawRoutes(app: FastifyInstance, { repository, requireAuth, allowedOrigins }: {
  repository: FinanceRawRepository; requireAuth: (request: FastifyRequest) => Promise<void>; allowedOrigins: string[];
}) {
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await requireAuth(request);
    if (request.headers["x-expected-user"] !== request.authUser!.id) throw new AppError(403, "FORBIDDEN", "Session changed");
    if (request.headers["sec-fetch-site"] === "cross-site") throw new AppError(403, "FORBIDDEN", "Origin not allowed");
    if (request.method !== "GET" && (!allowedOrigins.includes(String(request.headers.origin)) || request.headers["x-finance-request"] !== "1" || !request.headers["content-type"]?.startsWith("application/json"))) throw new AppError(403, "FORBIDDEN", "Origin not allowed");
  });
  // Never allow parser/DB/crypto exception objects to reach the global logger.
  app.setErrorHandler((error, _request, reply) => {
    const inputFailure = typeof error === "object" && error !== null && "code" in error && ["FST_ERR_CTP_INVALID_JSON_BODY", "FST_ERR_CTP_INVALID_JSON", "FST_ERR_CTP_EMPTY_JSON_BODY", "FST_ERR_CTP_BODY_TOO_LARGE"].includes(String(error.code));
    const safe = error instanceof AppError ? error : inputFailure ? invalidInput("Invalid Raw request") : new AppError(500, "INTERNAL_ERROR", "Raw operation failed");
    return reply.code(safe.statusCode).send({ error: { code: safe.code, message: safe.message } });
  });
  app.get("/files", async request => financeRawFilesSchema.parse({ files: await repository.list(request.authUser!.id) }));
  app.get<{ Params: { id: string } }>("/files/:id", async request => {
    if (!/^[a-f0-9-]{36}$/i.test(request.params.id)) throw new AppError(404, "NOT_FOUND", "Raw file not found");
    const found = await repository.find(request.authUser!.id, request.params.id);
    if (!found) throw new AppError(404, "NOT_FOUND", "Raw file not found");
    return financeRawReadbackSchema.parse(found);
  });
  app.post("/imports", { bodyLimit: 8 * 1024 * 1024 }, async request => {
    const parsed = financeRawImportSchema.safeParse(request.body);
    if (!parsed.success) throw invalidInput("Invalid Raw document");
    return financeRawResultSchema.parse(await repository.import(request.authUser!.id, parsed.data,{sessionHash:createHash('sha256').update(request.cookies[AUTH_COOKIE_NAME]??'').digest('hex')}));
  });
}

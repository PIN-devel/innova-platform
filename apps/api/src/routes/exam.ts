import { ExamBankSchema, toValidationErrorDetails } from "@innova/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { DEFAULT_EXAM_BANK_ID, type ExamRepository } from "../db/exam.js";
import { AppError, invalidInput } from "../errors.js";

export const examRoutes: FastifyPluginAsync<{ repository: ExamRepository; requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> }> = async (app, { repository, requireAuth }) => {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store").header("Vary", "Cookie");
  });
  app.addHook("preHandler", requireAuth);
  app.get("/banks/default", async (_request, reply) => {
    const record = await repository.find(DEFAULT_EXAM_BANK_ID);
    if (!record) throw new AppError(404, "NOT_FOUND", "Default exam bank is not seeded");
    return record;
  });
  app.get<{ Params: { id: string } }>("/banks/:id", async (request, reply) => {
    const record = await repository.find(request.params.id);
    if (!record) throw new AppError(404, "NOT_FOUND", "Exam bank not found");
    return record;
  });
  app.post("/banks", async (request, reply) => {
    const parsed = ExamBankSchema.safeParse(request.body);
    if (!parsed.success) throw invalidInput("Invalid exam bank", toValidationErrorDetails(parsed.error, request.body));
    return reply.code(201).send(await repository.create(parsed.data));
  });
};

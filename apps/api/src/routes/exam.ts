import { ExamBankSchema } from "@innova/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { DEFAULT_EXAM_BANK_ID, type ExamRepository } from "../db/exam.js";

export const examRoutes: FastifyPluginAsync<{ repository: ExamRepository; requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> }> = async (app, { repository, requireAuth }) => {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store").header("Vary", "Cookie");
  });
  app.addHook("preHandler", requireAuth);
  app.get("/banks/default", async (_request, reply) => {
    const record = await repository.find(DEFAULT_EXAM_BANK_ID);
    return record ?? reply.code(404).send({ message: "Default exam bank is not seeded" });
  });
  app.get<{ Params: { id: string } }>("/banks/:id", async (request, reply) => {
    const record = await repository.find(request.params.id);
    return record ?? reply.code(404).send({ message: "Exam bank not found" });
  });
  app.post("/banks", async (request, reply) => {
    const parsed = ExamBankSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid exam bank", issues: parsed.error.issues });
    return reply.code(201).send(await repository.create(parsed.data));
  });
};

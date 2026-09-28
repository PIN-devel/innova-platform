import { adminApprovalResponseSchema, adminRejectionResponseSchema, pendingUsersResponseSchema } from "@innova/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { UserRepository } from "../db/users.js";
import { AppError } from "../errors.js";

export const adminUserRoutes: FastifyPluginAsync<{
  users: UserRepository;
  requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
}> = async (app, { users, requireAdmin }) => {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store").header("Vary", "Cookie");
  });
  app.addHook("preHandler", requireAdmin);

  app.get("/users/pending", async () => {
    const pending = await users.findPending();
    return pendingUsersResponseSchema.parse({ users: pending });
  });

  app.post<{ Params: { id: string } }>("/users/:id/approve", async (request) => {
    const approved = await users.approvePending(request.params.id);
    const user = approved ?? await users.findById(request.params.id);
    if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
    if (user.approvalStatus !== "approved") {
      throw new AppError(409, "BUSINESS_RULE_VIOLATION", "Only pending users can be approved");
    }

    return adminApprovalResponseSchema.parse({
      user: { id: user.id, email: user.email, approvalStatus: user.approvalStatus, role: user.role },
    });
  });

  app.post<{ Params: { id: string } }>("/users/:id/reject", async (request) => {
    const rejected = await users.rejectPending(request.params.id);
    if (!rejected) {
      const user = await users.findById(request.params.id);
      if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
      throw new AppError(409, "BUSINESS_RULE_VIOLATION", "Only pending users can be rejected");
    }

    return adminRejectionResponseSchema.parse({
      user: { id: rejected.id, email: rejected.email, approvalStatus: rejected.approvalStatus, role: rejected.role },
    });
  });
};

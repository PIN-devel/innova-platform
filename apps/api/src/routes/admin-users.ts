import { adminApprovalResponseSchema, pendingUsersResponseSchema } from "@innova/contracts";
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

    return adminApprovalResponseSchema.parse({
      user: { id: user.id, email: user.email, approvalStatus: user.approvalStatus, role: user.role },
    });
  });
};

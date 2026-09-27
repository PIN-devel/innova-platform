import { loginRequestSchema, signupRequestSchema } from "@innova/contracts";
import type { AuthUser } from "@innova/contracts";
import type { FastifyPluginAsync } from "fastify";
import * as argon2 from "argon2";
import { AUTH_COOKIE_NAME, JWT_EXPIRES_IN, authCookieOptions, createAuthGuard } from "../auth.js";
import type { UserRecord, UserRepository } from "../db/users.js";
import { AppError, invalidInput } from "../errors.js";
import { toValidationErrorDetails } from "@innova/contracts";

function publicUser(user: UserRecord): AuthUser {
  return { id: user.id, email: user.email, approvalStatus: user.approvalStatus, role: user.role };
}

export const authRoutes: FastifyPluginAsync<{ users: UserRepository }> = async (app, { users }) => {
  const requireAuth = createAuthGuard(users);
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store").header("Vary", "Cookie");
  });

  async function issueCookie(user: UserRecord, reply: import("fastify").FastifyReply) {
    const token = await reply.jwtSign({ sub: user.id }, { expiresIn: JWT_EXPIRES_IN });
    reply.setCookie(AUTH_COOKIE_NAME, token, authCookieOptions());
  }

  app.post("/signup", async (request, reply) => {
    const parsed = signupRequestSchema.safeParse(request.body);
    if (!parsed.success) throw invalidInput("Invalid signup input", toValidationErrorDetails(parsed.error, request.body));
    const { email, password } = parsed.data;
    if (await users.findByEmail(email)) throw new AppError(409, "EMAIL_ALREADY_EXISTS", "Email already exists");
    const passwordHash = await argon2.hash(password);
    const user = await users.create(email, passwordHash);
    if (!user) throw new AppError(409, "EMAIL_ALREADY_EXISTS", "Email already exists");
    await issueCookie(user, reply);
    return reply.code(201).send({ user: publicUser(user) });
  });

  app.post("/login", async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) throw invalidInput("Invalid login input", toValidationErrorDetails(parsed.error, request.body));
    const user = await users.findByEmail(parsed.data.email);
    if (!user || !(await argon2.verify(user.passwordHash, parsed.data.password))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }
    await issueCookie(user, reply);
    return reply.send({ user: publicUser(user) });
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => ({ user: request.authUser! }));

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie(AUTH_COOKIE_NAME, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return reply.code(204).send();
  });
};

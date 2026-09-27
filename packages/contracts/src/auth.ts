import { z } from "zod";

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.email(),
});

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const signupRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const authResponseSchema = z.object({ user: authUserSchema });
export const authErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "EMAIL_ALREADY_EXISTS",
  "INVALID_CREDENTIALS",
  "UNAUTHORIZED",
  "INTERNAL_ERROR",
]);
export const authErrorResponseSchema = z.object({
  error: z.object({ code: authErrorCodeSchema, message: z.string() }),
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type SignupRequest = z.infer<typeof signupRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>;

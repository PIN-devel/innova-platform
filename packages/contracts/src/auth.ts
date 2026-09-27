import { z } from "zod";

export const approvalStatusSchema = z.enum(["pending", "approved"]);
export const userRoleSchema = z.enum(["member", "admin"]);

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.email(),
  approvalStatus: approvalStatusSchema,
  role: userRoleSchema,
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
export const pendingUsersResponseSchema = z.object({
  users: z.array(authUserSchema.pick({ id: true, email: true, approvalStatus: true })),
});
export const adminApprovalResponseSchema = z.object({ user: authUserSchema });
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type PendingUsersResponse = z.infer<typeof pendingUsersResponseSchema>;
export type AdminApprovalResponse = z.infer<typeof adminApprovalResponseSchema>;
export type SignupRequest = z.infer<typeof signupRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;

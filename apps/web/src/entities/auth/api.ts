import {
  authResponseSchema,
  type AuthUser,
  type LoginRequest,
  type SignupRequest,
} from "@innova/contracts";
import { ApiError, apiClient } from "@/shared/api/client";

function parseUser(value: unknown): AuthUser {
  return authResponseSchema.parse(value).user;
}

export async function getCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    return parseUser(await apiClient.get("/auth/me", { cache: "no-store", signal }));
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") return null;
    throw error;
  }
}

export async function login(input: LoginRequest): Promise<AuthUser> {
  return parseUser(await apiClient.post("/auth/login", input));
}

export async function signup(input: SignupRequest): Promise<AuthUser> {
  return parseUser(await apiClient.post("/auth/signup", input));
}

export async function logout(): Promise<void> {
  await apiClient.post<void>("/auth/logout", {});
}

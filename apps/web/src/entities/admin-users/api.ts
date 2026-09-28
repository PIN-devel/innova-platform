import {
  adminApprovalResponseSchema,
  adminRejectionResponseSchema,
  pendingUsersResponseSchema,
  type AdminApprovalResponse,
  type AdminRejectionResponse,
  type PendingUsersResponse,
} from "@innova/contracts";
import { apiClient } from "@/shared/api/client";

export async function getPendingUsers(): Promise<PendingUsersResponse["users"]> {
  return pendingUsersResponseSchema.parse(await apiClient.get("/admin/users/pending", { cache: "no-store" })).users;
}

export async function approveUser(id: string): Promise<AdminApprovalResponse["user"]> {
  return adminApprovalResponseSchema.parse(await apiClient.post(`/admin/users/${encodeURIComponent(id)}/approve`, undefined, { cache: "no-store" })).user;
}

export async function rejectUser(id: string): Promise<AdminRejectionResponse["user"]> {
  return adminRejectionResponseSchema.parse(await apiClient.post(`/admin/users/${encodeURIComponent(id)}/reject`, undefined, { cache: "no-store" })).user;
}

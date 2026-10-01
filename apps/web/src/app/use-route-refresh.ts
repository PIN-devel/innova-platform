import { useQueryClient } from "@tanstack/react-query";
import { useRevalidator } from "react-router";
import { authKeys } from "@/entities/auth/queries";
import { adminUserKeys } from "@/entities/admin-users/queries";
import { examBankKeys } from "@/entities/exam-bank/queries";
export function useRouteRefresh() {
  const client = useQueryClient(); const revalidator = useRevalidator();
  return async () => {
    await Promise.all([authKeys.me, adminUserKeys.all, examBankKeys.all].map((queryKey) => client.invalidateQueries({ queryKey, refetchType: "none" })));
    await revalidator.revalidate();
  };
}

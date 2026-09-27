import { useNavigate } from "react-router";
import { ApiError } from "@/shared/api/client";
import { useLogout } from "./hooks";
import { toast } from "sonner";

function logoutErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "INTERNAL_ERROR") return "로그아웃 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (error instanceof ApiError) return "로그아웃 요청을 처리하지 못했습니다.";
  return "네트워크 오류로 로그아웃하지 못했습니다.";
}

export function LogoutButton() {
  const navigate = useNavigate();
  const mutation = useLogout();

  async function handleLogout() {
    try {
      await mutation.mutateAsync();
      navigate("/login", { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
        navigate("/login", { replace: true });
        return;
      }
      toast.error(logoutErrorMessage(error));
    }
  }

  return <span className="inline-flex flex-wrap items-center gap-3">
    <button type="button" onClick={() => void handleLogout()} disabled={mutation.isPending} className="text-sm font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50">
      {mutation.isPending ? "로그아웃 중…" : "로그아웃"}
    </button>
  </span>;
}

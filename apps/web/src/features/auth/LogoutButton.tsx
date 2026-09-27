import { useState } from "react";
import { useNavigate } from "react-router";
import { getAuthErrorCode } from "@/entities/auth/api";
import { ApiError } from "@/shared/api/client";
import { useLogout } from "./hooks";

function logoutErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status >= 500) return "로그아웃 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return "네트워크 오류로 로그아웃하지 못했습니다.";
}

export function LogoutButton() {
  const navigate = useNavigate();
  const mutation = useLogout();
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogout() {
    setErrorMessage("");
    try {
      await mutation.mutateAsync();
      navigate("/login", { replace: true });
    } catch (error) {
      if (getAuthErrorCode(error) === "UNAUTHORIZED") {
        navigate("/login", { replace: true });
        return;
      }
      setErrorMessage(logoutErrorMessage(error));
    }
  }

  return <span className="inline-flex flex-wrap items-center gap-3">
    <button type="button" onClick={() => void handleLogout()} disabled={mutation.isPending} className="text-sm font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50">
      {mutation.isPending ? "로그아웃 중…" : "로그아웃"}
    </button>
    {errorMessage && <span role="alert" className="text-xs text-red-700">{errorMessage}</span>}
  </span>;
}

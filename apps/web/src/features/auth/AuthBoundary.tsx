import { Navigate, Outlet, useLocation } from "react-router";
import { useCurrentUser } from "./hooks";

function AuthLoading() {
  return <div className="mx-auto max-w-lg py-24 text-center text-slate-600" role="status">계정 정보를 확인하고 있습니다…</div>;
}

function AuthCheckError({ onRetry }: { onRetry: () => void }) {
  return <section className="mx-auto grid max-w-lg gap-4 py-20 text-center">
    <h1 className="text-2xl font-semibold">계정 정보를 불러오지 못했습니다</h1>
    <p className="text-slate-600">네트워크 연결이나 서버 상태를 확인한 뒤 다시 시도해 주세요.</p>
    <button className="justify-self-center rounded-lg bg-blue-700 px-5 py-2.5 font-medium text-white hover:bg-blue-800" onClick={onRetry}>다시 시도</button>
  </section>;
}

export function RequireAuth() {
  const location = useLocation();
  const currentUser = useCurrentUser();
  if (currentUser.isPending) return <AuthLoading />;
  if (currentUser.isError) return <AuthCheckError onRetry={() => void currentUser.refetch()} />;
  if (!currentUser.data) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}

export function PublicOnly() {
  const currentUser = useCurrentUser();
  if (currentUser.isPending) return <AuthLoading />;
  if (currentUser.isError) return <Outlet />;
  if (currentUser.data) return <Navigate to="/exam" replace />;
  return <Outlet />;
}

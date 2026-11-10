import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { useRouteRefresh } from "@/shared/lib/router-query/use-route-refresh";
import { authKeys } from "@/entities/auth/queries";
import { useCurrentUser, useSessionScope } from "./hooks";
import { getAdminRedirect, getAiRedirect, getApprovalPendingRedirect, getExamRedirect, getPostAuthPath, getSignupRejectedRedirect } from "./route-access";
import { safeReturnTo, type Access } from "./route-session";

// Middleware gates entry; this observer immediately hides revoked data between navigations.
function LiveAccessBoundary({ access }: { access: Access }) {
  const location = useLocation();
  const currentUser = useCurrentUser();
  const { epoch, transitioning } = useSessionScope();
  const refresh = useRouteRefresh([authKeys.me]);
  if (transitioning) return <LoadingState label="계정을 변경하고 있습니다." />;
  if (currentUser.isPending) return <LoadingState label="계정 정보를 확인하고 있습니다." />;
  if (currentUser.isError) {
    if (access === "public") return <Outlet />;
    return <ErrorState title="계정 정보를 불러오지 못했습니다" description="네트워크 연결이나 서버 상태를 확인한 뒤 다시 시도해 주세요." action={<Button onClick={() => void refresh()}>다시 시도</Button>} />;
  }
  const user = currentUser.data;
  if (access === "public") return user ? <Navigate to={getPostAuthPath(user, safeReturnTo(new URLSearchParams(location.search).get("returnTo")))} replace /> : <Outlet />;
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  const redirect = { exam: getExamRedirect, admin: getAdminRedirect, pending: getApprovalPendingRedirect, rejected: getSignupRejectedRedirect, ai: getAiRedirect }[access](user);
  if (redirect) return <Navigate to={redirect} replace />;
  return <Outlet key={`${user.id}:${user.role}:${user.approvalStatus}:${epoch}`} />;
}
export const RequireAuth = () => <LiveAccessBoundary access="exam" />;
export const RequireAdmin = () => <LiveAccessBoundary access="admin" />;
export const RequireApprovalPending = () => <LiveAccessBoundary access="pending" />;
export const RequireSignupRejected = () => <LiveAccessBoundary access="rejected" />;
export const PublicOnly = () => <LiveAccessBoundary access="public" />;

export function RequireAiAdmin() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const { epoch, transitioning } = useSessionScope();
  const refresh = useRouteRefresh([authKeys.me]);
  if (transitioning) return <LoadingState label="계정을 변경하고 있습니다." />;
  if (currentUser.isPending) return <LoadingState label="계정 정보를 확인하고 있습니다." />;
  if (currentUser.isError) {
    return (
      <ErrorState
        title="계정 정보를 불러오지 못했습니다"
        description="네트워크 연결이나 서버 상태를 확인한 뒤 다시 시도해 주세요."
        action={<Button onClick={() => void refresh()}>다시 시도</Button>}
      />
    );
  }
  const user = currentUser.data;
  if (!user) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (user.approvalStatus === "rejected") {
    return <Navigate to="/signup-rejected" replace />;
  }
  if (user.role !== "admin") {
    return (
      <ErrorState
        title="접근 권한이 없습니다 (403 Forbidden)"
        description="AI Lab (K-EXAONE 2.5 PoC)은 관리자 전용 서비스입니다."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void navigate("/")}>
              홈으로 이동
            </Button>
            <Button onClick={() => void navigate("/exam")}>
              Exam Drill 열기
            </Button>
          </div>
        }
      />
    );
  }
  return <Outlet key={`${user.id}:${user.role}:${user.approvalStatus}:${epoch}`} />;
}

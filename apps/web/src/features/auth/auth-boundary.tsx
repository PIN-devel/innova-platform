import { Navigate, Outlet, useLocation } from "react-router";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { useCurrentUser } from "./hooks";
import { getAdminRedirect, getApprovalPendingRedirect, getExamRedirect, getSignupRejectedRedirect } from "./route-access";

export function RequireAuth() {
  const location = useLocation();
  const currentUser = useCurrentUser();
  if (currentUser.isPending) return <LoadingState label="계정 정보를 확인하고 있습니다." />;
  if (currentUser.isError) {
    return (
      <ErrorState
        title="계정 정보를 불러오지 못했습니다"
        description="네트워크 연결이나 서버 상태를 확인한 뒤 다시 시도해 주세요."
        action={<Button onClick={() => void currentUser.refetch()}>다시 시도</Button>}
      />
    );
  }
  if (!currentUser.data) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  const redirect = getExamRedirect(currentUser.data);
  if (redirect) return <Navigate to={redirect} replace />;
  return <Outlet />;
}

export function PublicOnly() {
  const currentUser = useCurrentUser();
  if (currentUser.isPending) return <LoadingState label="계정 정보를 확인하고 있습니다." />;
  if (currentUser.isError) return <Outlet />;
  if (currentUser.data) {
    const path = currentUser.data.approvalStatus === "rejected" ? "/signup-rejected" : currentUser.data.approvalStatus === "pending" ? "/approval-pending" : "/exam";
    return <Navigate to={path} replace />;
  }
  return <Outlet />;
}

export function RequireSignupRejected() {
  const location = useLocation();
  const currentUser = useCurrentUser();
  if (currentUser.isPending) return <LoadingState label="계정 정보를 확인하고 있습니다." />;
  if (currentUser.isError) {
    return <ErrorState title="계정 정보를 불러오지 못했습니다" description="네트워크 연결이나 서버 상태를 확인한 뒤 다시 시도해 주세요." action={<Button onClick={() => void currentUser.refetch()}>다시 시도</Button>} />;
  }
  if (!currentUser.data) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  const redirect = getSignupRejectedRedirect(currentUser.data);
  if (redirect) return <Navigate to={redirect} replace />;
  return <Outlet />;
}

export function RequireApprovalPending() {
  const location = useLocation();
  const currentUser = useCurrentUser();
  if (currentUser.isPending) return <LoadingState label="계정 정보를 확인하고 있습니다." />;
  if (currentUser.isError) {
    return <ErrorState title="계정 정보를 불러오지 못했습니다" description="네트워크 연결이나 서버 상태를 확인한 뒤 다시 시도해 주세요." action={<Button onClick={() => void currentUser.refetch()}>다시 시도</Button>} />;
  }
  if (!currentUser.data) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  const redirect = getApprovalPendingRedirect(currentUser.data);
  if (redirect) return <Navigate to={redirect} replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const location = useLocation();
  const currentUser = useCurrentUser();
  if (currentUser.isPending) return <LoadingState label="계정 정보를 확인하고 있습니다." />;
  if (currentUser.isError) {
    return <ErrorState title="계정 정보를 불러오지 못했습니다" description="네트워크 연결이나 서버 상태를 확인한 뒤 다시 시도해 주세요." action={<Button onClick={() => void currentUser.refetch()}>다시 시도</Button>} />;
  }
  if (!currentUser.data) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  const redirect = getAdminRedirect(currentUser.data);
  if (redirect) return <Navigate to={redirect} replace />;
  return <Outlet />;
}

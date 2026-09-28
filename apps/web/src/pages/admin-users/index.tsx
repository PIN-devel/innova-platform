import { ApiError } from "@/shared/api/client";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { useApproveUser, usePendingUsers, useRejectUser } from "@/features/admin-users/hooks";

function approvalError(error: unknown) {
  if (error instanceof ApiError && error.code === "FORBIDDEN") return "관리자 권한을 확인해 주세요.";
  if (error instanceof ApiError && error.code === "NOT_FOUND") return "사용자 정보를 찾지 못했습니다. 목록을 새로고침해 주세요.";
  return "승인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function rejectionError(error: unknown) {
  if (error instanceof ApiError && error.code === "FORBIDDEN") return "관리자 권한을 확인해 주세요.";
  if (error instanceof ApiError && error.code === "NOT_FOUND") return "사용자 정보를 찾지 못했습니다. 목록을 새로고침해 주세요.";
  if (error instanceof ApiError && error.code === "BUSINESS_RULE_VIOLATION") return "승인 대기 상태인 사용자만 거절할 수 있습니다. 목록을 새로고침해 주세요.";
  return "거절 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function AdminUsersPage() {
  const pendingUsers = usePendingUsers();
  const approval = useApproveUser();
  const rejection = useRejectUser();

  if (pendingUsers.isPending) return <LoadingState label="승인 대기 사용자를 불러오는 중입니다." />;
  if (pendingUsers.isError) {
    return <ErrorState
      title="승인 대기 사용자를 불러오지 못했습니다"
      description="관리자 권한과 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
      action={<Button onClick={() => void pendingUsers.refetch()}>다시 시도</Button>}
    />;
  }

  return <Card className="mx-auto w-full max-w-2xl">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">관리자</p>
          <CardTitle className="text-2xl">승인 대기 사용자</CardTitle>
          <CardDescription>승인하면 해당 사용자가 서비스를 이용할 수 있습니다.</CardDescription>
        </div>
      </div>
    </CardHeader>
    <CardContent className="grid gap-4">
      {approval.isError && <Alert variant="destructive"><AlertDescription>{approvalError(approval.error)}</AlertDescription></Alert>}
      {rejection.isError && <Alert variant="destructive"><AlertDescription>{rejectionError(rejection.error)}</AlertDescription></Alert>}
      {pendingUsers.data.length === 0
        ? <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">현재 승인 대기 중인 사용자가 없습니다.</p>
        : <ul className="divide-y divide-border">
          {pendingUsers.data.map((user) => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
            <div className="grid gap-1">
              <span className="font-medium text-foreground">{user.email}</span>
              <span className="text-xs text-muted-foreground">승인 대기</span>
            </div>
            <div className="flex items-center gap-2">
            <Button onClick={() => approval.mutate(user.id)} disabled={approval.isPending || rejection.isPending}>
              {approval.isPending && approval.variables === user.id ? "승인 중…" : "승인"}
            </Button>
            <Button variant="outline" onClick={() => {
              if (window.confirm(`${user.email}의 가입 요청을 거절할까요? 거절된 계정은 서비스를 이용할 수 없습니다.`)) {
                rejection.mutate(user.id);
              }
            }} disabled={approval.isPending || rejection.isPending}>
              {rejection.isPending && rejection.variables === user.id ? "거절 중…" : "거절"}
            </Button>
            </div>
          </li>)}
        </ul>}
    </CardContent>
  </Card>;
}

import { useFetcher } from "react-router";
import type { ActionResult } from "@/app/route-data";
import { useRouteRefresh } from "@/app/use-route-refresh";
import { ApiError } from "@/shared/api/client";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { ErrorState } from "@/shared/ui/error-state";
import { usePendingUsers } from "@/features/admin-users/hooks";
import { AdminUsersLoading } from "./admin-users-loading";

export default function AdminUsersPage() {
  const pendingUsers = usePendingUsers();
  const fetcher = useFetcher<ActionResult>();
  const refresh = useRouteRefresh();
  const busy = fetcher.state !== "idle";
  const submit = (intent: "approve" | "reject", id: string) => { if (!busy) fetcher.submit({ intent, id }, { method: "post", action: "/admin/users" }); };

  if (pendingUsers.isPending && !pendingUsers.data) return <AdminUsersLoading />;
  if (!pendingUsers.data || (pendingUsers.isError && pendingUsers.error instanceof ApiError && ["FORBIDDEN", "UNAUTHORIZED", "SIGNUP_REJECTED", "APPROVAL_PENDING"].includes(pendingUsers.error.code ?? ""))) {
    return <ErrorState
      title="승인 대기 사용자를 불러오지 못했습니다"
      description="관리자 권한과 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
      action={<Button onClick={() => void refresh()}>다시 시도</Button>}
    />;
  }

  return <Card aria-busy={pendingUsers.isFetching} className="mx-auto w-full max-w-2xl">
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
      {pendingUsers.isFetching && <p role="status" className="text-sm text-muted-foreground">사용자 목록 갱신 중…</p>}
      {pendingUsers.isError && !pendingUsers.isFetching && <Alert variant="warning"><AlertDescription className="flex flex-wrap items-center gap-2">사용자 목록을 갱신하지 못했습니다. 마지막 조회 결과를 표시합니다. <Button variant="outline" onClick={() => void refresh()}>다시 시도</Button></AlertDescription></Alert>}
      {fetcher.data?.error && <Alert variant="destructive"><AlertDescription>{fetcher.data.error}</AlertDescription></Alert>}
      {pendingUsers.data.length === 0
        ? <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{pendingUsers.isError ? "마지막 조회 당시 승인 대기 중인 사용자가 없었습니다." : "현재 승인 대기 중인 사용자가 없습니다."}</p>
        : <ul className="divide-y divide-border">
          {pendingUsers.data.map((user) => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
            <div className="grid gap-1">
              <span className="font-medium text-foreground">{user.email}</span>
              <span className="text-xs text-muted-foreground">승인 대기</span>
            </div>
            <div className="flex items-center gap-2">
            <Button onClick={() => submit("approve", user.id)} disabled={busy}>
              {busy && fetcher.formData?.get("intent") === "approve" && fetcher.formData?.get("id") === user.id ? "승인 중…" : "승인"}
            </Button>
            <Button variant="outline" onClick={() => {
              if (window.confirm(`${user.email}의 가입 요청을 거절할까요? 거절된 계정은 서비스를 이용할 수 없습니다.`)) {
                submit("reject", user.id);
              }
            }} disabled={busy}>
              {busy && fetcher.formData?.get("intent") === "reject" && fetcher.formData?.get("id") === user.id ? "거절 중…" : "거절"}
            </Button>
            </div>
          </li>)}
        </ul>}
    </CardContent>
  </Card>;
}

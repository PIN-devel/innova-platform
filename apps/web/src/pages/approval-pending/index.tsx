import { Link, useRevalidator } from "react-router";
import { useRouteRefresh } from "@/shared/lib/router-query/use-route-refresh";
import { authKeys } from "@/entities/auth/queries";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";

export default function ApprovalPendingPage() {
  const currentUser = useCurrentUser();
  const revalidator = useRevalidator();
  const refresh = useRouteRefresh([authKeys.me]);

  return <Card className="mx-auto w-full max-w-xl">
    <CardHeader>
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">Innova Platform</p>
      <CardTitle className="text-2xl">관리자 승인 대기 중</CardTitle>
      <CardDescription>회원가입과 로그인이 완료되었습니다. 관리자 승인 후 학습 서비스를 이용할 수 있습니다.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4">
      {currentUser.data?.email && <p className="text-sm text-muted-foreground">계정: {currentUser.data.email}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void refresh()} disabled={revalidator.state !== "idle"}>
          {revalidator.state !== "idle" ? "상태 확인 중…" : "승인 상태 다시 확인"}
        </Button>
        {currentUser.data?.role === "admin" && <Link className="text-sm font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/admin/users">사용자 승인</Link>}
      </div>
    </CardContent>
  </Card>;
}

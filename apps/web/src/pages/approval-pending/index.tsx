import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";

export default function ApprovalPendingPage() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [refreshFailed, setRefreshFailed] = useState(false);

  async function refreshApprovalStatus() {
    setRefreshFailed(false);
    const result = await currentUser.refetch();
    if (result.error || !result.data) {
      setRefreshFailed(true);
      return;
    }
    if (result.data.approvalStatus === "approved") navigate("/exam", { replace: true });
  }

  return <Card className="mx-auto w-full max-w-xl">
    <CardHeader>
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Innova Platform</p>
      <CardTitle className="text-2xl">관리자 승인 대기 중</CardTitle>
      <CardDescription>회원가입과 로그인이 완료되었습니다. 관리자 승인 후 학습 서비스를 이용할 수 있습니다.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4">
      {currentUser.data?.email && <p className="text-sm text-slate-600">계정: {currentUser.data.email}</p>}
      {refreshFailed && <Alert variant="destructive"><AlertDescription>승인 상태를 확인하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.</AlertDescription></Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void refreshApprovalStatus()} disabled={currentUser.isFetching}>
          {currentUser.isFetching ? "상태 확인 중…" : "승인 상태 다시 확인"}
        </Button>
        {currentUser.data?.role === "admin" && <Link className="text-sm font-medium text-blue-700 hover:underline" to="/admin/users">사용자 승인</Link>}
      </div>
    </CardContent>
  </Card>;
}

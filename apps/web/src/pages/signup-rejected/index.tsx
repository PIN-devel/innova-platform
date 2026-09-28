import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";

export default function SignupRejectedPage() {
  const currentUser = useCurrentUser();

  return <Card className="mx-auto w-full max-w-xl">
    <CardHeader>
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Innova Platform</p>
      <CardTitle className="text-2xl">가입 요청이 승인되지 않았습니다</CardTitle>
      <CardDescription>현재 이 계정으로는 서비스 기능을 이용할 수 없습니다.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4">
      {currentUser.data?.email && <p className="text-sm text-slate-600">계정: {currentUser.data.email}</p>}
      <p className="text-sm text-slate-700">추가 문의 또는 재검토 요청은 아래 이메일로 보내 주세요.</p>
      <a className="w-fit font-medium text-blue-700 hover:underline" href="mailto:innovaplatform.support@gmail.com">innovaplatform.support@gmail.com</a>
    </CardContent>
  </Card>;
}

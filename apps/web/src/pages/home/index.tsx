import { Link } from "react-router";
import { Card, CardContent } from "@/shared/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";

export default function Home() {
  const currentUser = useCurrentUser();
  const isAdmin = currentUser.data?.role === "admin" && currentUser.data.approvalStatus !== "rejected";

  return <div className="mx-auto grid max-w-3xl gap-6 py-12">
    <div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Innova Platform</p><h2 className="mt-2 text-4xl font-semibold tracking-tight">서비스 목록</h2><p className="mt-3 text-muted-foreground">Innova Platform의 서비스와 실험 기능을 이용할 수 있습니다.</p></div>
    <Link to="/exam" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="border border-primary/20 bg-accent py-6 shadow-sm transition-colors hover:border-primary">
        <CardContent><span className="text-xs font-bold uppercase tracking-widest text-primary">AWS SAP</span><h3 className="mt-2 text-2xl font-semibold">Exam Drill →</h3><p className="mt-2 text-muted-foreground">개념 학습 · 레슨 · 모의고사 · 오답 복습</p></CardContent>
      </Card>
    </Link>
    {isAdmin && (
      <Link to="/ai" className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Card className="border border-primary/20 bg-accent py-6 shadow-sm transition-colors hover:border-primary">
          <CardContent><span className="text-xs font-bold uppercase tracking-widest text-primary">K-EXAONE 2.5</span><h3 className="mt-2 text-2xl font-semibold">AI Lab (PoC) →</h3><p className="mt-2 text-muted-foreground">한국어 생성 품질 및 실시간 스트리밍 대화 검증</p></CardContent>
        </Card>
      </Link>
    )}
  </div>;
}

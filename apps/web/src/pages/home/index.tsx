import { Link } from "react-router";
import { Card, CardContent } from "@/shared/ui/card";

export default function Home() {
  return <div className="mx-auto grid max-w-3xl gap-6 py-12">
    <div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Innova Platform</p><h2 className="mt-2 text-4xl font-semibold tracking-tight">학습 도구</h2><p className="mt-3 text-muted-foreground">Exam Drill의 학습 콘텐츠와 문제셋을 PostgreSQL에서 불러옵니다.</p></div>
    <Link to="/exam" className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="border border-primary/20 bg-accent py-6 shadow-sm transition-colors hover:border-primary">
        <CardContent><span className="text-xs font-bold uppercase tracking-widest text-primary">AWS SAP</span><h3 className="mt-2 text-2xl font-semibold">Exam Drill →</h3><p className="mt-2 text-muted-foreground">개념 학습 · 레슨 · 모의고사 · 오답 복습</p></CardContent>
      </Card>
    </Link>
  </div>;
}

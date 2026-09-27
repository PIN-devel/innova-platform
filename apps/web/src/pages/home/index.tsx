import { Link } from "react-router";

export default function Home() {
  return <div className="mx-auto grid max-w-3xl gap-6 py-12">
    <div><p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Innova Platform</p><h2 className="mt-2 text-4xl font-semibold tracking-tight">학습 도구</h2><p className="mt-3 text-slate-600">Exam Drill의 학습 콘텐츠와 문제셋을 PostgreSQL에서 불러옵니다.</p></div>
    <Link to="/exam" className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm transition hover:border-blue-500"><span className="text-xs font-bold uppercase tracking-widest text-blue-700">AWS SAP</span><h3 className="mt-2 text-2xl font-semibold">Exam Drill →</h3><p className="mt-2 text-slate-600">개념 학습 · 레슨 · 모의고사 · 오답 복습</p></Link>
  </div>;
}

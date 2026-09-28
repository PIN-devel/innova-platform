import { Skeleton } from "@/shared/ui/skeleton";

export function ExamLoading() {
  return <div role="status" aria-busy="true" aria-label="문항 은행을 불러오는 중입니다." className="exam-shell">
    <span className="sr-only">문항 은행을 불러오는 중입니다.</span>
    <div aria-hidden="true">
      <div className="exam-head"><div className="w-full flex-wrap"><Skeleton className="h-6 w-28" /><Skeleton className="h-4 w-52 max-w-full" /></div></div>
      <div className="exam-main exam-stack">
        <div className="exam-hero grid gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-48 max-w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="exam-summary">
          {[1, 2, 3].map((item) => <div key={item} className="gap-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full" /></div>)}
        </div>
        <div className="exam-actions">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-10 w-28" />)}</div>
      </div>
    </div>
  </div>;
}

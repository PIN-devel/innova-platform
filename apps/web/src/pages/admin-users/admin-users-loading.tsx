import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

export function AdminUsersLoading() {
  return <div role="status" aria-busy="true" aria-label="승인 대기 사용자를 불러오는 중입니다.">
    <span className="sr-only">승인 대기 사용자를 불러오는 중입니다.</span>
    <Card aria-hidden="true" className="mx-auto w-full max-w-2xl">
      <CardHeader className="grid gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-48 max-w-full" />
        <Skeleton className="h-4 w-4/5" />
      </CardHeader>
      <CardContent className="grid gap-4">
        {[1, 2].map((item) => <div key={item} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3">
          <div className="grid w-48 max-w-full gap-2"><Skeleton className="h-5 w-full" /><Skeleton className="h-3 w-20" /></div>
          <div className="flex gap-2"><Skeleton className="h-9 w-16" /><Skeleton className="h-9 w-16" /></div>
        </div>)}
      </CardContent>
    </Card>
  </div>;
}

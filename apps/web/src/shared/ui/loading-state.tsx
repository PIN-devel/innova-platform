import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="mx-auto w-full max-w-xl">
      <span className="sr-only">{label}</span>
      <Card aria-hidden="true">
        <CardHeader>
          <Skeleton className="h-5 w-2/5" />
        </CardHeader>
        <CardContent className="grid gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    </div>
  );
}

export { LoadingState };

import { isRouteErrorResponse, useRouteError } from "react-router";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { NotFoundPage } from "@/pages/not-found/not-found-page";
import RootLayout from "./root-layout";
import { ExamContentLayout, StandardContentLayout } from "./content-layouts";

function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return (
    <ErrorState
      title="페이지를 표시하지 못했습니다"
      description="다시 시도하거나 홈으로 돌아가세요. 문제가 계속되면 잠시 후 다시 방문해 주세요."
      action={(
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()}>다시 시도</Button>
          <Button variant="outline" onClick={() => { window.location.assign("/"); }}>홈으로</Button>
        </div>
      )}
    />
  );
}

export function StandardContentErrorBoundary() {
  return <StandardContentLayout><RouteErrorBoundary /></StandardContentLayout>;
}

export function ExamContentErrorBoundary() {
  return <ExamContentLayout><RouteErrorBoundary /></ExamContentLayout>;
}

export function RootRouteErrorBoundary() {
  return <RootLayout><StandardContentErrorBoundary /></RootLayout>;
}

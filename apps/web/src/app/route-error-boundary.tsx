import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router";
import { useRouteRefresh } from "./use-route-refresh";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { NotFoundPage } from "@/pages/not-found/not-found-page";
import RootLayout from "./root-layout";
import { ExamContentLayout, StandardContentLayout } from "./content-layouts";

function RouteErrorBoundary({ exam = false }: { exam?: boolean }) {
  const error = useRouteError();
  const refresh = useRouteRefresh();
  const navigate = useNavigate();

  if (!exam && isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return (
    <ErrorState
      title="페이지를 표시하지 못했습니다"
      description="다시 시도하거나 홈으로 돌아가세요. 문제가 계속되면 잠시 후 다시 방문해 주세요."
      action={(
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void refresh()}>다시 시도</Button>
          {exam && <Button variant="outline" onClick={() => void navigate("/exam")}>기본 은행 열기</Button>}
          <Button variant="outline" onClick={() => void navigate("/")}>홈으로</Button>
        </div>
      )}
    />
  );
}

export function StandardContentErrorBoundary() {
  return <StandardContentLayout><RouteErrorBoundary /></StandardContentLayout>;
}

export function ExamContentErrorBoundary() {
  return <ExamContentLayout><RouteErrorBoundary exam /></ExamContentLayout>;
}

export function RootRouteErrorBoundary() {
  return <RootLayout><StandardContentErrorBoundary /></RootLayout>;
}

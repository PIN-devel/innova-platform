import type { ReactNode } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

function ErrorState({
  title = "요청을 처리하지 못했습니다",
  description = "잠시 후 다시 시도해 주세요.",
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert variant="destructive">
          <AlertTitle>오류가 발생했습니다</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </Alert>
        {action}
      </CardContent>
    </Card>
  );
}

export { ErrorState };

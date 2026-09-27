import { Link } from "react-router";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

function NotFoundPage() {
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>페이지를 찾을 수 없습니다</CardTitle>
        <CardDescription>주소를 확인하거나 홈으로 돌아가세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button render={<Link to="/" />}>홈으로</Button>
      </CardContent>
    </Card>
  );
}

export { NotFoundPage };

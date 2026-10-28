import { Link } from "react-router";
import { buttonVariants } from "@/shared/ui/button-variants";
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
        <Link to="/" className={buttonVariants()}>홈으로</Link>
      </CardContent>
    </Card>
  );
}

export { NotFoundPage };

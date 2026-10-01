import { useLocation } from "react-router";
import RootLayout from "./root-layout";
import { ExamContentLayout, StandardContentLayout } from "./content-layouts";
import { ExamLoading } from "@/pages/exam/exam-loading";
import { AdminUsersLoading } from "@/pages/admin-users/admin-users-loading";
import { LoadingState } from "@/shared/ui/loading-state";
export function InitialRouteLoading() {
  const { pathname } = useLocation();
  return <RootLayout>{pathname === "/exam" ? <ExamContentLayout><ExamLoading /></ExamContentLayout>
    : <StandardContentLayout>{pathname === "/admin/users" ? <AdminUsersLoading /> : <LoadingState label="페이지를 준비하고 있습니다." />}</StandardContentLayout>}</RootLayout>;
}

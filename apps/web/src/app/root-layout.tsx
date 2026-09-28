import { Link, Outlet, useLocation } from "react-router";
import { useCurrentUser } from "@/features/auth/hooks";
import { LogoutButton } from "@/features/auth/logout-button";

export default function RootLayout() {
  const exam = useLocation().pathname.startsWith("/exam");
  const currentUser = useCurrentUser();
  return (
    <div className={exam ? "" : "min-h-screen bg-background font-sans text-foreground"}>
      {!exam && <>
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/" className="rounded-sm text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Innova Platform</Link>
            <nav className="flex items-center gap-4 text-sm" aria-label="계정 메뉴">
              {currentUser.isPending ? <span role="status" className="text-xs text-muted-foreground">계정 확인 중…</span>
                : currentUser.isError ? <><span role="status" className="rounded-md bg-warning px-2 py-1 text-xs text-warning-foreground">계정 상태 확인 오류</span><Link className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/login">로그인</Link><Link className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/signup">회원가입</Link></>
                : currentUser.data ? <><span className="max-w-48 truncate text-muted-foreground">{currentUser.data.email}</span>{currentUser.data.role === "admin" && currentUser.data.approvalStatus !== "rejected" && <Link className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/admin/users">사용자 승인</Link>}{currentUser.data.approvalStatus === "rejected" && <Link className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/signup-rejected">가입 결과</Link>}<LogoutButton /></>
                  : <><Link className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/login">로그인</Link><Link className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/signup">회원가입</Link></>}
            </nav>
          </div>
        </div>
      </header>
      </>}
      <main className={exam ? "" : "mx-auto max-w-3xl px-4 py-8 sm:px-6"}>
        <Outlet />
      </main>
    </div>
  );
}

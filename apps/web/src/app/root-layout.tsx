import { useEffect, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigation, useRevalidator } from "react-router";
import { useCurrentUser } from "@/features/auth/hooks";
import { LogoutButton } from "@/features/auth/logout-button";

const navigationClass = "rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const primaryNavigationClass = ({ isActive }: { isActive: boolean }) => `${navigationClass}${isActive ? " underline underline-offset-4" : ""}`;

export default function RootLayout({ children }: { children?: ReactNode }) {
  const currentUser = useCurrentUser();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void revalidator.revalidate(); };
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [revalidator]);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-20 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-primary focus:outline-2 focus:outline-ring">본문으로 건너뛰기</a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 rounded-sm text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <img src="/brand/innova-mark.svg" alt="" className="size-8 shrink-0" />
            <span>Innova Platform</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm" aria-label="주요 탐색">
            <NavLink to="/" end className={primaryNavigationClass}>홈</NavLink>
            <NavLink to="/exam" className={primaryNavigationClass}>Exam Drill</NavLink>
          </nav>
          <nav className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:ml-auto" aria-label="계정 메뉴">
            {currentUser.isPending ? <span role="status" className="text-xs text-muted-foreground">계정 확인 중…</span>
              : currentUser.isError ? <><span role="status" className="rounded-md bg-warning px-2 py-1 text-xs text-warning-foreground">계정 상태 확인 오류</span><Link className={navigationClass} to="/login">로그인</Link><Link className={navigationClass} to="/signup">회원가입</Link></>
              : currentUser.data ? <><span className="max-w-48 truncate text-muted-foreground" title={currentUser.data.email}>{currentUser.data.email}</span>{currentUser.data.role === "admin" && currentUser.data.approvalStatus !== "rejected" && <Link className={navigationClass} to="/admin/users">사용자 승인</Link>}{currentUser.data.approvalStatus === "rejected" && <Link className={navigationClass} to="/signup-rejected">가입 결과</Link>}<LogoutButton /></>
                : <><Link className={navigationClass} to="/login">로그인</Link><Link className={navigationClass} to="/signup">회원가입</Link></>}
          </nav>
        </div>
      </header>
      {navigation.state !== "idle" && <p role="status" className="mx-auto max-w-5xl px-4 pt-2 text-sm text-muted-foreground">페이지 이동 중…</p>}
      {children ?? <Outlet />}
    </div>
  );
}

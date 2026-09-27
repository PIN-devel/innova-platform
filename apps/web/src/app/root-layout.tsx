import { Link, Outlet, useLocation } from "react-router";
import { useCurrentUser } from "@/features/auth/hooks";
import { LogoutButton } from "@/features/auth/logout-button";

export default function RootLayout() {
  const exam = useLocation().pathname.startsWith("/exam");
  const currentUser = useCurrentUser();
  return (
    <div className={exam ? "" : "min-h-screen bg-slate-50 font-sans text-slate-900"}>
      {!exam && <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/" className="text-xl font-semibold tracking-tight">Innova Platform</Link>
            <nav className="flex items-center gap-4 text-sm" aria-label="계정 메뉴">
              {currentUser.isPending ? <span role="status" className="text-xs text-slate-500">계정 확인 중…</span>
                : currentUser.isError ? <><span role="status" className="text-xs text-amber-800">계정 상태 확인 오류</span><Link className="font-medium text-blue-700 hover:underline" to="/login">로그인</Link><Link className="font-medium text-blue-700 hover:underline" to="/signup">회원가입</Link></>
                : currentUser.data ? <><span className="max-w-48 truncate text-slate-600">{currentUser.data.email}</span><LogoutButton /></>
                  : <><Link className="font-medium text-blue-700 hover:underline" to="/login">로그인</Link><Link className="font-medium text-blue-700 hover:underline" to="/signup">회원가입</Link></>}
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

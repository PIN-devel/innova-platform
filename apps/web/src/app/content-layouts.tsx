import type { ReactNode } from "react";
import { Outlet } from "react-router";

export function StandardContentLayout({ children }: { children?: ReactNode }) {
  return <main id="main-content" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children ?? <Outlet />}</main>;
}

export function ExamContentLayout({ children }: { children?: ReactNode }) {
  return <main id="main-content" className="mx-auto w-full max-w-[880px] px-4 pb-24 pt-6 sm:px-6 sm:pt-9">{children ?? <Outlet />}</main>;
}

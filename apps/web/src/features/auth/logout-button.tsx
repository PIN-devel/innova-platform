import { useFetcher } from "react-router";
import type { ActionResult } from "@/shared/lib/router-query/action-result";
export function LogoutButton() {
  const fetcher = useFetcher<ActionResult>();
  return <span className="inline-flex flex-wrap items-center gap-3">
    <fetcher.Form method="post" action="/logout">
      <button type="submit" disabled={fetcher.state !== "idle"} className="text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {fetcher.state !== "idle" ? "로그아웃 중…" : "로그아웃"}
      </button>
    </fetcher.Form>
    {fetcher.data?.error && <span role="alert" className="text-xs text-destructive">{fetcher.data.error}</span>}
  </span>;
}

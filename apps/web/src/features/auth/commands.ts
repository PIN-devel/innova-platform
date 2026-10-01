import type { QueryClient } from "@tanstack/react-query";
import type { LoginRequest } from "@innova/contracts";
import { login, logout, signup } from "@/entities/auth/api";
import { authKeys, currentUserQuery } from "@/entities/auth/queries";
import { assertSessionVersion, getSessionVersion, isSessionTransitioning, setSessionTransitioning } from "@/entities/auth/session-version";
import { clearProtectedQueries } from "./clear-protected-queries";
import { ApiError } from "@/shared/api/client";

export async function authenticate(client: QueryClient, kind: "login" | "signup" | "logout", input?: LoginRequest) {
  if (isSessionTransitioning(client)) throw new Error("계정 변경을 처리 중입니다. 잠시 후 다시 시도해 주세요.");
  setSessionTransitioning(client, true);
  clearProtectedQueries(client);
  const epoch = getSessionVersion(client);
  await client.cancelQueries({ queryKey: authKeys.me });
  client.setQueryData(authKeys.me, null);
  try {
    let user = null;
    if (kind === "logout") {
      try { await logout(); } catch (error) {
        if (!(error instanceof ApiError && error.code === "UNAUTHORIZED")) throw error;
      }
    } else user = await (kind === "login" ? login : signup)(input!);
    assertSessionVersion(client, epoch);
    client.setQueryData(authKeys.me, user);
    return { user, epoch };
  } catch (error) {
    assertSessionVersion(client, epoch);
    // POST failure does not prove the cookie stayed unchanged.
    await client.query(currentUserQuery(client)).catch(() => {});
    throw error;
  } finally { setSessionTransitioning(client, false); }
}

import { routeQuery } from "@/shared/api/route-query";
import { isCancelledError, type QueryClient, type FetchQueryOptions, type QueryKey } from "@tanstack/react-query";
import { data, replace, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { ExamBankSchema, loginRequestSchema, signupRequestSchema } from "@innova/contracts";
import { createCachedExamBank } from "@/features/start-lesson/model/import-bank";
import { examBankQuery } from "@/entities/exam-bank/queries";
import { pendingUsersQuery } from "@/entities/admin-users/queries";
import { assertSessionVersion } from "@/entities/auth/session-version";
import { authenticate } from "@/features/auth/commands";
import { decideUser } from "@/features/admin-users/commands";
import { handleSessionApiError } from "@/features/auth/clear-protected-queries";
import { requireAccess, safeReturnTo } from "@/features/auth/route-session";
import { getPostAuthPath } from "@/features/auth/route-access";
import { examLocation, examPath } from "@/features/start-lesson/model/exam-location";
import { ApiError } from "@/shared/api/client";

export type ActionResult = { error?: string; code?: string; fields?: Partial<Record<"email" | "password" | "passwordConfirm", string>>; ok?: boolean };
function actionError(error: unknown): ActionResult {
  return { error: error instanceof ApiError ? "요청을 처리하지 못했습니다. 입력 내용과 권한을 확인해 주세요." : "요청을 처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.", code: error instanceof ApiError ? error.code : undefined };
}
async function loadQuery<T, K extends QueryKey>(client: QueryClient, options: FetchQueryOptions<T, Error, T, K>, request: Request, epoch: number) {
  try { await routeQuery(client, options); } catch (error) {
    assertSessionVersion(client, epoch); request.signal.throwIfAborted();
    const recoverable = !(error instanceof ApiError) || error.status >= 500;
    if (isCancelledError(error) || !recoverable || (error instanceof Error && error.name === "ZodError") || client.getQueryData(options.queryKey) === undefined) throw error;
  }
  assertSessionVersion(client, epoch); request.signal.throwIfAborted();
  return null;
}
export const adminLoader = (client: QueryClient) => async ({ request, context }: LoaderFunctionArgs) => {
  const { epoch } = requireAccess(context, client, request, "admin");
  return loadQuery(client, pendingUsersQuery(epoch), request, epoch);
};
export const examLoader = (client: QueryClient) => async ({ request, context }: LoaderFunctionArgs) => {
  const { epoch } = requireAccess(context, client, request, "exam");
  const url = new URL(request.url); const location = examLocation(url);
  if (location.path !== url.pathname + url.search) throw replace(location.path);
  return loadQuery(client, examBankQuery(location.bankId, epoch), request, epoch);
};
export const authAction = (client: QueryClient, kind: "login" | "signup" | "logout") => async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const input = { email: form.get("email"), password: form.get("password") };
  if (kind !== "logout") {
    const result = (kind === "signup" ? signupRequestSchema : loginRequestSchema).safeParse(input);
    const fields: ActionResult["fields"] = {};
    if (!result.success) for (const issue of result.error.issues) {
      if (issue.path[0] === "email") fields.email = "유효한 이메일 주소를 입력해 주세요.";
      if (issue.path[0] === "password") fields.password = kind === "signup" ? "비밀번호는 8자 이상 128자 이하여야 합니다." : "비밀번호를 입력해 주세요.";
    }
    if (kind === "signup" && form.get("passwordConfirm") !== input.password) fields.passwordConfirm = "비밀번호가 일치하지 않습니다.";
    if (Object.keys(fields).length) return data({ fields }, { status: 400 });
  }
  let session;
  try { session = await authenticate(client, kind, input as { email: string; password: string }); }
  catch (error) { if (isCancelledError(error)) throw error; return data(actionError(error), { status: 400 }); }
  request.signal.throwIfAborted(); assertSessionVersion(client, session.epoch);
  return replace(session.user ? getPostAuthPath(session.user, safeReturnTo(new URL(request.url).searchParams.get("returnTo"))) : "/login");
};
export const adminAction = (client: QueryClient) => async ({ request, context }: ActionFunctionArgs) => {
  requireAccess(context, client, request, "admin");
  const form = await request.formData(); const intent = form.get("intent"); const id = form.get("id");
  if ((intent !== "approve" && intent !== "reject") || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return data({ error: "처리할 사용자를 확인해 주세요." }, { status: 400 });
  try { await decideUser(client, intent, id); }
  catch (error) { if (isCancelledError(error)) throw error; return data(actionError(error), { status: 400 }); }
  request.signal.throwIfAborted(); return { ok: true } satisfies ActionResult;
};
const imports = new WeakSet<QueryClient>();
export const examAction = (client: QueryClient) => async ({ request, context }: ActionFunctionArgs) => {
  const { epoch } = requireAccess(context, client, request, "exam");
  if (imports.has(client)) return data({ error: "문항을 저장 중입니다." }, { status: 409 });
  imports.add(client);
  let saved;
  try {
    const form = await request.formData(); const file = form.get("file"); const mode = form.get("mode");
    if (!(file instanceof File) || (mode !== "merge" && mode !== "replace")) return data({ error: "문항 파일과 불러오기 방식을 확인해 주세요." }, { status: 400 });
    const incoming = ExamBankSchema.parse(JSON.parse(await file.text()));
    assertSessionVersion(client, epoch); request.signal.throwIfAborted();
    const current = client.getQueryData(examBankQuery(examLocation(new URL(request.url)).bankId, epoch).queryKey)?.bank;
    if (mode === "merge" && !current) return data({ error: "현재 문항 은행을 먼저 불러와 주세요." }, { status: 400 });
    const bank = mode === "replace" ? incoming : { ...incoming,
      concepts: [...new Map([...current!.concepts, ...incoming.concepts].map((note) => [note.id, note])).values()],
      scenarios: [...new Map([...current!.scenarios, ...incoming.scenarios].map((note) => [note.id, note])).values()] };
    saved = await createCachedExamBank(client, bank);
    assertSessionVersion(client, epoch);
  } catch (error) {
    assertSessionVersion(client, epoch);
    if (isCancelledError(error)) throw error;
    handleSessionApiError(client, error); return data(actionError(error), { status: 400 });
  } finally { imports.delete(client); }
  request.signal.throwIfAborted(); return replace(examPath(saved.id));
};

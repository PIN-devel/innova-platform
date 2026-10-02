import { isCancelledError, type QueryClient } from "@tanstack/react-query";
import { data, replace, type ActionFunctionArgs } from "react-router";
import { loginRequestSchema, signupRequestSchema } from "@innova/contracts";
import { assertSessionVersion } from "@/entities/auth/session-version";
import { authenticate } from "@/features/auth/commands";
import { safeReturnTo } from "@/features/auth/route-session";
import { getPostAuthPath } from "@/features/auth/route-access";
import { actionError, type ActionResult } from "@/shared/lib/router-query/action-result";

export type AuthActionResult = ActionResult<"email" | "password" | "passwordConfirm">;

export const authAction = (client: QueryClient, kind: "login" | "signup" | "logout") => async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const input = { email: form.get("email"), password: form.get("password") };
  if (kind !== "logout") {
    const result = (kind === "signup" ? signupRequestSchema : loginRequestSchema).safeParse(input);
    const fields: AuthActionResult["fields"] = {};
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

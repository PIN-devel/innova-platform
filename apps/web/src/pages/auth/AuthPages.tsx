import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { loginRequestSchema, signupRequestSchema, type LoginRequest, type SignupRequest } from "@innova/contracts";
import { getAuthErrorCode } from "@/entities/auth/api";
import { ApiError } from "@/shared/api/client";
import { useCurrentUser, useLogin, useSignup } from "@/features/auth/hooks";

type FieldErrors = Partial<Record<"email" | "password", string>>;

function SessionNotice() {
  const query = useCurrentUser();
  if (!query.isError) return null;
  return <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    기존 로그인 상태를 확인하지 못했습니다. 계속하려면 다시 로그인해 주세요.
  </p>;
}

function submitError(error: unknown, kind: "login" | "signup") {
  const code = getAuthErrorCode(error);
  if (code === "INVALID_CREDENTIALS") return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (code === "EMAIL_ALREADY_EXISTS") return "이미 사용 중인 이메일입니다.";
  if (code === "INVALID_INPUT") return "입력한 이메일과 비밀번호를 확인해 주세요.";
  if (code === "INTERNAL_ERROR" || (error instanceof ApiError && error.status >= 500)) {
    return "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error instanceof ApiError) return "요청을 처리하지 못했습니다. 입력 내용을 확인해 주세요.";
  return kind === "login"
    ? "네트워크 오류로 로그인하지 못했습니다. 연결을 확인해 주세요."
    : "네트워크 오류로 가입하지 못했습니다. 연결을 확인해 주세요.";
}

function validationErrors(issues: readonly { path: PropertyKey[] }[], kind: "login" | "signup"): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (field === "email") errors.email = "유효한 이메일 주소를 입력해 주세요.";
    if (field === "password") errors.password = kind === "signup" ? "비밀번호는 8자 이상 128자 이하여야 합니다." : "비밀번호를 입력해 주세요.";
  }
  return errors;
}

function redirectPath(state: unknown) {
  if (typeof state !== "object" || state === null || !("from" in state) || typeof state.from !== "string") return "/exam";
  const path = state.from;
  return path.startsWith("/") && !path.startsWith("//") && path !== "/login" && path !== "/signup" ? path : "/exam";
}

function AuthCard({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
  return <section className="mx-auto grid w-full max-w-md gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <div><p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Innova Platform</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-sm text-slate-600">{description}</p></div>
    <SessionNotice />
    {children}
  </section>;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const mutation = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = loginRequestSchema.safeParse({ email, password });
    if (!result.success) {
      setFieldErrors(validationErrors(result.error.issues, "login"));
      mutation.reset();
      return;
    }
    setFieldErrors({});
    try {
      await mutation.mutateAsync(result.data satisfies LoginRequest);
      navigate(redirectPath(location.state), { replace: true });
    } catch {
      // The mutation error is rendered from its error code below.
    }
  }

  return <AuthCard title="로그인" description="계정에 로그인해 학습을 이어가세요.">
    <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <label className="grid gap-1.5 text-sm font-medium">이메일
        <input className="rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="email" name="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setFieldErrors((old) => ({ ...old, email: undefined })); mutation.reset(); }}/>
        {fieldErrors.email && <span className="font-normal text-red-700">{fieldErrors.email}</span>}
      </label>
      <label className="grid gap-1.5 text-sm font-medium">비밀번호
        <input className="rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="password" name="password" autoComplete="current-password" required value={password} onChange={(event) => { setPassword(event.target.value); setFieldErrors((old) => ({ ...old, password: undefined })); mutation.reset(); }}/>
        {fieldErrors.password && <span className="font-normal text-red-700">{fieldErrors.password}</span>}
      </label>
      {mutation.isError && <p role="alert" className="text-sm text-red-700">{submitError(mutation.error, "login")}</p>}
      <button type="submit" disabled={mutation.isPending} className="mt-1 rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">{mutation.isPending ? "로그인 중…" : "로그인"}</button>
    </form>
    <p className="text-center text-sm text-slate-600">계정이 없으신가요? <Link className="font-semibold text-blue-700 hover:underline" to="/signup">회원가입</Link></p>
  </AuthCard>;
}

export function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const mutation = useSignup();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = signupRequestSchema.safeParse({ email, password });
    if (!result.success) {
      setFieldErrors(validationErrors(result.error.issues, "signup"));
      mutation.reset();
      return;
    }
    setFieldErrors({});
    try {
      await mutation.mutateAsync(result.data satisfies SignupRequest);
      navigate(redirectPath(location.state), { replace: true });
    } catch {
      // The mutation error is rendered from its error code below.
    }
  }

  return <AuthCard title="회원가입" description="이메일과 비밀번호로 계정을 만드세요.">
    <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <label className="grid gap-1.5 text-sm font-medium">이메일
        <input className="rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="email" name="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setFieldErrors((old) => ({ ...old, email: undefined })); mutation.reset(); }}/>
        {fieldErrors.email && <span className="font-normal text-red-700">{fieldErrors.email}</span>}
      </label>
      <label className="grid gap-1.5 text-sm font-medium">비밀번호
        <input className="rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => { setPassword(event.target.value); setFieldErrors((old) => ({ ...old, password: undefined })); mutation.reset(); }}/>
        {fieldErrors.password && <span className="font-normal text-red-700">{fieldErrors.password}</span>}
      </label>
      {mutation.isError && <p role="alert" className="text-sm text-red-700">{submitError(mutation.error, "signup")}</p>}
      <button type="submit" disabled={mutation.isPending} className="mt-1 rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">{mutation.isPending ? "가입 중…" : "회원가입"}</button>
    </form>
    <p className="text-center text-sm text-slate-600">이미 계정이 있으신가요? <Link className="font-semibold text-blue-700 hover:underline" to="/login">로그인</Link></p>
  </AuthCard>;
}

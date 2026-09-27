import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { loginRequestSchema, signupRequestSchema, type LoginRequest, type SignupRequest } from "@innova/contracts";
import { ApiError } from "@/shared/api/client";
import { useCurrentUser, useLogin, useSignup } from "@/features/auth/hooks";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type FieldErrors = Partial<Record<"email" | "password", string>>;

function SessionNotice() {
  const query = useCurrentUser();
  if (!query.isError) return null;
  return <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    기존 로그인 상태를 확인하지 못했습니다. 계속하려면 다시 로그인해 주세요.
  </p>;
}

function submitError(error: unknown, kind: "login" | "signup") {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === "INVALID_CREDENTIALS") return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (code === "EMAIL_ALREADY_EXISTS") return "이미 사용 중인 이메일입니다.";
  if (code === "INVALID_INPUT") return "입력한 이메일과 비밀번호를 확인해 주세요.";
  if (code === "INTERNAL_ERROR") {
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
  return <Card className="mx-auto w-full max-w-md gap-6 p-6 shadow-sm sm:p-8">
    <CardHeader className="px-0">
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Innova Platform</p>
      <CardTitle className="text-3xl tracking-tight">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-6 px-0">
      <SessionNotice />
      {children}
    </CardContent>
  </Card>;
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
      <div className="grid gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input id="email" type="email" name="email" autoComplete="email" required value={email} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} onChange={(event) => { setEmail(event.target.value); setFieldErrors((old) => ({ ...old, email: undefined })); mutation.reset(); }}/>
        {fieldErrors.email && <span id="email-error" className="text-sm text-destructive">{fieldErrors.email}</span>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">비밀번호</Label>
        <Input id="password" type="password" name="password" autoComplete="current-password" required value={password} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} onChange={(event) => { setPassword(event.target.value); setFieldErrors((old) => ({ ...old, password: undefined })); mutation.reset(); }}/>
        {fieldErrors.password && <span id="password-error" className="text-sm text-destructive">{fieldErrors.password}</span>}
      </div>
      {mutation.isError && <Alert variant="destructive"><AlertDescription>{submitError(mutation.error, "login")}</AlertDescription></Alert>}
      <Button type="submit" disabled={mutation.isPending} className="mt-1 w-full py-2.5 font-semibold">{mutation.isPending ? "로그인 중…" : "로그인"}</Button>
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
      <div className="grid gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input id="email" type="email" name="email" autoComplete="email" required value={email} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} onChange={(event) => { setEmail(event.target.value); setFieldErrors((old) => ({ ...old, email: undefined })); mutation.reset(); }}/>
        {fieldErrors.email && <span id="email-error" className="text-sm text-destructive">{fieldErrors.email}</span>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">비밀번호</Label>
        <Input id="password" type="password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} onChange={(event) => { setPassword(event.target.value); setFieldErrors((old) => ({ ...old, password: undefined })); mutation.reset(); }}/>
        {fieldErrors.password && <span id="password-error" className="text-sm text-destructive">{fieldErrors.password}</span>}
      </div>
      {mutation.isError && <Alert variant="destructive"><AlertDescription>{submitError(mutation.error, "signup")}</AlertDescription></Alert>}
      <Button type="submit" disabled={mutation.isPending} className="mt-1 w-full py-2.5 font-semibold">{mutation.isPending ? "가입 중…" : "회원가입"}</Button>
    </form>
    <p className="text-center text-sm text-slate-600">이미 계정이 있으신가요? <Link className="font-semibold text-blue-700 hover:underline" to="/login">로그인</Link></p>
  </AuthCard>;
}

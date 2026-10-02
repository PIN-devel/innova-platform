import { useState, type FormEvent } from "react";
import { Link, useFetcher, useLocation } from "react-router";
import { loginRequestSchema, signupRequestSchema } from "@innova/contracts";
import { useCurrentUser } from "@/features/auth/hooks";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { AuthActionResult } from "./route";

type FieldErrors = Partial<Record<"email" | "password", string>>;

function SessionNotice() {
  const query = useCurrentUser();
  if (!query.isError) return null;
  return <Alert variant="warning"><AlertDescription>기존 로그인 상태를 확인하지 못했습니다. 계속하려면 다시 로그인해 주세요.</AlertDescription></Alert>;
}

function submitError(code: string | undefined, kind: "login" | "signup") {
  if (code === "INVALID_CREDENTIALS") return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (code === "EMAIL_ALREADY_EXISTS") return "이미 사용 중인 이메일입니다.";
  if (code === "INVALID_INPUT") return "입력한 이메일과 비밀번호를 확인해 주세요.";
  if (code === "INTERNAL_ERROR") {
    return "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (code) return "요청을 처리하지 못했습니다. 입력 내용을 확인해 주세요.";
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

function AuthCard({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
  return <Card className="mx-auto w-full max-w-md gap-6 p-6 shadow-sm sm:p-8">
    <CardHeader className="px-0">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">Innova Platform</p>
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
  const location = useLocation();
  const fetcher = useFetcher<AuthActionResult>();
  const [showError, setShowError] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = loginRequestSchema.safeParse({ email, password });
    if (!result.success) {
      setFieldErrors(validationErrors(result.error.issues, "login"));
      setShowError(false);
      return;
    }
    setFieldErrors({});
    setShowError(true);
    if (fetcher.state !== "idle") return;
    fetcher.submit(event.currentTarget, { method: "post", action: `${location.pathname}${location.search}` });
  }

  return <AuthCard title="로그인" description="계정에 로그인해 학습을 이어가세요.">
    <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input id="email" type="email" name="email" autoComplete="email" required value={email} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} onChange={(event) => { setEmail(event.target.value); setFieldErrors((old) => ({ ...old, email: undefined })); setShowError(false); }}/>
        {fieldErrors.email && <span id="email-error" className="text-sm text-destructive">{fieldErrors.email}</span>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">비밀번호</Label>
        <Input id="password" type="password" name="password" autoComplete="current-password" required value={password} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} onChange={(event) => { setPassword(event.target.value); setFieldErrors((old) => ({ ...old, password: undefined })); setShowError(false); }}/>
        {fieldErrors.password && <span id="password-error" className="text-sm text-destructive">{fieldErrors.password}</span>}
      </div>
      {showError && fetcher.data?.error && <Alert variant="destructive"><AlertDescription>{submitError(fetcher.data?.code, "login")}</AlertDescription></Alert>}
      <Button type="submit" disabled={fetcher.state !== "idle"} className="mt-1 w-full py-2.5 font-semibold">{fetcher.state !== "idle" ? "로그인 중…" : "로그인"}</Button>
    </form>
    <p className="text-center text-sm text-muted-foreground">계정이 없으신가요? <Link className="font-semibold text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/signup">회원가입</Link></p>
  </AuthCard>;
}

export function SignupPage() {
  const location = useLocation();
  const fetcher = useFetcher<AuthActionResult>();
  const [showError, setShowError] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordConfirmValidated, setPasswordConfirmValidated] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function confirmPasswordError(value: string) {
    return value === password ? undefined : "비밀번호가 일치하지 않습니다.";
  }

  const passwordConfirmError = passwordConfirmValidated ? confirmPasswordError(passwordConfirm) : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordConfirmValidated(true);
    const result = signupRequestSchema.safeParse({ email, password });
    const passwordConfirmErrorMessage = confirmPasswordError(passwordConfirm);
    if (!result.success || passwordConfirmErrorMessage) {
      setFieldErrors({
        ...(!result.success ? validationErrors(result.error.issues, "signup") : {}),
      });
      setShowError(false);
      return;
    }
    setFieldErrors({});
    setShowError(true);
    if (fetcher.state !== "idle") return;
    fetcher.submit(event.currentTarget, { method: "post", action: `${location.pathname}${location.search}` });
  }

  return <AuthCard title="회원가입" description="이메일과 비밀번호로 계정을 만드세요.">
    <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input id="email" type="email" name="email" autoComplete="email" required value={email} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} onChange={(event) => { setEmail(event.target.value); setFieldErrors((old) => ({ ...old, email: undefined })); setShowError(false); }}/>
        {fieldErrors.email && <span id="email-error" className="text-sm text-destructive">{fieldErrors.email}</span>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">비밀번호</Label>
        <Input id="password" type="password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} onChange={(event) => { setPassword(event.target.value); setFieldErrors((old) => ({ ...old, password: undefined })); setShowError(false); }}/>
        {fieldErrors.password && <span id="password-error" className="text-sm text-destructive">{fieldErrors.password}</span>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password-confirm">비밀번호 확인</Label>
        <Input id="password-confirm" type="password" name="passwordConfirm" autoComplete="new-password" required value={passwordConfirm} aria-invalid={Boolean(passwordConfirmError)} aria-describedby={passwordConfirmError ? "password-confirm-error" : undefined} onBlur={() => setPasswordConfirmValidated(true)} onChange={(event) => { setPasswordConfirm(event.target.value); setShowError(false); }}/>
        {passwordConfirmError && <span id="password-confirm-error" className="text-sm text-destructive">{passwordConfirmError}</span>}
      </div>
      {showError && fetcher.data?.error && <Alert variant="destructive"><AlertDescription>{submitError(fetcher.data?.code, "signup")}</AlertDescription></Alert>}
      <Button type="submit" disabled={fetcher.state !== "idle"} className="mt-1 w-full py-2.5 font-semibold">{fetcher.state !== "idle" ? "가입 중…" : "회원가입"}</Button>
    </form>
    <p className="text-center text-sm text-muted-foreground">이미 계정이 있으신가요? <Link className="font-semibold text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/login">로그인</Link></p>
  </AuthCard>;
}

import { expect, test } from "@playwright/test";
import { attachConsoleMonitor, getTestCredentials, waitForAppReady } from "./helpers.ts";
import { SYNTHETIC_MONTH } from "./fixtures/synthetic-finance-files.ts";

test("protected route redirects to login, preserves returnTo, and clears session on logout", async ({
  page,
}) => {
  const monitor = attachConsoleMonitor(page);
  const protectedPath = `/motifin/review?month=${SYNTHETIC_MONTH}`;
  const { email, password } = getTestCredentials();

  await page.goto(protectedPath);
  await waitForAppReady(page);

  await expect(page).toHaveURL(
    new RegExp(`/login\\?returnTo=${encodeURIComponent(protectedPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
  await expect(page.getByText("계정에 로그인해 학습을 이어가세요.")).toBeVisible();

  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-password-for-e2e");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않습니다.")).toBeVisible();

  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === protectedPath);
  await expect(page.getByRole("heading", { name: /MOTIFIN · 월간 리뷰/ })).toBeVisible();

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();

  await page.getByRole("navigation", { name: "주요 탐색" }).getByRole("link", { name: "MOTIFIN" }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fmotifin%2Freview/);

  monitor.assertClean({
    allowUnauthorizedOnUrls: ["/api/auth/me", "/api/auth/login"],
  });
});

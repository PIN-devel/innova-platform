import { expect, type Page } from "@playwright/test";

export const isExternalTarget = Boolean(process.env.E2E_BASE_URL?.trim());

export function getTestCredentials(): { email: string; password: string } {
  if (!isExternalTarget) {
    return { email: "test@example.com", password: "password123" };
  }
  const email = process.env.E2E_USER_EMAIL?.trim();
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_USER_EMAIL and E2E_USER_PASSWORD are required when E2E_BASE_URL is set.",
    );
  }
  return { email, password };
}

export type ConsoleMonitor = {
  pageErrors: string[];
  consoleErrors: string[];
  nativeButtonWarnings: string[];
  assertClean: (options?: { allowUnauthorizedOnUrls?: string[] }) => void;
};

export function attachConsoleMonitor(page: Page): ConsoleMonitor {
  const pageErrors: string[] = [];
  const rawConsoleErrors: Array<{ text: string; url: string }> = [];
  const nativeButtonWarnings: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("console", (message) => {
    const text = message.text();
    const type = message.type();
    if ((type === "warning" || type === "error") && /nativeButton/i.test(text)) {
      nativeButtonWarnings.push(text);
    }
    if (type === "error") {
      rawConsoleErrors.push({ text, url: message.location().url });
    }
  });

  const monitor: ConsoleMonitor = {
    pageErrors,
    consoleErrors: [],
    nativeButtonWarnings,
    assertClean(options) {
      const allowedUrls = options?.allowUnauthorizedOnUrls ?? [];
      const unexpectedErrors = rawConsoleErrors
        .filter(({ text, url }) => {
          const isUnauthorized = /401\s*\(Unauthorized\)|status of 401/i.test(text);
          if (!isUnauthorized) return true;
          return !allowedUrls.some((allowed) => url.includes(allowed));
        })
        .map(({ text, url }) => (url ? `${text} (${url})` : text));

      monitor.consoleErrors.splice(0, monitor.consoleErrors.length, ...unexpectedErrors);
      expect(pageErrors, "Uncaught page errors").toEqual([]);
      expect(nativeButtonWarnings, "Base UI nativeButton warnings").toEqual([]);
      expect(unexpectedErrors, "Unexpected console errors").toEqual([]);
    },
  };

  return monitor;
}

export async function waitForAppReady(page: Page): Promise<void> {
  await page.locator("#root > *").first().waitFor({ state: "visible" });
  if (!isExternalTarget) {
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.ready;
      }
    });
  }
}

export async function loginAsTestUser(page: Page, targetPath = "/"): Promise<void> {
  const { email, password } = getTestCredentials();
  const loginUrl =
    targetPath && targetPath !== "/"
      ? `/login?returnTo=${encodeURIComponent(targetPath)}`
      : "/login";

  await page.goto(loginUrl);
  await waitForAppReady(page);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  if (targetPath && targetPath !== "/") {
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === targetPath);
  }
}

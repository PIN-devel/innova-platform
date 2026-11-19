import { expect, test } from "@playwright/test";
import { attachConsoleMonitor, isExternalTarget, loginAsTestUser, waitForAppReady } from "./helpers.ts";

test("404 and 403 routes render real Links without nativeButton warnings or console errors", async ({
  context,
  page,
}) => {
  const unauthMonitor = attachConsoleMonitor(page);

  await page.goto("/non-existent-e2e-route");
  await waitForAppReady(page);

  await expect(page.getByText("페이지를 찾을 수 없습니다")).toBeVisible();
  const homeLink = page.getByRole("link", { name: "홈으로" });
  await expect(homeLink).toBeVisible();
  await expect(homeLink).toHaveAttribute("href", "/");

  const hasNestedButton = await homeLink.evaluate((el) => Boolean(el.closest("button")));
  expect(hasNestedButton).toBe(false);

  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  const [newTab] = await Promise.all([
    context.waitForEvent("page"),
    homeLink.click({ modifiers: [modifier] }),
  ]);
  await newTab.waitForLoadState("domcontentloaded");
  await expect(newTab).toHaveURL((url) => url.pathname === "/");
  await newTab.close();

  await homeLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Innova Platform" }).or(page.getByRole("link", { name: "Innova Platform" }))).toBeVisible();

  unauthMonitor.assertClean({ allowUnauthorizedOnUrls: ["/api/auth/me"] });

  // Verify 404 and /ai 403 Links while authenticated produce zero console warnings or errors.
  await loginAsTestUser(page, "/");
  const authMonitor = attachConsoleMonitor(page);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/non-existent-auth-e2e-route");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByText("페이지를 찾을 수 없습니다")).toBeVisible();
  await page.getByRole("link", { name: "홈으로" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");

  await page.evaluate(() => {
    window.history.pushState({}, "", "/ai");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  const forbiddenHeading = page.getByText("접근 권한이 없습니다 (403 Forbidden)");
  if (!isExternalTarget || (await forbiddenHeading.isVisible().catch(() => false))) {
    await expect(forbiddenHeading).toBeVisible();
    const goHomeLink = page.getByRole("link", { name: "홈으로 이동" });
    const goExamLink = page.getByRole("link", { name: "Exam Drill 열기" });
    await expect(goHomeLink).toHaveAttribute("href", "/");
    await expect(goExamLink).toHaveAttribute("href", "/exam");
    expect(await goHomeLink.evaluate((el) => Boolean(el.closest("button")))).toBe(false);
    expect(await goExamLink.evaluate((el) => Boolean(el.closest("button")))).toBe(false);

    await goExamLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL((url) => url.pathname === "/exam");
  }

  authMonitor.assertClean();
});

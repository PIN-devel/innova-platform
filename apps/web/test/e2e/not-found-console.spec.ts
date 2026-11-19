import { expect, test } from "@playwright/test";
import { attachConsoleMonitor, loginAsTestUser, waitForAppReady } from "./helpers.ts";

test("404 route renders real Link without nativeButton warnings or console errors", async ({
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

  await homeLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Innova Platform" }).or(page.getByRole("link", { name: "Innova Platform" }))).toBeVisible();

  unauthMonitor.assertClean({ allowUnauthorizedOnUrls: ["/api/auth/me"] });

  // Also verify 404 while authenticated produces strictly zero console errors of any kind.
  await loginAsTestUser(page, "/");
  const authMonitor = attachConsoleMonitor(page);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/non-existent-auth-e2e-route");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByText("페이지를 찾을 수 없습니다")).toBeVisible();
  await page.getByRole("link", { name: "홈으로" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");

  authMonitor.assertClean();
});

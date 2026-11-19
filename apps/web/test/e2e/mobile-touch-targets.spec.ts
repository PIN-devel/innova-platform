import { expect, test } from "@playwright/test";
import { SYNTHETIC_MONTH } from "./fixtures/synthetic-finance-files.ts";
import { attachConsoleMonitor, loginAsTestUser, waitForAppReady } from "./helpers.ts";

test.use({ viewport: { width: 390, height: 844 } });

async function assertMobileViewportTargets(page: import("@playwright/test").Page, label: string) {
  const metrics = await page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;

    const elements = Array.from(document.querySelectorAll("button, a[href], summary"));
    const violations: Array<{ tag: string; text: string; width: number; height: number }> = [];

    for (const el of elements) {
      if (el.classList.contains("sr-only")) continue;
      if (el.closest(".tsqd-parent-container")) continue;

      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      if (rect.width < 43.5 || rect.height < 43.5) {
        violations.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 40) || el.getAttribute("aria-label") || "(unlabeled)",
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        });
      }
    }

    return { scrollWidth, innerWidth, violations };
  });

  expect(
    metrics.scrollWidth,
    `${label}: horizontal overflow detected (${metrics.scrollWidth} > ${metrics.innerWidth})`,
  ).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.violations, `${label}: interactive controls smaller than 44px`).toEqual([]);
}

test("390px mobile viewport maintains >=44px touch targets and zero horizontal overflow on core routes", async ({
  page,
}) => {
  const unauthMonitor = attachConsoleMonitor(page);

  await page.goto("/login");
  await waitForAppReady(page);
  await assertMobileViewportTargets(page, "/login");

  await page.goto("/non-existent-e2e-route");
  await waitForAppReady(page);
  await assertMobileViewportTargets(page, "404");

  unauthMonitor.assertClean({ allowUnauthorizedOnUrls: ["/api/auth/me"] });

  await loginAsTestUser(page, `/motifin/review?month=${SYNTHETIC_MONTH}`);
  const authMonitor = attachConsoleMonitor(page);
  await assertMobileViewportTargets(page, "/motifin/review");

  await page.getByRole("link", { name: /자료 갱신·가져오기 기록 확인/ }).click();
  await expect(page).toHaveURL(new RegExp(`/motifin/import\\?month=${SYNTHETIC_MONTH}`));
  await assertMobileViewportTargets(page, "/motifin/import");

  await page
    .getByRole("navigation", { name: "MOTIFIN 주요 탐색" })
    .getByRole("link", { name: "월간 리뷰" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/motifin/review\\?month=${SYNTHETIC_MONTH}`));
  await page.getByRole("link", { name: "수기 거래·거래 삭제·XLSX 내보내기" }).click();
  await expect(page).toHaveURL(new RegExp(`/motifin/transactions\\?month=${SYNTHETIC_MONTH}`));
  await assertMobileViewportTargets(page, "/motifin/transactions");

  authMonitor.assertClean();
});

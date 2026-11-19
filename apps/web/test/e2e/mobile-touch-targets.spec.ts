import { expect, test } from "@playwright/test";
import { SYNTHETIC_MONTH } from "./fixtures/synthetic-finance-files.ts";
import { attachConsoleMonitor, isExternalTarget, loginAsTestUser, waitForAppReady } from "./helpers.ts";

test.use({ viewport: { width: 390, height: 844 } });

async function assertMobileViewportTargets(
  page: import("@playwright/test").Page,
  label: string,
  viewport?: { width: number; height: number },
) {
  if (viewport) {
    await page.setViewportSize(viewport);
  }
  const metrics = await page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;

    const elements = Array.from(document.querySelectorAll('button, a[href], summary, [role="button"]'));
    const rects: Array<{
      el: Element;
      desc: string;
      rect: DOMRect;
      layer: "sheet" | "fixed-nav" | "toast" | "main";
    }> = [];
    const violations: Array<{ tag: string; text: string; width: number; height: number }> = [];
    const clipViolations: Array<{ desc: string; left: number; right: number; innerWidth: number }> = [];
    const nameViolations: Array<{ desc: string }> = [];
    const nestedViolations: Array<{ child: string; parent: string }> = [];

    for (const el of elements) {
      if (el.classList.contains("sr-only")) continue;
      if (el.closest(".tsqd-parent-container")) continue;

      const closedDetails = el.closest("details:not([open])");
      if (closedDetails && !(el.tagName === "SUMMARY" && el.parentElement === closedDetails)) continue;

      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      const ariaLabel = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || "";
      const imgAlt = el.querySelector("img[alt]")?.getAttribute("alt") || "";
      const accessibleName = text || ariaLabel || imgAlt;
      const desc = `${el.tagName.toLowerCase()}[${accessibleName || "UNLABELED"}]`;

      if (!accessibleName) {
        nameViolations.push({ desc });
      }

      const parentInteractive = el.parentElement?.closest("button, a[href], summary");
      if (parentInteractive) {
        nestedViolations.push({ child: desc, parent: parentInteractive.tagName.toLowerCase() });
      }

      if (rect.width < 43.5 || rect.height < 43.5) {
        violations.push({
          tag: el.tagName.toLowerCase(),
          text: accessibleName || "(unlabeled)",
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        });
      }

      if (rect.left < -1.5 || rect.right > innerWidth + 1.5) {
        clipViolations.push({
          desc,
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          innerWidth,
        });
      }

      const layer = el.closest(".mf-sheet")
        ? "sheet"
        : el.closest(".mf-bottom-nav, .exam-tabs")
          ? "fixed-nav"
          : el.closest("[data-sonner-toaster]")
            ? "toast"
            : "main";
      rects.push({ el, desc, rect, layer });
    }

    const overlaps: Array<{ a: string; b: string; ix: number; iy: number }> = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (a.layer !== b.layer) continue;

        const ix = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const iy = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (ix > 1 && iy > 1) {
          overlaps.push({
            a: a.desc,
            b: b.desc,
            ix: Math.round(ix * 10) / 10,
            iy: Math.round(iy * 10) / 10,
          });
        }
      }
    }

    return { scrollWidth, innerWidth, violations, clipViolations, nameViolations, nestedViolations, overlaps };
  });

  expect(
    metrics.scrollWidth,
    `${label}: horizontal overflow detected (${metrics.scrollWidth} > ${metrics.innerWidth})`,
  ).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.violations, `${label}: interactive controls smaller than 44px`).toEqual([]);
  expect(metrics.clipViolations, `${label}: interactive controls clipped outside viewport`).toEqual([]);
  expect(metrics.nameViolations, `${label}: interactive controls missing accessible name`).toEqual([]);
  expect(metrics.nestedViolations, `${label}: nested interactive controls found`).toEqual([]);
  expect(metrics.overlaps, `${label}: overlapping interactive controls found`).toEqual([]);
}

test("mobile viewports maintain >=44px touch targets, no overlap, and zero horizontal overflow", async ({
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
    .getByRole("link", { name: "자금 일정" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/motifin/schedule\\?month=${SYNTHETIC_MONTH}`));
  await assertMobileViewportTargets(page, "/motifin/schedule (390px)", { width: 390, height: 844 });
  await assertMobileViewportTargets(page, "/motifin/schedule (320px)", { width: 320, height: 568 });
  await page.setViewportSize({ width: 390, height: 844 });

  await page
    .getByRole("navigation", { name: "MOTIFIN 주요 탐색" })
    .getByRole("link", { name: "월간 리뷰" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/motifin/review\\?month=${SYNTHETIC_MONTH}`));
  await page.getByRole("link", { name: "수기 거래·거래 삭제·XLSX 내보내기" }).click();
  await expect(page).toHaveURL(new RegExp(`/motifin/transactions\\?month=${SYNTHETIC_MONTH}`));
  await assertMobileViewportTargets(page, "/motifin/transactions");

  // Exam Drill: check home, settings (390px + 320px file input panel), and keyboard/disabled behavior.
  await page.getByRole("navigation", { name: "주요 탐색" }).getByRole("link", { name: "Exam Drill" }).click();
  await expect(page).toHaveURL(/\/exam/);
  await assertMobileViewportTargets(page, "/exam");

  await page.getByRole("navigation", { name: "Exam Drill 메뉴" }).getByRole("button", { name: "설정" }).click();
  await expect(page).toHaveURL(/\/exam\?view=settings/);
  await assertMobileViewportTargets(page, "/exam?view=settings (390px)", { width: 390, height: 844 });
  await assertMobileViewportTargets(page, "/exam?view=settings (320px)", { width: 320, height: 568 });
  await page.setViewportSize({ width: 390, height: 844 });

  const reviewTab = page.getByRole("navigation", { name: "Exam Drill 메뉴" }).getByRole("button", { name: "오답" });
  await reviewTab.focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/\/exam\?view=review/);
  await assertMobileViewportTargets(page, "/exam?view=review");
  if (!isExternalTarget) {
    await expect(page.getByRole("button", { name: /오답 다시 풀기/ })).toBeDisabled();
  }

  authMonitor.assertClean();
});

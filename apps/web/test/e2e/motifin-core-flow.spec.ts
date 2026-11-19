import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "@playwright/test";
import {
  SYNTHETIC_MONTH,
  SYNTHETIC_PDF_PASSWORD,
  ensureSyntheticFixtures,
} from "./fixtures/synthetic-finance-files.ts";
import { attachConsoleMonitor, loginAsTestUser } from "./helpers.ts";

test("MOTIFIN core flow: encrypted PDF/XLSX import, review, spending classification, manual tx, XLSX export, permanent delete", async ({
  page,
}) => {
  const fixtures = ensureSyntheticFixtures();

  await loginAsTestUser(page, `/motifin/import?month=${SYNTHETIC_MONTH}`);
  const monitor = attachConsoleMonitor(page);
  await expect(page.getByRole("heading", { name: "자료 가져오기" })).toBeVisible();

  // 1. Import password-protected synthetic bank PDF
  await page.locator('input[name="files"]').setInputFiles(fixtures.bankProtectedPdf);
  await page.locator('input[name="password"]').fill(SYNTHETIC_PDF_PASSWORD);
  await page.getByRole("button", { name: "가져오기" }).click();

  await expect(page.locator('[data-import-status="saved"]').first()).toBeVisible();
  await expect(page.getByText(/은행 입출금 · 반영됨/)).toBeVisible();

  // Wait for fetcher reset before selecting the next file
  await expect(page.getByRole("button", { name: "가져오기" })).toBeEnabled();

  // 2. Import synthetic card XLSX
  await page.locator('input[name="files"]').setInputFiles(fixtures.cardXlsx);
  await page.getByRole("button", { name: "가져오기" }).click();

  await expect(page.getByText(/카드 이용·청구 · 반영됨/)).toBeVisible();

  // 3. Monthly review check
  await page
    .getByRole("navigation", { name: "MOTIFIN 주요 탐색" })
    .getByRole("link", { name: "월간 리뷰" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/motifin/review\\?month=${SYNTHETIC_MONTH}`));
  await expect(page.getByLabel("이번 달의 결론")).toBeVisible();
  await expect(page.getByLabel("한 달의 자금 흐름")).toBeVisible();
  await expect(page.getByText("2,500,000원").first()).toBeVisible();
  await expect(page.getByText("47,500원").first()).toBeVisible();

  // Drill down from review evidence to spending classification
  await page.locator("summary", { hasText: /카드·수기 소비 근거/ }).click();
  await page.getByRole("link", { name: /합성커피/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/motifin/spending\\?.*month=${SYNTHETIC_MONTH}`));

  // Close initial event sheet to create a custom category first
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 4. Spending classification: add category & reclassify imported card purchase
  await page.locator("summary", { hasText: "카테고리 관리" }).click();
  await page.getByLabel("새 카테고리").fill("합성식비");
  await page.getByRole("button", { name: "카테고리 추가" }).click();
  await expect(page.getByText(/합성식비 · 연결 원거래/)).toBeVisible();

  const coffeeButton = page.getByRole("button", { name: /합성커피/ }).first();
  if (!(await coffeeButton.isVisible())) {
    await page.locator("summary", { hasText: /합성커피/ }).click();
  }
  await coffeeButton.click();

  const editDialog = page.getByRole("dialog", { name: "거래 상세·분류" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel("배분 1 카테고리").selectOption({ label: "합성식비" });
  await editDialog.getByRole("button", { name: "분류·보정 저장" }).click();
  await expect(editDialog.getByText("저장·재조회를 확인했습니다.")).toBeVisible();
  await editDialog.getByRole("button", { name: "닫기" }).click();

  // 5. Navigate to transactions page for manual tx, XLSX export, and permanent delete
  await page
    .getByRole("navigation", { name: "MOTIFIN 주요 탐색" })
    .getByRole("link", { name: "월간 리뷰" })
    .click();
  await page.getByRole("link", { name: "수기 거래·거래 삭제·XLSX 내보내기" }).click();
  await expect(page).toHaveURL(new RegExp(`/motifin/transactions\\?month=${SYNTHETIC_MONTH}`));

  const manualForm = page.locator("form", { hasText: "파일 없이 수입·지출 추가" });
  await manualForm.getByLabel("거래일").fill(`${SYNTHETIC_MONTH}-25`);
  await manualForm.getByLabel("금액 · 원").fill("15000");
  await manualForm.getByLabel("거래명").fill("합성수기지출");
  await manualForm.getByRole("button", { name: "저장" }).click();

  const manualSection = page.locator("section", { hasText: "수기 거래" });
  const manualItemButton = manualSection.getByRole("button", { name: /합성수기지출/ });
  await expect(manualItemButton).toBeVisible();

  // 6. XLSX export verification
  const exportForm = page.locator("form", { hasText: "AI 분석용 XLSX 내보내기" });
  await exportForm.getByLabel("시작 월").fill(SYNTHETIC_MONTH);
  await exportForm.getByLabel("종료 월").fill(SYNTHETIC_MONTH);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportForm.getByRole("button", { name: "XLSX 다운로드" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`motifin-${SYNTHETIC_MONTH}-${SYNTHETIC_MONTH}.xlsx`);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  const exportedFiles = unzipSync(readFileSync(downloadPath!));
  for (const part of [
    "xl/workbook.xml",
    "xl/worksheets/sheet1.xml",
    "xl/worksheets/sheet2.xml",
    "xl/worksheets/sheet3.xml",
    "xl/worksheets/sheet4.xml",
  ]) {
    expect(exportedFiles[part], `Missing exported worksheet part: ${part}`).toBeDefined();
  }
  const detailSheetXml = strFromU8(exportedFiles["xl/worksheets/sheet2.xml"]!);
  expect(detailSheetXml).toContain("합성수기지출");

  // 7. Permanent deletion of the synthetic manual transaction
  await manualItemButton.click();
  const deleteDialog = page.getByRole("dialog", { name: "거래 상세" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "영구 삭제 영향 확인" }).click();

  await expect(deleteDialog.getByRole("heading", { name: "삭제 전 확인" })).toBeVisible();
  await deleteDialog
    .getByRole("checkbox", { name: /영구 삭제하며 앱에서 복원할 수 없음을 확인했습니다\./ })
    .check();
  await deleteDialog.getByRole("button", { name: "이 거래 영구 삭제" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(manualSection.getByText("등록한 수기 거래가 없습니다.")).toBeVisible();

  monitor.assertClean();
});

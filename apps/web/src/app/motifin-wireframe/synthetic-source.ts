import type { CashFlowMonth, CashFlowSnapshot, ImportPreview, ImportDecision, Transaction } from "@/entities/cash-flow/model";
import { allocationsFor, isConsumption, unclassifiedCategory } from "@/entities/cash-flow/classification";
import { createSyntheticCalendar } from "./calendar-presentation";
import { buildSyntheticSpending } from "./spending-presentation";
import type { CashFlowActions } from "@/features/cash-flow-workspace/ports";
import { buildSyntheticReview } from "./review-presentation";

export const wireframeScenarios = [
  ["monthly", "둘째 달 리뷰"], ["first", "첫 이용"], ["missing-card", "카드 자료 없음"],
  ["missing-bank", "은행 자료 없음"], ["delayed", "카드 명세 지연"],
  ["correction", "중복·정정 검토"], ["classification", "미분류·금액 분할"], ["saved-password", "저장된 PDF 암호"], ["cash-shortfall", "급여 전 잔액 부족"], ["quiet", "특이 변화 없음"], ["loading", "불러오는 중"], ["error", "조회 실패"],
] as const;
export type WireframeScenario = typeof wireframeScenarios[number][0];
const sampleFiles = [
  { id: "bank-aug", name: "샘플-은행-8월.pdf", source: "bank", monthId: "2026-08" },
  { id: "bank-sep", name: "샘플-은행-9월.pdf", source: "bank", monthId: "2026-09" },
  { id: "card-aug", name: "샘플-카드-9월청구.xls", source: "card", monthId: "2026-08" },
  { id: "card-sep", name: "샘플-카드-10월청구.xls", source: "card", monthId: "2026-09" },
  { id: "unreadable", name: "샘플-읽기실패.pdf", source: "bank", monthId: "2026-09", issue: "unreadable" },
  { id: "wrong-account", name: "샘플-다른계좌.pdf", source: "bank", monthId: "2026-09", issue: "wrong-account" },
] satisfies CashFlowSnapshot["importFiles"];
const categoryNames = ["주거", "식료품", "외식", "교통", "구독", "생활", "공과금", "수수료", unclassifiedCategory];
function transaction(month: string, id: string, title: string, amount: number, source: Transaction["source"], kind: Transaction["kind"], category: string | null, day: string, note: string, recurring = false, relatedId?: string): Transaction {
  return { id: `${month}-${id}`, date: `${month}-${day}`, title, amount, source, kind, category, note, recurring, relatedId };
}
const august: Transaction[] = [
  transaction("2026-08", "salary", "급여 입금", 3_200_000, "bank", "income", null, "25", "급여로 확인된 외부 소득"),
  transaction("2026-08", "transfer-in", "다른 내 계좌에서 수취", 200_000, "bank", "transfer", null, "03", "소득이 아닌 계좌 간 이동. 상대 계좌 잔액은 수집하지 않아요."),
  transaction("2026-08", "rent", "월세", 700_000, "bank", "purchase", "주거", "05", "소비와 은행 출금이 같은 날 발생", true),
  transaction("2026-08", "utility", "공과금", 100_000, "bank", "purchase", "공과금", "18", "금액이 바뀔 수 있는 반복비", true),
  transaction("2026-08", "card-pay", "카드대금 출금", 600_000, "bank", "card-payment", null, "25", "7월 이용분 청구액의 실제 출금. 8월 소비에 더하지 않아요. 7월 이용 자료는 이 시안에 없어요."),
  transaction("2026-08", "transfer-out", "내 파킹 통장으로 송금", 500_000, "bank", "transfer", null, "26", "소비가 아닌 자금 이동. 이 통장에서 나간 금액만 확인해요."),
  transaction("2026-08", "grocery", "샘플 마켓", 250_000, "card", "purchase", "식료품", "12", "8월 이용 · 9월 25일 청구 출금"),
  transaction("2026-08", "food", "샘플 식당", 80_000, "card", "purchase", "외식", "16", "8월 이용 · 9월 25일 청구 출금"),
  transaction("2026-08", "food-extra", "샘플 식당", 20_000, "card", "purchase", "외식", "23", "같은 가맹점의 추가 이용 · 빈도 탐색용 합성 자료"),
  transaction("2026-08", "coupang", "쿠팡 · 합성 결제", 50_000, "card", "purchase", null, "21", "구매 품목을 알 수 없는 종합몰 결제예요. 필요하면 금액을 나누어 분류하세요."),
  transaction("2026-08", "transit-extra", "샘플 교통", 40_000, "card", "purchase", "교통", "12", "같은 달 추가 이용 · 합성 자료"),
  transaction("2026-08", "transit", "샘플 교통", 60_000, "card", "purchase", "교통", "28", "8월 이용 · 9월 25일 청구 출금"),
  transaction("2026-08", "subscription", "샘플 구독", 20_000, "card", "purchase", "구독", "18", "8월 소비 · 9월 카드대금에 포함", true),
  transaction("2026-08", "installment", "샘플 가전 · 5개월 할부", 600_000, "card", "purchase", "생활", "20", "구매 원금 600,000원은 8월 소비에 한 번 반영. 9월부터 월 120,000원 청구, 잔여 원금 480,000원(9월 납부 후)."),
];
const september: Transaction[] = [
  transaction("2026-09", "salary", "급여 입금", 3_200_000, "bank", "income", null, "25", "급여로 확인된 외부 소득"),
  transaction("2026-09", "transfer-in", "다른 내 계좌에서 수취", 100_000, "bank", "transfer", null, "03", "소득이 아닌 계좌 간 이동"),
  transaction("2026-09", "rent", "월세", 700_000, "bank", "purchase", "주거", "05", "9월 실제 납부와 연결됨", true),
  transaction("2026-09", "utility", "공과금", 110_000, "bank", "purchase", "공과금", "18", "지난달보다 10,000원 증가한 반복비", true),
  transaction("2026-09", "card-pay", "카드대금 출금", 640_000, "bank", "card-payment", null, "25", "8월 이용 일시불 520,000원 + 가전 할부 1/5회 120,000원. 9월 소비에 다시 더하지 않아요.", false, "2026-08-installment"),
  transaction("2026-09", "transfer-out", "내 투자 통장으로 송금", 600_000, "bank", "transfer", null, "26", "소비가 아닌 이동. 상대 계좌의 잔액·투자 결과는 알 수 없어요."),
  transaction("2026-09", "grocery", "샘플 마켓", 350_000, "card", "purchase", "식료품", "12", "9월 이용 · 10월 25일 청구 예정"),
  transaction("2026-09", "refund", "샘플 마켓 · 일부 취소", -50_000, "card", "refund", "식료품", "15", "같은 달 구매 취소 50,000원 반영. 원거래와 연결된 합성 예시", false, "2026-09-grocery"),
  transaction("2026-09", "food", "샘플 식당", 100_000, "card", "purchase", "외식", "16", "9월 이용 · 10월 25일 청구 예정"),
  transaction("2026-09", "food-extra", "샘플 식당", 20_000, "card", "purchase", "외식", "23", "같은 가맹점의 추가 이용 · 빈도 탐색용 합성 자료"),
  transaction("2026-09", "coupang", "쿠팡 · 합성 결제", 50_000, "card", "purchase", null, "21", "구매 품목을 알 수 없는 종합몰 결제예요. 필요하면 금액을 나누어 분류하세요."),
  transaction("2026-09", "pg", "PG사 · 합성 결제", 30_000, "card", "purchase", null, "24", "결제 대행 표기만 있어 소비 목적은 미분류로 두었어요."),
  transaction("2026-09", "transit-extra", "샘플 교통", 40_000, "card", "purchase", "교통", "12", "같은 달 추가 이용 · 합성 자료"),
  transaction("2026-09", "transit", "샘플 교통", 60_000, "card", "purchase", "교통", "28", "9월 이용 · 10월 25일 청구 예정"),
  transaction("2026-09", "subscription", "샘플 구독", 20_000, "card", "purchase", "구독", "18", "9월 소비. 10월 카드 청구에 포함", true),
  transaction("2026-09", "fee", "할부 수수료", 5_000, "bank", "fee", "수수료", "25", "합성 시나리오에서는 9월에 확인된 비용으로 별도 표시. 실제 인식 기준은 명세 내용을 확인한 뒤 확정."),
];

function summarize(month: CashFlowMonth, previous?: CashFlowMonth, categories = categoryNames): CashFlowMonth {
  const consumptionRows = month.transactions.filter(isConsumption);
  const known = consumptionRows.reduce((sum, t) => sum + t.amount, 0);
  month.categories = categories.map(name => ({ name, amount: consumptionRows.flatMap(allocationsFor).filter(a => a.category === name).reduce((sum, a) => sum + a.amount, 0), previous: previous?.categories.find(c => c.name === name)?.amount ?? null })).filter(c => c.amount !== 0 || (c.previous ?? 0) !== 0);
  const complete = month.bankCoverage === "complete" && month.cardCoverage === "complete";
  month.consumption = complete ? known : null;
  month.income = month.bank ? 3_200_000 : null;
  month.recurringConsumption = complete ? consumptionRows.filter(t => t.recurring).reduce((sum, t) => sum + t.amount, 0) : null;
  if (!complete || previous?.consumption === null) month.insight = null;
  return month;
}

function seedMonths(): CashFlowMonth[] {
  const a = summarize({ id: "2026-08", label: "2026년 8월", period: "8월 1일 – 31일", updatedAt: "9월 2일 확인", bankCoverage: "complete", cardCoverage: "complete", consumption: null, income: null, bank: { opening: 1_000_000, incoming: 3_400_000, outgoing: 1_900_000, closing: 2_500_000, transfersOut: 500_000, transfersIn: 200_000, cardPayment: 600_000 }, categories: [], recurringConsumption: null, transactions: structuredClone(august), payments: [
    { id: "aug-rent", title: "월세", date: "2026-08-05", amount: 700_000, status: "matched", note: "은행 실제 납부와 연결", transactionId: "2026-08-rent" },
    { id: "aug-bill", title: "9월 카드 청구", date: "2026-09-25", amount: 640_000, status: "scheduled", note: "8월 일시불 + 가전 할부 1/5회. 이용액 전체와 달라요." },
  ], insight: null });
  const b = summarize({ id: "2026-09", label: "2026년 9월", period: "9월 1일 – 30일", updatedAt: "10월 2일 확인", bankCoverage: "complete", cardCoverage: "complete", consumption: null, income: null, bank: { opening: 2_500_000, incoming: 3_300_000, outgoing: 2_055_000, closing: 3_745_000, transfersOut: 600_000, transfersIn: 100_000, cardPayment: 640_000 }, categories: [], recurringConsumption: null, transactions: structuredClone(september), payments: [
    { id: "sep-rent", title: "월세", date: "2026-09-05", amount: 700_000, status: "matched", note: "9월 실제 납부와 연결", transactionId: "2026-09-rent" },
    { id: "sep-bill", title: "9월 카드대금", date: "2026-09-25", amount: 640_000, status: "matched", note: "8월 이용분 · 할부 1/5회 포함", transactionId: "2026-09-card-pay" },
    { id: "oct-rent", title: "다음 월세", date: "2026-10-05", amount: 700_000, status: "scheduled", note: "사용자가 확인한 반복 일정 · 은행 출금 예정" },
    { id: "oct-utility", title: "다음 공과금", date: "2026-10-18", amount: null, status: "unconfirmed", note: "납부일만 확인 · 금액은 고지 후 확인" },
    { id: "oct-bill", title: "10월 카드 청구", date: "2026-10-25", amount: 740_000, status: "scheduled", note: "9월 이용 620,000원(취소 반영) + 가전 할부 2/5회 120,000원. 구독료 포함, 별도 합산하지 않아요." },
  ], insight: { title: "식료품 소비가 5만원 늘었어요", description: "8월 25만원 → 9월 30만원. 취소 5만원을 반영한 금액이에요. 두 달 비교이며 평소 패턴을 뜻하지 않아요.", category: "식료품" } }, a);
  return [a, b];
}

export function createSyntheticSource(scenario: WireframeScenario = "monthly") {
  const templates = seedMonths();
  let snapshot: CashFlowSnapshot = { importFiles: structuredClone(sampleFiles), pdfPasswordSaved: false, months: structuredClone(templates), categories: [...categoryNames], importHistory: ["10월 2일 · 9월 은행·카드 샘플 반영", "9월 2일 · 8월 은행·카드 샘플 반영"] };
  const categoryAliases = new Map(categoryNames.map(name => [name, name]));
  const resolveCategory = (name: string | null) => name === null ? null : categoryAliases.get(name) ?? (snapshot.categories.includes(name) ? name : unclassifiedCategory);
  const latest = snapshot.months[1]!;
  snapshot.pdfPasswordSaved = scenario === "saved-password";
  if (scenario === "first") {
    snapshot.months = [{ ...latest, bankCoverage: "missing", cardCoverage: "missing", bank: null, consumption: null, income: null, recurringConsumption: null, transactions: [], categories: [], payments: [], insight: null, updatedAt: "아직 가져온 자료가 없어요" }];
    snapshot.importHistory = [];
  } else if (scenario === "missing-card" || scenario === "delayed" || scenario === "missing-bank") {
    const bankMissing = scenario === "missing-bank";
    latest.bankCoverage = bankMissing ? "missing" : "complete";
    latest.cardCoverage = bankMissing ? "complete" : scenario === "delayed" ? "delayed" : "missing";
    if (bankMissing) latest.bank = null;
    latest.transactions = latest.transactions.filter(t => t.source === (bankMissing ? "card" : "bank"));
    latest.updatedAt = "10월 2일 · 일부 자료만 확인";
    latest.payments = latest.payments.map(p => (!bankMissing && p.title.includes("카드")) || (bankMissing && p.status === "matched") ? { ...p, amount: null, status: "unconfirmed", note: "관련 자료가 없어 확인할 수 없어요.", transactionId: undefined } : p);
    summarize(latest, snapshot.months[0]);
  } else if (scenario === "quiet") {
    latest.insight = { title: "확인된 특별한 변화가 없어요", description: "두 달의 제한된 자료만으로 평소 패턴이나 구매 필요를 추정하지 않아요.", category: null };
  } else if (scenario === "correction") {
    latest.transactions.find(t => t.id === "2026-09-grocery")!.amount = 370_000;
    latest.insight = null;
    latest.payments.find(p => p.id === "oct-bill")!.amount = 760_000;
    summarize(latest, snapshot.months[0]);
  }
  function selectedFiles(ids: string[]) {
    return snapshot.importFiles.filter(file => ids.includes(file.id));
  }
  function matches(a: Pick<Transaction, "title" | "date" | "amount">, b: Pick<Transaction, "title" | "date" | "amount">) {
    return a.title === b.title && a.date === b.date && a.amount === b.amount;
  }
  function previewImport(fileIds: string[]): ImportPreview {
    const preview: ImportPreview = { added: 0, duplicates: 0, corrections: [], months: [], issues: [] };
    for (const file of selectedFiles(fileIds)) {
      if (file.issue) {
        preview.issues.push({ fileId: file.id, name: file.name, message: file.issue === "unreadable" ? "파일 내용을 읽지 못했어요. 다시 선택하거나 이번 가져오기에서 제외해주세요." : "관리하는 통장의 자료가 아니에요. 이 파일을 제외하고 올바른 파일을 선택해주세요." });
        continue;
      }
      const template = templates.find(m => m.id === file.monthId)!;
      let coverage = preview.months.find(m => m.id === file.monthId);
      if (!coverage) { coverage = { id: file.monthId, label: template.label, bank: false, card: false }; preview.months.push(coverage); }
      coverage[file.source] = true;
      const current = snapshot.months.find(m => m.id === file.monthId);
      for (const incoming of template.transactions.filter(t => t.source === file.source)) {
        const old = current?.transactions.find(t => t.id === incoming.id);
        if (!old) preview.added++;
        // A repeated original file must preserve local corrections without asking again.
        else if (matches(old, incoming) || old.userEdited && old.original && matches(old.original, incoming)) preview.duplicates++;
        else preview.corrections.push({ id: incoming.id, title: incoming.title, monthId: file.monthId, before: old.amount, after: incoming.amount, userEdited: !!old.userEdited });
      }
    }
    preview.months.sort((a, b) => a.id.localeCompare(b.id));
    return preview;
  }
  function refresh() {
    snapshot.months.sort((a, b) => a.id.localeCompare(b.id));
    snapshot.months.forEach((month, index) => {
      summarize(month, snapshot.months[index - 1], snapshot.categories);
      if (month.id === "2026-09" && month.cardCoverage === "complete") {
        const baseline = templates.find(m => m.id === month.id)!;
        const difference = month.transactions.filter(t => t.source === "card").reduce((sum, t) => sum + t.amount, 0) - baseline.transactions.filter(t => t.source === "card").reduce((sum, t) => sum + t.amount, 0);
        const bill = month.payments.find(p => p.id === "oct-bill");
        if (bill) bill.amount = 740_000 + difference;
      }
    });
    return structuredClone(snapshot);
  }
  function editableTransaction(id: string) {
    const transaction = snapshot.months.flatMap(m => m.transactions).find(t => t.id === id);
    if (!transaction || transaction.source !== "card" || !isConsumption(transaction)) throw new Error("Select a card consumption sample");
    return transaction;
  }
  function writeAllocations(transaction: Transaction, allocations: { category: string; amount: number }[]) {
    const combined = new Map<string, number>();
    for (const part of allocations) combined.set(part.category, (combined.get(part.category) ?? 0) + part.amount);
    transaction.allocations = [...combined].filter(([, amount]) => amount !== 0).map(([category, amount]) => ({ category, amount }));
    transaction.category = transaction.allocations.length === 1 ? transaction.allocations[0]!.category : null;
  }
  function syncRefunds(transaction: Transaction) {
    if (transaction.kind === "refund") return;
    for (const refund of snapshot.months.flatMap(m => m.transactions).filter(t => t.kind === "refund" && t.relatedId === transaction.id)) {
      const parts = allocationsFor(transaction);
      if (Math.abs(refund.amount) === transaction.amount) {
        writeAllocations(refund, parts.map(a => ({ category: a.category, amount: -a.amount })));
        refund.classificationNote = "전체 취소이므로 원거래 배분을 되돌렸어요.";
      } else if (!refund.classificationUpdated) {
        writeAllocations(refund, [{ category: parts.length === 1 ? parts[0]!.category : unclassifiedCategory, amount: refund.amount }]);
        refund.classificationNote = parts.length > 1 ? "분할 구매의 부분 환불이에요. 어떤 항목의 환불인지 분류를 확인해주세요." : undefined;
      }
    }
  }
  function categoryName(name: string) {
    const value = name.trim();
    if (!value || snapshot.categories.includes(value)) throw new Error("겹치지 않는 카테고리 이름을 입력해주세요.");
    return value;
  }
  function replaceCategory(name: string, target: string) {
    if (!snapshot.categories.includes(name)) throw new Error("카테고리를 찾지 못했어요.");
    for (const transaction of snapshot.months.flatMap(m => m.transactions).filter(isConsumption)) {
      writeAllocations(transaction, allocationsFor(transaction).map(a => ({ ...a, category: a.category === name ? target : a.category })));
    }
    for (const [key, value] of categoryAliases) if (value === name) categoryAliases.set(key, target);
  }
  const calendar = createSyntheticCalendar(() => snapshot, refresh, scenario === "cash-shortfall");
  const actions: CashFlowActions = {
    ...calendar.actions,
    reclassify(id, category) {
      if (!snapshot.categories.includes(category)) throw new Error("Unknown category");
      const transaction = snapshot.months.flatMap(m => m.transactions).find(t => t.id === id);
      if (!transaction || !isConsumption(transaction)) throw new Error("Select a consumption transaction");
      writeAllocations(transaction, [{ category, amount: transaction.amount }]);
      transaction.classificationUpdated = true;
      transaction.classificationNote = undefined;
      syncRefunds(transaction);
      return refresh();
    },
    allocate(id, allocations) {
      const transaction = snapshot.months.flatMap(m => m.transactions).find(t => t.id === id);
      if (!transaction || !isConsumption(transaction) || !allocations.length || allocations.some(a => !snapshot.categories.includes(a.category) || !Number.isSafeInteger(a.amount) || Math.sign(a.amount) !== Math.sign(transaction.amount)) || allocations.reduce((sum, a) => sum + a.amount, 0) !== transaction.amount) throw new Error("배분 합계는 원거래 금액과 같아야 해요.");
      writeAllocations(transaction, allocations);
      transaction.classificationUpdated = true;
      transaction.classificationNote = undefined;
      syncRefunds(transaction);
      return refresh();
    },
    addCategory(name) {
      const value = categoryName(name);
      snapshot.categories.push(value);
      return refresh();
    },
    renameCategory(name, next) {
      if (name === unclassifiedCategory) throw new Error("미분류는 기본 분류예요.");
      const value = categoryName(next);
      replaceCategory(name, value);
      snapshot.categories = snapshot.categories.map(c => c === name ? value : c);
      return refresh();
    },
    mergeCategory(name, target) {
      if (name === unclassifiedCategory || name === target || !snapshot.categories.includes(target)) throw new Error("병합할 다른 카테고리를 선택해주세요.");
      replaceCategory(name, target);
      snapshot.categories = snapshot.categories.filter(c => c !== name);
      return refresh();
    },
    deleteCategory(name) {
      if (name === unclassifiedCategory) throw new Error("미분류는 기본 분류라 삭제할 수 없어요.");
      if (!snapshot.categories.includes(name)) throw new Error("카테고리를 찾지 못했어요.");
      replaceCategory(name, unclassifiedCategory);
      snapshot.categories = snapshot.categories.filter(c => c !== name);
      return refresh();
    },
    setPdfPasswordSaved(saved) {
      // Only a boolean is simulated. No password, encryption or network call exists.
      snapshot.pdfPasswordSaved = saved;
      return structuredClone(snapshot);
    },
    updateTransaction(id, edit) {
      const transaction = editableTransaction(id);
      const monthId = transaction.date.slice(0, 7);
      if (!edit.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(edit.date) || edit.date.slice(0, 7) !== monthId || !Number.isSafeInteger(edit.amount) || (transaction.kind === "refund" ? edit.amount >= 0 : edit.amount <= 0)) throw new Error("Check sample transaction fields");
      if (allocationsFor(transaction).length > 1 && edit.amount !== transaction.amount) throw new Error("분할된 거래는 먼저 하나의 분류로 합친 뒤 금액을 수정해주세요.");
      const category = allocationsFor(transaction)[0]?.category ?? unclassifiedCategory;
      transaction.original ??= { title: transaction.title, date: transaction.date, amount: transaction.amount, memo: transaction.memo };
      Object.assign(transaction, { ...edit, title: edit.title.trim(), userEdited: true });
      if (allocationsFor(transaction).length <= 1) writeAllocations(transaction, [{ category, amount: edit.amount }]);
      syncRefunds(transaction);
      return refresh();
    },
    restoreTransaction(id) {
      const transaction = editableTransaction(id);
      if (transaction.original) {
        const oldAmount = transaction.amount;
        Object.assign(transaction, transaction.original); delete transaction.original; transaction.userEdited = false;
        if (oldAmount !== transaction.amount) {
          const parts = allocationsFor(transaction);
          writeAllocations(transaction, [{ category: parts.length === 1 ? parts[0]!.category : unclassifiedCategory, amount: transaction.amount }]);
          if (parts.length > 1) transaction.classificationNote = "원래 금액으로 복원해 분류를 다시 확인해야 해요.";
        }
        syncRefunds(transaction);
      }
      return refresh();
    },
    applyImport(fileIds, decisions: Record<string, ImportDecision>) {
      const preview = previewImport(fileIds);
      if (!preview.months.length || preview.issues.length || preview.corrections.some(c => !decisions[c.id])) throw new Error("Resolve sample import issues first");
      for (const file of selectedFiles(fileIds)) {
        const template = templates.find(m => m.id === file.monthId)!;
        let month = snapshot.months.find(m => m.id === file.monthId);
        if (!month) {
          month = { ...structuredClone(template), bankCoverage: "missing", cardCoverage: "missing", bank: null, transactions: [], categories: [], payments: [], consumption: null, income: null, recurringConsumption: null, insight: null };
          snapshot.months.push(month);
        }
        for (const incoming of template.transactions.filter(t => t.source === file.source)) {
          const existing = month.transactions.find(t => t.id === incoming.id);
          if (!existing) month.transactions.push({ ...structuredClone(incoming), category: resolveCategory(incoming.category) });
          else if (decisions[incoming.id] === "replace") {
            const parts = allocationsFor(existing);
            const amountChanged = existing.amount !== incoming.amount;
            Object.assign(existing, { title: incoming.title, date: incoming.date, amount: incoming.amount, userEdited: false });
            if (isConsumption(existing) && amountChanged) {
              writeAllocations(existing, [{ category: parts.length === 1 ? parts[0]!.category : unclassifiedCategory, amount: incoming.amount }]);
              if (parts.length > 1) existing.classificationNote = "금액이 바뀌어 배분을 다시 확인해야 해요.";
              syncRefunds(existing);
            }
            delete existing.original;
          }
        }
        if (file.source === "bank") { month.bank = structuredClone(template.bank); month.bankCoverage = "complete"; }
        else month.cardCoverage = "complete";
        month.updatedAt = "샘플 반영 직후 · 메모리에서만 유지";
        month.payments = structuredClone(template.payments).map(p => (month!.cardCoverage !== "complete" && p.title.includes("카드")) || (month!.bankCoverage !== "complete" && p.status === "matched") ? { ...p, amount: null, status: "unconfirmed", note: "관련 자료를 가져오면 확인할 수 있어요.", transactionId: undefined } : p);
        month.insight = null;
      }
      snapshot.importHistory.unshift(`샘플 파일 ${fileIds.length}개 반영 · 메모리 시연`);
      return refresh();
    },
  };
  return { source: {
    read: () => structuredClone(snapshot),
    calendar: calendar.calendar,
    review(monthId: string) {
      const index = snapshot.months.findIndex(m => m.id === monthId);
      if (index === -1) throw new Error("Unknown sample month");
      return buildSyntheticReview(snapshot.months[index]!, snapshot.months[index - 1], scenario === "quiet", resolveCategory("식료품") ?? unclassifiedCategory);
    },
    spending: (monthId: string, category: string | null) => buildSyntheticSpending(snapshot, monthId, category),
    previewImport,
  }, actions };
}

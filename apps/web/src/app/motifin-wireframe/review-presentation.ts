import type { CashFlowMonth, MonthlyReview, ReviewFinding } from "@/entities/cash-flow/model";

const amount = (value: number) => `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(Math.abs(value) / 10_000)}만원`;

/** Presentation for the fixed synthetic storyboard, not a production analysis engine. */
export function buildSyntheticReview(month: CashFlowMonth, previous?: CashFlowMonth, quiet = false, groceryCategory = "식료품"): MonthlyReview {
  const consumptionChange = month.consumption !== null && previous?.consumption != null
    ? month.consumption - previous.consumption : null;
  const bank = month.bankCoverage === "complete" ? month.bank : null;
  const cashChange = bank ? bank.closing - bank.opening : null;
  const consumptionPhrase = consumptionChange === null ? "소비 비교는 자료 보완 후 확인해요."
    : consumptionChange < 0 ? "소비는 줄었어요." : consumptionChange > 0 ? "소비는 늘었어요." : "소비는 지난달과 같아요.";
  const cashPhrase = cashChange === null ? "통장 잔액은 은행 자료가 필요해요."
    : cashChange > 0 ? "통장 현금은 늘었어요." : cashChange < 0 ? "통장 현금은 줄었어요." : "통장 현금은 그대로예요.";
  const headline = consumptionChange === null && month.consumption !== null
    ? previous ? "확인된 이번 달 기록부터\n함께 살펴보세요." : "첫 한 달의 기록을\n함께 살펴보세요."
    : consumptionChange === null && cashChange === null ? "자료가 모이면\n한 달의 흐름이 보여요."
    : consumptionChange === null ? `${cashPhrase}\n${consumptionPhrase}`
    : `${consumptionPhrase}\n${cashPhrase}`;
  const findings: ReviewFinding[] = [];
  if (consumptionChange !== null && previous && !quiet) {
    const priorPurchase = previous.transactions.find(t => t.id === `${previous.id}-installment`);
    if (priorPurchase && !month.transactions.some(t => t.title === priorPurchase.title) && consumptionChange < 0) {
      const otherChange = consumptionChange + priorPurchase.amount;
      findings.push({
        id: "previous-one-off", title: `전월 가전 구매 ${amount(priorPurchase.amount)}의 영향이 커요`,
        description: `${previous.label}에는 가전 구매 원금을 한 번 반영했어요. 이를 제외한 나머지 소비는 ${amount(otherChange)} ${otherChange > 0 ? "늘었어요" : otherChange < 0 ? "줄었어요" : "차이가 없어요"}. 이번 달 할부 청구를 새 소비로 더하지 않아요.`,
        actionLabel: "전월 구매 근거", target: { type: "transaction", monthId: previous.id, id: priorPurchase.id },
      });
    }
    const grocery = month.categories.find(c => c.name === groceryCategory);
    const priorGrocery = previous.categories.find(c => c.name === groceryCategory);
    if (grocery && priorGrocery && grocery.amount !== priorGrocery.amount) {
      const change = grocery.amount - priorGrocery.amount;
      findings.push({
        id: "grocery-change", title: `${grocery.name} 소비는 ${amount(change)} ${change > 0 ? "늘었어요" : "줄었어요"}`,
        description: `${previous.label} ${amount(priorGrocery.amount)} → ${month.label} ${amount(grocery.amount)}. 취소·환불과 현재 분류를 반영했어요. 두 달 비교이며 평소 패턴을 뜻하지 않아요.`,
        actionLabel: "관련 거래 보기", target: { type: "category", monthId: month.id, category: grocery.name },
      });
    }
  }
  return {
    headline, consumptionChange, cashChange, findings: findings.slice(0, 2),
    incoming: bank ? [
      { id: "income", label: "급여·외부 소득", amount: bank.incoming - bank.transfersIn, detail: "다른 내 계좌에서 받은 돈은 제외", transactionIds: month.transactions.filter(t => t.source === "bank" && t.kind === "income").map(t => t.id) },
      { id: "transfer-in", label: "다른 내 계좌에서", amount: bank.transfersIn, detail: "소득이 아닌 계좌 간 이동", transactionIds: month.transactions.filter(t => t.id.endsWith("-transfer-in")).map(t => t.id) },
    ] : [],
    outgoing: bank ? [
      { id: "direct", label: "직접 소비·비용", amount: bank.outgoing - bank.cardPayment - bank.transfersOut, detail: "본 계좌에서 직접 납부한 월세·공과금·비용", transactionIds: month.transactions.filter(t => t.source === "bank" && (t.kind === "purchase" || t.kind === "fee")).map(t => t.id) },
      { id: "card-payment", label: "카드대금", amount: bank.cardPayment, detail: "이전 이용분의 청구 출금 · 이번 달 소비와 중복 제외", transactionIds: month.transactions.filter(t => t.kind === "card-payment").map(t => t.id) },
      { id: "transfer-out", label: "다른 내 계좌로", amount: bank.transfersOut, detail: "소비가 아닌 이동 · 상대 계좌 잔액은 미수집", transactionIds: month.transactions.filter(t => t.id.endsWith("-transfer-out")).map(t => t.id) },
    ] : [],
  };
}

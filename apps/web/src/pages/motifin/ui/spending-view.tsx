import { ArrowLeft, ArrowRight, SlidersHorizontal } from "lucide-react";
import type { CashFlowMonth, SpendingAnalysis, SpendingLens, SpendingSort, Transaction } from "@/entities/cash-flow/model";
import { Button } from "@/shared/ui/button";
import { Section, TransactionList } from "./components";
import { compactMoney } from "./format";

type Props = {
  month: CashFlowMonth; analysis: SpendingAnalysis; lens: SpendingLens; sort: SpendingSort;
  onLens: (lens: SpendingLens) => void; onSort: (sort: SpendingSort) => void;
  onCategory: (name: string | null) => void; onTransaction: (id: string) => void;
  onManage: () => void; onMonth: (id: string) => void;
};
const lenses: { id: SpendingLens; title: string; hint: string }[] = [
  { id: "size", title: "어디에 썼나", hint: "큰 비중부터 거래까지" },
  { id: "changes", title: "무엇이 달라졌나", hint: "늘고 줄어든 분류" },
  { id: "recurring", title: "반복·일회성", hint: "꾸준한 지출과 큰 구매" },
  { id: "classification", title: "분류 확인", hint: "미분류·복합 결제 정리" },
];
function delta(value: number | null) { return value === null ? "비교할 자료 없음" : value === 0 ? "전월과 같음" : `${compactMoney(Math.abs(value))} ${value > 0 ? "증가" : "감소"}`; }
function Trend({ analysis, selectedMonth, onMonth }: { analysis: SpendingAnalysis; selectedMonth: string; onMonth: (id: string) => void }) {
  const maximum = Math.max(1, ...analysis.trend.map(t => Math.abs(t.amount ?? 0)));
  return <div className="mf-spending-trend">{analysis.trend.map(item => <button key={item.id} aria-pressed={item.id === selectedMonth} onClick={() => onMonth(item.id)}>
    <strong>{item.amount === null ? "자료 부족" : compactMoney(item.amount)}</strong>
    <span className="mf-trend-track" aria-hidden="true"><i style={{ height: item.amount === null ? "0%" : `${Math.max(2, Math.abs(item.amount) / maximum * 100)}%` }} /></span>
    <span>{item.label}</span>
  </button>)}</div>;
}
function Merchants({ analysis, onTransaction }: { analysis: SpendingAnalysis; onTransaction: (id: string) => void }) {
  return <ol className="mf-merchant-list">{analysis.merchants.slice(0, 5).map((merchant, index) => <li key={merchant.name}><details>
    <summary className="mf-merchant-summary"><span className="mf-rank">{index + 1}</span><span><strong>{merchant.name}</strong><small>구매 {merchant.count}건 · 취소·환불 반영</small></span><b>{compactMoney(merchant.amount)}</b><ArrowRight size={13} aria-hidden="true" /></summary>
    <TransactionList transactions={analysis.transactions.filter(t => merchant.transactionIds.includes(t.id))} allocatedAmounts={analysis.allocatedAmounts} onOpen={onTransaction} />
  </details></li>)}</ol>;
}
export function SpendingView({ month, analysis, lens, sort, onLens, onSort, onCategory, onTransaction, onManage, onMonth }: Props) {
  const category = analysis.category;
  const sorted = analysis.categories.toSorted((a, b) => sort === "increase" ? (b.change ?? 0) - (a.change ?? 0) : sort === "decrease" ? (a.change ?? 0) - (b.change ?? 0) : b.amount - a.amount);
  const transactions: Transaction[] = !category && lens === "recurring" ? analysis.transactions.filter(t => t.recurring) : !category && lens === "classification" ? analysis.transactions.filter(t => analysis.unclassifiedIds.includes(t.id)) : analysis.transactions;
  return <>
    <div className="mf-spending-toolbar">
      {category ? <button className="mf-text-action" onClick={() => onCategory(null)}><ArrowLeft size={15} />전체 소비로</button> : <span className="mf-eyebrow">규모에서 원인으로</span>}
      <Button variant="outline" onClick={onManage}><SlidersHorizontal size={15} />카테고리 관리</Button>
    </div>
    <div className="mf-page-intro"><h2>{category ?? "어디서 달라졌는지 살펴보세요."}</h2><p>{category ? "이 분류의 변화·구매 빈도·가맹점과 원거래를 함께 봐요." : "보고 싶은 관점을 고르고, 카테고리를 눌러 자세히 들어가세요."}</p></div>
    {analysis.total === null ? <div className="mf-inline-warning">일부 자료만 확인돼요. 아래 금액·건수는 확보한 거래 기준이며 전체 비중·전월 비교는 보류해요.</div> : null}
    <section className="mf-spending-overview">
      <div className="mf-total-line"><span>{category ? "이 카테고리" : "확인된 소비"}</span><strong>{compactMoney(analysis.amount)}</strong></div>
      <p className="mf-spending-delta">{delta(analysis.change)}{analysis.share !== null ? ` · 전체의 ${analysis.share.toFixed(1)}%` : ""}</p>
      <dl className="mf-spending-metrics"><div><dt>구매·비용 발생</dt><dd>{analysis.purchaseCount}건</dd><small>{analysis.previousPurchaseCount === null ? "전월 비교 불가" : `전월 ${analysis.previousPurchaseCount}건`}</small></div><div><dt>건당 평균 · 취소 전</dt><dd>{compactMoney(analysis.averagePurchase)}</dd><small>{analysis.previousAveragePurchase === null ? "전월 비교 불가" : `전월 ${compactMoney(analysis.previousAveragePurchase)}`}</small></div><div><dt>취소·환불 반영</dt><dd>{compactMoney(analysis.refunds)}</dd></div></dl>
    </section>
    {!category ? <nav className="mf-analysis-lenses" aria-label="소비 분석 관점">{lenses.map(item => <button key={item.id} aria-pressed={lens === item.id} onClick={() => onLens(item.id)}><strong>{item.title}</strong><small>{item.hint}</small></button>)}</nav> : null}

    {category || lens === "changes" ? <Section title={category ? "이 분류의 월별 변화" : "소비는 어떻게 변했나요"}><Trend analysis={analysis} selectedMonth={month.id} onMonth={onMonth} /><p className="mf-muted">자료가 있는 달만 보여줘요. 부족한 달을 0원으로 비교하거나 두 달을 평소 패턴으로 해석하지 않아요.</p></Section> : null}

    {!category && (lens === "size" || lens === "changes") ? <Section title={lens === "changes" ? "변화를 만든 카테고리" : "카테고리에서 더 알아보기"}>
      <label className="mf-field">정렬<select value={sort} onChange={e => onSort(e.target.value as SpendingSort)}><option value="amount">금액이 큰 순</option><option value="increase" disabled={analysis.previous === null}>전월 증가액 순</option><option value="decrease" disabled={analysis.previous === null}>전월 감소액 순</option></select></label>
      <ul className="mf-category-ranking">{sorted.map((row, index) => <li key={row.name}><button onClick={() => onCategory(row.name)}>
        <span className="mf-rank">{index + 1}</span><span className="mf-category-ranking-name"><strong>{row.name}</strong><small>{row.count}건{row.share !== null ? ` · ${row.share.toFixed(1)}%` : " · 비중 보류"}</small><i className="mf-category-mini-track" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, row.share ?? 0))}%` }} /></i></span>
        <span className="mf-category-ranking-value"><strong>{compactMoney(row.amount)}</strong><small>{delta(row.change)}</small></span><ArrowRight size={14} aria-hidden="true" />
      </button></li>)}</ul>
      <p className="mf-muted">카테고리를 누르면 거래·가맹점·추이로 들어가요. 분할 거래는 각 분류에서 집계되지만 전체 원거래 건수는 늘지 않아요.</p>
    </Section> : null}

    {category || lens === "recurring" ? <Section title="반복 지출과 일회성 소비"><dl className="mf-metric-grid"><div className="mf-metric"><dt>반복으로 표시된 소비</dt><dd>{compactMoney(analysis.recurring)}</dd></div><div className="mf-metric"><dt>그 밖의 소비</dt><dd>{compactMoney(analysis.other)}</dd></div></dl><p className="mf-muted">확인된 반복 여부를 기준으로 해요. 소비 발생액이며 앞으로의 청구·출금 예정과 달라요.</p>{!category ? <TransactionList transactions={analysis.transactions.filter(t => !t.recurring && t.kind !== "refund").toSorted((a, b) => b.amount - a.amount).slice(0, 3)} onOpen={onTransaction} /> : null}</Section> : null}

    {!category && lens === "classification" ? <Section title="목적을 확인할 거래"><div className="mf-total-line"><span>미분류 {analysis.unclassifiedCount}건</span><strong>{compactMoney(analysis.unclassifiedAmount)}</strong></div><p className="mf-muted">PG사·종합몰 표기만으로 구매 목적을 추측하지 않아요. 미분류도 소비 총액에 포함돼요.</p><Button className="mf-full" onClick={() => onCategory("미분류")}>미분류 거래 확인·금액 나누기 <ArrowRight size={16} /></Button><p className="mf-muted">현재 나눠 분류한 구매 {analysis.splitCount}건 · 한 거래 안의 여러 소비 목적을 따로 배분할 수 있어요.</p></Section> : null}

    {category || lens === "size" ? <Section title="어느 가맹점에서 썼나요"><Merchants analysis={analysis} onTransaction={onTransaction} /><p className="mf-muted">금액이 큰 5곳 · 펼치면 해당 가맹점의 거래들을 볼 수 있어요. 결제 대행·종합몰 이름은 소비 카테고리가 아니에요.</p></Section> : null}

    {!category && lens !== "classification" ? <button className="mf-classification-cta" onClick={() => { onLens("classification"); }}><span>아직 목적을 모르는 소비<strong>{analysis.unclassifiedCount}건 · {compactMoney(analysis.unclassifiedAmount)}</strong></span><ArrowRight size={18} aria-hidden="true" /></button> : null}
    {!category && lens === "classification" && analysis.splitIds.length ? <Section title="나눠 분류한 거래"><TransactionList transactions={analysis.transactions.filter(t => analysis.splitIds.includes(t.id))} onOpen={onTransaction} /></Section> : null}
    <Section title={category ? "이 카테고리의 원거래" : lens === "recurring" ? "반복 지출 근거" : lens === "classification" ? "분류를 확인할 원거래" : "거래를 열어 확인·수정"}>
      <TransactionList transactions={transactions} allocatedAmounts={analysis.allocatedAmounts} onOpen={onTransaction} />
      <p className="mf-muted">분류·금액 분할은 원거래에서 수정해요. 원거래 금액과 배분액을 구분하고 취소·환불도 연결해 보여줘요.</p>
    </Section>
  </>;
}

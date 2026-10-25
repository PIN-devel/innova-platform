import { useState } from "react";
import type { CalendarEdit, CalendarEvent, CashCalendar } from "@/entities/cash-flow/model";
import { Section } from "./components";
import { money } from "./format";
import { CalendarEventEditor } from "./calendar-event-editor";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type Props = {
  plan: CashCalendar; onMonth: (month: string) => void; onImport: () => void;
  onTransaction: (id: string) => void;
  onSave: (id: string | null, edit: CalendarEdit, scope: "once" | "future") => void;
  onChange: (id: string, change: "skip" | "resume" | "end") => void;
  onProtected: (amount: number) => void;
};
export function UpcomingView({ plan, onMonth, onImport, onTransaction, onSave, onChange, onProtected }: Props) {
  const [editing, setEditing] = useState<CalendarEvent | "new" | null>(null);
  const [protectedDraft, setProtectedDraft] = useState(String(plan.protectedAmount));
  const [error, setError] = useState("");
  const next = plan.months.find(month => month > plan.monthId);
  return <>
    <div className="mf-page-intro"><h2>{plan.historical ? "입출금 기록을 확인해요." : "들어올 돈과 나갈 돈, 함께."}</h2><p>월급·소비 통장 1개 · {plan.asOf.replaceAll("-", ".")} 자료 기준 · 실시간 잔액이 아니에요.</p></div>
    {plan.historical ? <Section title="확인된 월말 잔액"><p className="mf-large-amount">{money(plan.projected)}</p><p className="mf-muted">지난달의 실제 기록이에요. 당시 예측 기록은 만들지 않아요.</p>{next ? <Button className="mf-full" onClick={() => onMonth(next)}>{Number(next.slice(5))}월 자금 계획 보기</Button> : null}</Section> : <>
      <Section title="남은 생활비 예상"><p className="mf-large-amount">{plan.available === null ? "확인이 필요해요" : money(plan.available)}</p><p className="mf-muted">예정 수입까지 반영한 월말 기준이에요. 앞으로의 식비·쇼핑 등에 쓸 몫이며, 오늘 바로 쓸 수 있는 잔액은 아니에요.</p>
        {plan.warnings.length ? <div className="mf-inline-note"><strong>계산에 빠진 항목이 있어요</strong>{plan.warnings.map(warning => <p key={warning}>{warning}</p>)}<Button variant="outline" onClick={onImport}>자료 갱신</Button></div> : null}
        {plan.lowest ? <div className={`mf-calendar-low ${plan.lowest.amount < 0 ? "is-shortfall" : ""}`}><strong>{plan.lowest.amount < 0 ? `${plan.lowest.date.slice(5).replace("-", ".")}에 ${money(-plan.lowest.amount)} 부족 예상` : `확인된 구간 최저 잔액 ${money(plan.lowest.amount)}`}</strong><p>{plan.lowest.amount < 0 ? "월말에 돈이 남아도 수입 전에는 부족할 수 있어요." : `${plan.lowest.date.slice(5).replace("-", ".")} 기준 · 같은 날 입출금 순서는 확인하지 않았어요.`}</p></div> : null}
        <p className="mf-muted">{plan.nextIncome ? `${plan.nextIncome.slice(5).replace("-", ".")} 다음 수입 전` : "남은 기간"} 확인된 출금 {money(plan.beforeIncome)}{plan.unknownCount ? " + 미확인 금액" : ""}</p>
      </Section>
      <Section title="예상 금액의 근거"><dl className="mf-calendar-calculation"><div><dt>{plan.monthId === "2026-10" ? "마지막 확인 잔액" : "이전 계획을 반영한 시작 잔액"}</dt><dd>{money(plan.opening)}</dd></div><div><dt>남은 예정 수입</dt><dd>+{money(plan.income)}</dd></div><div><dt>확인된 예정 출금</dt><dd>−{money(plan.outgoing)}</dd></div><div className="mf-calendar-total"><dt>월말 예상 잔액</dt><dd>{money(plan.projected)}</dd></div><div><dt>이후 납부를 위해 남길 카드 금액</dt><dd>−{money(plan.futureCardReserve)}</dd></div><div><dt>따로 남겨둘 금액</dt><dd>−{money(plan.protectedAmount)}</dd></div></dl>
        <p className="mf-muted">카드 금액은 이번 달 출금에 포함되지 않은 잔여 할부와 등록한 카드 이용 계획이에요. 새 생활비 지출은 아직 반영하지 않았어요.</p>
        <form className="mf-calendar-protected" onSubmit={e => { e.preventDefault(); try { onProtected(Number(protectedDraft)); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "금액을 확인해주세요."); } }}><label className="mf-field">따로 남겨둘 금액 · 선택<Input type="number" min="0" step="1" required value={protectedDraft} onChange={e => setProtectedDraft(e.target.value)} /></label><Button type="submit" variant="outline">금액 반영</Button></form>{error ? <p role="alert">{error}</p> : null}
      </Section>
      <Section title="날짜별 입출금 계획" aside={<Button variant="outline" onClick={() => setEditing("new")}>일정 추가</Button>}><p className="mf-muted">계획은 실제 거래·잔액을 바꾸지 않아요. 카드 이용과 포인트는 통장 출금 합계에서 제외해요.</p>
        <ul className="mf-payment-list">{plan.items.map(item => <li key={item.id}><button className="mf-calendar-event" onClick={() => setEditing(item)}><span className="mf-date-box"><small>{Number(item.date.slice(5, 7))}월</small><strong>{Number(item.date.slice(8))}</strong></span><span className="mf-payment-body"><strong>{item.title}</strong><small>{item.status === "skipped" ? "이번 회차 제외" : item.method === "points" ? "포인트 · 현금 제외" : item.method === "card" ? "카드 이용 · 이후 납부" : item.direction === "income" ? "예정 입금" : item.direction === "transfer" ? "계좌 이동 · 소비 아님" : "예정 출금"} · {item.repeat === "monthly" ? "매월" : "한 번"}</small><small>{item.method === "bank" ? `당일 말 예상 잔액 ${money(item.balance)}` : "통장 예상 잔액에 직접 더하거나 빼지 않아요"}</small></span><span className="mf-calendar-event-amount"><strong>{item.amount === null ? "미확인" : money(item.amount)}</strong><small>{item.amount === null ? "금액 입력 필요" : item.certainty === "estimate" ? "예상액" : "확인한 금액"}</small></span></button></li>)}</ul>
        {!plan.items.length ? <p>등록한 일정이 없어요. 확인한 계획을 추가해주세요.</p> : null}
      </Section>
      <p className="mf-footnote">소비재는 직접 정한 구매 계획·정기배송만 포함해요. 세제·영양제·화장품의 재구매 시점은 예측하지 않아요.</p>
    </>}
    {plan.completed.length ? <Section title="확인된 실제 입출금"><details open={plan.historical}><summary>실제 거래 {plan.completed.length}건</summary><ul className="mf-payment-list">{plan.completed.map(item => <li key={item.id}><Button variant="ghost" className="mf-payment" onClick={() => onTransaction(item.transactionId!)}><span className="mf-payment-body"><strong>{item.title}</strong><small>{item.date.slice(5).replace("-", ".")} · 실제 거래</small></span><strong>{money(item.amount)}</strong></Button></li>)}</ul></details></Section> : null}
    {editing ? <CalendarEventEditor key={editing === "new" ? "new" : editing.id} event={editing === "new" ? null : editing} monthId={plan.monthId} onClose={() => setEditing(null)} onSave={onSave} onChange={onChange} /> : null}
  </>;
}

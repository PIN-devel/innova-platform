import { useState } from "react";
import type { CalendarEdit, CalendarEvent } from "@/entities/cash-flow/model";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Sheet } from "./components";

type Props = { event: CalendarEvent | null; monthId: string; onClose: () => void; onSave: (id: string | null, edit: CalendarEdit, scope: "once" | "future") => void; onChange: (id: string, change: "skip" | "resume" | "end") => void };
export function CalendarEventEditor({ event, monthId, onClose, onSave, onChange }: Props) {
  const [draft, setDraft] = useState<CalendarEdit>(() => event ?? { title: "", date: `${monthId}-05`, amount: null, direction: "expense", method: "bank", certainty: "estimate", repeat: "none", note: "" });
  const [scope, setScope] = useState<"once" | "future">("once");
  const [error, setError] = useState("");
  function run(action: () => void) { try { action(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "일정을 확인해주세요."); } }
  const locked = event?.id.startsWith("plan-bill@");
  return <Sheet title={event ? "일정 확인·편집" : "입출금 계획 추가"} onClose={onClose}>
    {locked ? <p className="mf-inline-note">{event?.note} · 청구 자료에서 확인된 금액이에요. 카드 소비 내역을 보정하면 함께 갱신돼요.</p> : <form className="mf-calendar-editor" onSubmit={e => { e.preventDefault(); run(() => onSave(event?.id ?? null, draft, scope)); }}>
      <label className="mf-field">이름<Input required value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="예: 화장품 구매 계획" /></label>
      <label className="mf-field">날짜<Input type="date" max="2030-12-31" required value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
      <label className="mf-field">금액 · 모르면 비워두세요<Input type="number" min="0" step="1" value={draft.amount ?? ""} onChange={e => setDraft({ ...draft, amount: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      <label className="mf-field">구분<select value={draft.direction} onChange={e => setDraft({ ...draft, direction: e.target.value as CalendarEdit["direction"] })}><option value="income">수입</option><option value="expense">지출</option><option value="transfer">다른 내 계좌로 이체</option></select></label>
      <label className="mf-field">결제·지급 방식<select value={draft.method} onChange={e => setDraft({ ...draft, method: e.target.value as CalendarEdit["method"] })}><option value="bank">월급·소비 통장</option><option value="card">카드 이용 · 이후 납부</option><option value="points">포인트 · 현금 계산 제외</option></select></label>
      <label className="mf-field">금액 근거<select value={draft.certainty} onChange={e => setDraft({ ...draft, certainty: e.target.value as CalendarEdit["certainty"] })}><option value="estimate">예상액</option><option value="confirmed">확인한 금액</option></select></label>
      {!event ? <label className="mf-field">주기<select value={draft.repeat} onChange={e => setDraft({ ...draft, repeat: e.target.value as CalendarEdit["repeat"] })}><option value="none">한 번</option><option value="monthly">매월 · 직접 정한 일정</option></select></label> : event.repeat === "monthly" ? <label className="mf-field">변경 범위<select value={scope} onChange={e => setScope(e.target.value as "once" | "future")}><option value="once">이번 회차만</option><option value="future">이번 회차와 이후 반복</option></select></label> : null}
      <label className="mf-field">메모<Input value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
      <p className="mf-muted">소비재는 직접 정한 구매 계획·정기배송만 등록해요. 재고나 구매 간격으로 재구매일을 예측하지 않아요.</p>
      <p className="mf-muted">카드 이용 계획은 통장 출금에 더하지 않고, 이후 납부할 금액으로 남겨둬요. 이미 청구액에 포함된 이용을 다시 등록하지 마세요.</p>
      {error ? <p role="alert">{error}</p> : null}
      <Button type="submit" className="mf-full">계획 반영</Button>
      {event ? <div className="mf-calendar-actions"><Button type="button" variant="outline" onClick={() => run(() => onChange(event.id, event.status === "skipped" ? "resume" : "skip"))}>{event.status === "skipped" ? "이번 회차 다시 포함" : "이번 회차 건너뛰기"}</Button>{event.repeat === "monthly" ? <Button type="button" variant="outline" onClick={() => run(() => onChange(event.id, "end"))}>이번 회차부터 반복 종료</Button> : null}</div> : null}
    </form>}
  </Sheet>;
}

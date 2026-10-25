import { useState } from "react";
import type { Transaction, TransactionEdit } from "@/entities/cash-flow/model";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { money } from "./format";

export function TransactionEditor({ transaction, onSave, onRestore }: { transaction: Transaction; onSave: (edit: TransactionEdit) => void; onRestore: () => void }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ title: transaction.title, date: transaction.date, amount: String(transaction.amount), memo: transaction.memo ?? "" });
  const month = transaction.date.slice(0, 7);
  function beginEdit() {
    setDraft({ title: transaction.title, date: transaction.date, amount: String(transaction.amount), memo: transaction.memo ?? "" });
    setError(""); setEditing(true);
  }
  return <div className="mf-transaction-editor">
    {transaction.userEdited && transaction.original ? <div className="mf-inline-note"><strong>앱에서 수정한 거래</strong><p>가져온 값: {transaction.original.title} · {transaction.original.date} · {money(transaction.original.amount)}</p><Button variant="outline" onClick={() => { onRestore(); setEditing(false); }}>가져온 값으로 되돌리기</Button></div> : null}
    {transaction.memo ? <p className="mf-muted">메모 · {transaction.memo}</p> : null}
    {!editing ? <Button variant="outline" onClick={beginEdit}>앱에서 거래 수정</Button> : <form onSubmit={e => {
      e.preventDefault();
      const amount = Number(draft.amount);
      if (!draft.title.trim() || !Number.isSafeInteger(amount) || draft.date.slice(0, 7) !== month || (transaction.kind === "refund" ? amount >= 0 : amount <= 0)) { setError("거래명·금액을 확인해주세요. 이 시안의 날짜 수정은 같은 달 안에서 가능해요."); return; }
      try { onSave({ ...draft, amount }); setEditing(false); setError(""); } catch (error) { setError(error instanceof Error ? error.message : "수정하지 못했어요."); }
    }}>
      <label className="mf-field">거래명<Input value={draft.title} required onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label className="mf-field">이용일<Input type="date" value={draft.date} required min={`${month}-01`} max={`${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
      <label className="mf-field">금액 (원)<Input type="number" step="1" value={draft.amount} readOnly={(transaction.allocations?.length ?? 0) > 1} required onChange={e => setDraft({ ...draft, amount: e.target.value })} /></label>
      {(transaction.allocations?.length ?? 0) > 1 ? <p className="mf-muted">분할된 거래의 총액을 바꾸려면 먼저 카테고리 배분에서 한 분류로 합쳐주세요.</p> : null}
      <label className="mf-field">메모<Input value={draft.memo} onChange={e => setDraft({ ...draft, memo: e.target.value })} /></label>
      {error ? <p role="alert" className="mf-inline-warning">{error}</p> : null}
      <div className="mf-editor-actions"><Button type="submit">수정값 반영</Button><Button variant="outline" type="button" onClick={() => setEditing(false)}>취소</Button></div>
      <p className="mf-muted">합성 거래 수정 시연이에요. 가져온 값은 따로 유지하고 수정값을 집계에 반영해요.</p>
    </form>}
  </div>;
}

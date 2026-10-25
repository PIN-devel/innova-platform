import { useState } from "react";
import type { CategoryAllocation, Transaction } from "@/entities/cash-flow/model";
import { allocationsFor, unclassifiedCategory } from "@/entities/cash-flow/classification";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { money } from "./format";

type Props = { transaction: Transaction; categories: string[]; onSave: (parts: CategoryAllocation[]) => void; onAddCategory: (name: string) => void };
export function AllocationEditor({ transaction, categories, onSave, onAddCategory }: Props) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => allocationsFor(transaction).map(a => ({ category: a.category, amount: String(Math.abs(a.amount)) })));
  const [newCategory, setNewCategory] = useState("");
  const [message, setMessage] = useState("");
  const total = Math.abs(transaction.amount);
  const allocated = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const remaining = total - allocated;
  const current = allocationsFor(transaction);
  function start() { setRows(allocationsFor(transaction).map(a => ({ category: a.category, amount: String(Math.abs(a.amount)) }))); setMessage(""); setEditing(true); }
  return <section className="mf-allocation-editor">
    <div className="mf-section-heading"><h3>카테고리 배분</h3><Button variant="outline" onClick={start}>{current.length > 1 ? "분할 편집" : "분류·금액 나누기"}</Button></div>
    <ul className="mf-allocation-summary">{current.map(a => <li key={a.category}><span>{a.category}</span><strong>{money(a.amount)}</strong></li>)}</ul>
    {transaction.classificationNote ? <p className="mf-inline-warning">{transaction.classificationNote}</p> : null}
    {editing ? <>
      <p className="mf-muted">원거래 {money(transaction.amount)}를 나눠요. {transaction.kind === "refund" ? "환불 배분은 양수로 입력하면 환불 금액으로 반영돼요." : "카테고리를 정해도 다음 같은 가맹점 거래에 자동 적용하지 않아요."}</p>
      <form onSubmit={e => {
        e.preventDefault();
        try {
          if (remaining !== 0 || rows.some(r => !Number.isSafeInteger(Number(r.amount)) || Number(r.amount) <= 0)) throw new Error("배분 합계를 원거래 금액에 맞춰주세요. 모르는 금액은 미분류로 남길 수 있어요.");
          onSave(rows.map(r => ({ category: r.category, amount: Number(r.amount) * Math.sign(transaction.amount) })));
          setEditing(false); setMessage("분류를 반영했어요. 총액과 원거래 건수는 그대로예요.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "분류를 반영하지 못했어요."); }
      }}>
        {rows.map((row, index) => <div className="mf-allocation-row" key={index}>
          <label className="mf-field">카테고리 {index + 1}<select value={row.category} onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, category: e.target.value } : r))}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="mf-field">배분액 (원)<Input type="number" min="1" step="1" required value={row.amount} onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, amount: e.target.value } : r))} /></label>
          <Button type="button" variant="ghost" aria-label={`${index + 1}번 배분 삭제`} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, i) => i !== index))}>삭제</Button>
        </div>)}
        <p className={remaining < 0 ? "mf-inline-warning" : "mf-inline-note"} role="status">배분 합계 {money(allocated)} / 남은 금액 {money(remaining)}</p>
        <div className="mf-editor-actions"><Button type="button" variant="outline" onClick={() => setRows([...rows, { category: unclassifiedCategory, amount: remaining > 0 ? String(remaining) : "" }])}>배분 추가</Button><Button type="button" variant="ghost" onClick={() => setRows([{ category: unclassifiedCategory, amount: String(total) }])}>한 분류로 합치기</Button></div>
        <Button type="submit" className="mf-full">분류 반영</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>취소</Button>
      </form>
      <div className="mf-inline-category-create"><label className="mf-field">목록에 없는 카테고리<Input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="새 카테고리 이름" /></label><Button variant="outline" onClick={() => {
        try { onAddCategory(newCategory); const name = newCategory.trim(); setRows(rows.map((r, index) => index === rows.length - 1 ? { ...r, category: name } : r)); setNewCategory(""); setMessage("새 카테고리를 마지막 배분에 선택했어요."); }
        catch (error) { setMessage(error instanceof Error ? error.message : "추가하지 못했어요."); }
      }}>새 카테고리 추가</Button></div>
    </> : null}
    <p role="status" className="mf-muted">{message}</p>
  </section>;
}

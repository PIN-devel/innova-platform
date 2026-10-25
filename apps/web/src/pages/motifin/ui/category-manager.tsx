import { useState } from "react";
import type { CashFlowSnapshot } from "@/entities/cash-flow/model";
import { allocationsFor, unclassifiedCategory } from "@/entities/cash-flow/classification";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type Props = {
  snapshot: CashFlowSnapshot;
  onAdd: (name: string) => void; onRename: (name: string, next: string) => void;
  onMerge: (name: string, target: string) => void; onDelete: (name: string) => void;
  onCategory: (name: string) => void;
};
export function CategoryManager({ snapshot, onAdd, onRename, onMerge, onDelete, onCategory }: Props) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [nextName, setNextName] = useState("");
  const [target, setTarget] = useState(unclassifiedCategory);
  const [message, setMessage] = useState("");
  function perform(action: () => void, success: string) {
    try { action(); setMessage(success); setEditing(null); } catch (error) { setMessage(error instanceof Error ? error.message : "처리하지 못했어요."); }
  }
  return <div className="mf-category-manager">
    <p className="mf-muted">전체 기간에 사용하는 내 카테고리예요. 삭제하면 연결 거래는 미분류로 이동해요. 거래 금액과 다른 분할 배분은 유지돼요.</p>
    <form onSubmit={e => { e.preventDefault(); perform(() => { onAdd(name); setName(""); }, "카테고리를 추가했어요."); }}>
      <label className="mf-field">새 카테고리 이름<Input value={name} required onChange={e => setName(e.target.value)} placeholder="예: 취미" /></label>
      <Button type="submit" className="mf-full">새 카테고리 추가</Button>
    </form>
    <p role="status" className="mf-muted">{message}</p>
    <ul className="mf-category-management-list">{snapshot.categories.map(category => {
      const count = snapshot.months.flatMap(m => m.transactions).filter(t => allocationsFor(t).some(a => a.category === category)).length;
      return <li key={category}>
        <div className="mf-section-heading"><button className="mf-text-action" onClick={() => onCategory(category)}>{category} · 전체 {count}건</button>{category !== unclassifiedCategory ? <div className="mf-category-actions"><Button variant="ghost" onClick={() => { setEditing(category); setNextName(category); setTarget(unclassifiedCategory); setMessage(""); }}>편집</Button><Button variant="destructive" aria-label={`${category} 삭제 · 거래 ${count}건 미분류로 이동`} onClick={() => perform(() => onDelete(category), `${category} 삭제 · 거래 ${count}건을 미분류로 옮겼어요.`)}>삭제</Button></div> : <span className="mf-tag">기본 분류</span>}</div>
        {editing === category ? <div className="mf-category-edit">
          <label className="mf-field">이름<Input value={nextName} onChange={e => setNextName(e.target.value)} /></label>
          <Button variant="outline" disabled={nextName.trim() === category} onClick={() => perform(() => onRename(category, nextName), "전체 기간의 이름을 바꿨어요.")}>이름 변경</Button>
          <label className="mf-field">병합할 카테고리<select value={target} onChange={e => setTarget(e.target.value)}>{snapshot.categories.filter(c => c !== category).map(c => <option key={c}>{c}</option>)}</select></label>
          <p className="mf-muted">모든 기간의 연결 거래 {count}건을 선택한 분류로 옮기고 이 카테고리를 없애요. 같은 거래의 분할 항목도 함께 정리돼요.</p>
          <Button variant="outline" onClick={() => perform(() => onMerge(category, target), `${target}(으)로 병합했어요.`)}>거래 {count}건 이동 후 병합</Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>닫기</Button>
        </div> : null}
      </li>;
    })}</ul>
  </div>;
}

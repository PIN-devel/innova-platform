import type { ReactNode } from "react";
import { ChevronRight, CreditCard, Landmark } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import type { CashFlowMonth, Transaction } from "@/entities/cash-flow/model";
import { isConsumption, unclassifiedCategory } from "@/entities/cash-flow/classification";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { money } from "./format";
export function Section({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <Card className={`mf-card ${className}`}><CardHeader><div className="mf-section-heading"><CardTitle><h2>{title}</h2></CardTitle>{aside}</div></CardHeader><CardContent>{children}</CardContent></Card>;
}
export function Metric({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return <div className="mf-metric"><dt>{label}</dt><dd>{money(value)}</dd>{hint ? <p>{hint}</p> : null}</div>;
}
export function CoverageNotice({ month, onImport, compact = false }: { month: CashFlowMonth; onImport: () => void; compact?: boolean }) {
  const complete = month.bankCoverage === "complete" && month.cardCoverage === "complete";
  if (complete && compact) return <p className="mf-review-status"><span aria-hidden="true" />은행·카드 샘플 확인됨 · {month.updatedAt}</p>;
  const label = (value: string) => value === "complete" ? "기간 확인" : value === "delayed" ? "명세 지연" : "자료 없음";
  return <div className={`mf-coverage ${complete ? "" : "is-partial"}`}>
    <div><span className="mf-eyebrow">{complete ? "샘플 범위 확인됨" : "일부 자료만 확인할 수 있어요"}</span><p>은행 · {label(month.bankCoverage)}<span aria-hidden="true"> / </span>카드 · {label(month.cardCoverage)}</p><small>{month.updatedAt}</small></div>
    <Button variant="outline" onClick={onImport}>자료 갱신</Button>
    {!complete ? <p className="mf-coverage-note">전체 월 소비와 전월 비교는 자료를 보완한 뒤 확인할 수 있어요. 누락을 소비 감소로 해석하지 않아요.</p> : null}
  </div>;
}
export function TransactionList({ transactions, onOpen, allocatedAmounts = {} }: { transactions: Transaction[]; onOpen: (id: string) => void; allocatedAmounts?: Record<string, number> }) {
  return transactions.length ? <ul className="mf-transaction-list">{transactions.map(t => <li key={t.id}><button className="mf-transaction" onClick={() => onOpen(t.id)}>
    <span className={`mf-source-icon ${t.source === "card" ? "is-card" : ""}`}>{t.source === "card" ? <CreditCard size={18} aria-label="카드" /> : <Landmark size={18} aria-label="은행" />}</span>
    <span className="mf-transaction-name"><strong>{t.title}</strong><small>{t.date.slice(5).replace("-", ".")} · {isConsumption(t) ? (t.allocations?.length ?? 0) > 1 ? "금액 분할" : t.category ?? unclassifiedCategory : t.kind === "transfer" ? "계좌 이동" : t.kind === "card-payment" ? "카드대금 출금" : "소득"} · {t.source === "bank" ? "은행" : "카드"}</small>{allocatedAmounts[t.id] !== undefined && allocatedAmounts[t.id] !== t.amount ? <small>이 분류의 배분액 · 원거래 {money(t.amount)}</small> : null}</span>
    <span className="mf-transaction-amount">{money(allocatedAmounts[t.id] ?? t.amount)}<ChevronRight size={14} aria-hidden="true" /></span>
  </button></li>)}</ul> : <p className="mf-muted mf-empty">이 조건에서 확인된 거래가 없어요.</p>;
}
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Backdrop className="mf-backdrop" />
    <Dialog.Popup className="motifin mf-sheet">
      <div className="mf-section-heading"><Dialog.Title className="mf-sheet-title">{title}</Dialog.Title><Dialog.Close render={<Button variant="ghost" />}>닫기</Dialog.Close></div>
      <Dialog.Description className="mf-muted">합성 자료의 상세 정보예요. 변경은 이 시연 안에서만 유지돼요.</Dialog.Description>
      {children}
    </Dialog.Popup>
  </Dialog.Portal></Dialog.Root>;
}

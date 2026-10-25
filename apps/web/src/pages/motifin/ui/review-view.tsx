import { ArrowRight, Sparkles } from "lucide-react";
import type { CashFlowMonth, CashFlowPart, CashFlowScreen, MonthlyReview, ReviewFinding } from "@/entities/cash-flow/model";
import { Button } from "@/shared/ui/button";
import { CoverageNotice, Section } from "./components";
import { compactMoney } from "./format";

type ReviewViewProps = {
  month: CashFlowMonth;
  review: MonthlyReview;
  onNavigate: (screen: CashFlowScreen) => void;
  onFlowPart: (part: CashFlowPart) => void;
  onFinding: (finding: ReviewFinding) => void;
};

export function ReviewView({ month, review, onNavigate, onFlowPart, onFinding }: ReviewViewProps) {
  if (!month.transactions.length) {
    return <section className="mf-onboarding">
      <span className="mf-eyebrow">한 달에 한 번, 내 돈의 흐름</span>
      <h2>흩어진 기록을<br />한 달의 이야기로.</h2>
      <p>월급·소비 통장과 카드 자료로<br />어디에 쓰고, 얼마나 남았는지 살펴보세요.</p>
      <ol><li>은행·카드 자료 선택</li><li>앱이 기록을 알아서 정리</li><li>소비와 현금 흐름 함께 보기</li></ol>
      <Button onClick={() => onNavigate("import")}>첫 자료 가져오기 <ArrowRight size={16} /></Button>
      <p className="mf-muted">지금은 샘플 자료로 경험하는 와이어프레임이에요.</p>
    </section>;
  }

  const upcoming = month.payments.filter(p => p.status !== "matched").toSorted((a, b) => a.date.localeCompare(b.date));
  const unknownPayments = upcoming.filter(p => p.amount === null).length;
  return <>
    <CoverageNotice month={month} compact onImport={() => onNavigate("import")} />

    <section className="mf-review-summary" aria-labelledby="mf-review-conclusion">
      <span className="mf-eyebrow">이번 달의 결론</span>
      <h2 id="mf-review-conclusion">{review.headline}</h2>
      <dl className="mf-summary-changes">
        <div>
          <dt>전월 대비 소비</dt>
          <dd>{review.consumptionChange === null ? "비교 보류" : review.consumptionChange === 0 ? "변화 없음" : <>{compactMoney(Math.abs(review.consumptionChange))} <span>{review.consumptionChange < 0 ? "감소" : "증가"}</span></>}</dd>
        </div>
        <div>
          <dt>월초 대비 통장 현금</dt>
          <dd>{review.cashChange === null ? "확인 불가" : review.cashChange === 0 ? "변화 없음" : <>{compactMoney(Math.abs(review.cashChange))} <span>{review.cashChange > 0 ? "증가" : "감소"}</span></>}</dd>
        </div>
      </dl>
      <dl className="mf-summary-context">
        <div><dt>이번 달 소비 · 이용일 기준</dt><dd>{compactMoney(month.consumption)}</dd></div>
        <div><dt>월말 잔액 · 실제 입출금 기준</dt><dd>{compactMoney(month.bank?.closing ?? null)}</dd></div>
      </dl>
    </section>

    <section className="mf-cash-journey" aria-labelledby="mf-cash-journey-title">
      <div className="mf-section-heading"><h2 id="mf-cash-journey-title">한 달의 자금 흐름</h2><span className="mf-tag">본 계좌 1개</span></div>
      {month.bank ? <>
        <ol className="mf-flow-journey" aria-label="기초 잔액 더하기 유입 빼기 유출은 월말 잔액">
          <li><span>시작 잔액</span><strong>{compactMoney(month.bank.opening)}</strong></li>
          <li><span>들어온 돈</span><strong>+{compactMoney(month.bank.incoming)}</strong></li>
          <li><span>나간 돈</span><strong>−{compactMoney(month.bank.outgoing)}</strong></li>
          <li><span>남은 잔액</span><strong>{compactMoney(month.bank.closing)}</strong></li>
        </ol>
        <div className="mf-flow-incoming"><span>유입</span>{review.incoming.map(part => <button key={part.id} onClick={() => onFlowPart(part)}>{part.label} <strong>{compactMoney(part.amount)}</strong></button>)}</div>
        <div className="mf-flow-outgoing-heading"><h3>나간 돈은 어디로?</h3><span>눌러서 근거 확인</span></div>
        {month.bank.outgoing > 0 ? <div className="mf-flow-outgoing-bar" aria-hidden="true">{review.outgoing.map((part, index) => <span key={part.id} className={`mf-fill-${index}`} style={{ flexGrow: part.amount }} />)}</div> : null}
        <ul className="mf-flow-outgoing-legend">{review.outgoing.map((part, index) => <li key={part.id}><button onClick={() => onFlowPart(part)}><span><i className={`mf-dot mf-dot-${index}`} />{part.label}</span><strong>{compactMoney(part.amount)}</strong></button></li>)}</ul>
        <p className="mf-flow-explanation">카드대금은 이전 이용분의 출금이에요. 이번 달 소비에 다시 더하지 않아요. 내 계좌 간 이동도 소비·소득에서 제외해요.</p>
      </> : <div className="mf-flow-unavailable"><p>은행 자료가 없어 현금의 시작과 끝을 확인할 수 없어요.</p><Button variant="outline" onClick={() => onNavigate("import")}>은행 샘플 가져오기</Button></div>}
    </section>

    <section className="mf-review-findings" aria-labelledby="mf-review-findings-title">
      <div className="mf-section-heading"><h2 id="mf-review-findings-title">왜 달라졌나요</h2><Sparkles size={17} aria-hidden="true" /></div>
      {review.findings.length ? <ol>{review.findings.map((finding, index) => <li key={finding.id}>
        <span className="mf-finding-number" aria-hidden="true">0{index + 1}</span>
        <div><h3>{finding.title}</h3><p>{finding.description}</p><button className="mf-text-action" onClick={() => onFinding(finding)}>{finding.actionLabel}<ArrowRight size={14} /></button></div>
      </li>)}</ol> : <div className="mf-findings-empty"><h3>{review.consumptionChange === null ? "자료가 충분해지면 비교할 수 있어요" : "추가로 확인할 특별한 변화가 없어요"}</h3><p>자료가 적을 때는 변화의 원인이나 평소 패턴을 단정하지 않아요. 확인된 거래는 소비 분석에서 살펴볼 수 있어요.</p></div>}
    </section>

    <Section title="다음 확인" aside={<button className="mf-text-action" onClick={() => onNavigate("upcoming")}>자금 일정 <ArrowRight size={14} /></button>}>
      {upcoming.length ? upcoming.slice(0, 2).map(p => <div className="mf-upcoming-line" key={p.id}><span><small>{p.date.slice(5).replace("-", ".")}</small>{p.title}</span><strong>{p.amount === null ? "금액 미확인" : compactMoney(p.amount)}</strong></div>) : <p className="mf-muted">아직 확인된 다음 일정이 없어요.</p>}
      <p className="mf-muted">{unknownPayments ? `금액을 확인할 항목 ${unknownPayments}건 · ` : ""}예정액은 실제 잔액에서 미리 차감하지 않아요.</p>
      <Button variant="outline" className="mf-full" onClick={() => onNavigate("spending")}>소비 구성·거래 더 살펴보기 <ArrowRight size={16} /></Button>
    </Section>
    <button className="mf-review-refresh" onClick={() => onNavigate("import")}>자료 갱신·가져오기 기록 확인 <ArrowRight size={14} /></button>
  </>;
}

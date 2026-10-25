import { useEffect, useReducer, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, CalendarDays, ChartNoAxesCombined, House, Settings2 } from "lucide-react";
import type { CashFlowPart, CashFlowScreen, CashFlowSource, ReviewFinding, SpendingLens, SpendingSort } from "@/entities/cash-flow/model";
import type { CashFlowActions } from "@/features/cash-flow-workspace/ports";
import { importFlow, initialImportState, type ImportEvent } from "@/features/cash-flow-workspace/import-flow";
import { Button } from "@/shared/ui/button";
import { cashFlowLocation, isCashFlowScreen } from "./route";
import { ReviewView } from "./ui/review-view";
import { SpendingView } from "./ui/spending-view";
import { UpcomingView } from "./ui/upcoming-view";
import { ImportView } from "./ui/import-view";
import { SettingsView } from "./ui/settings-view";
import { Sheet, TransactionList } from "./ui/components";
import { money } from "./ui/format";
import { allocationsFor, isConsumption } from "@/entities/cash-flow/classification";
import { CategoryManager } from "./ui/category-manager";
import { AllocationEditor } from "./ui/allocation-editor";
import { TransactionEditor } from "./ui/transaction-editor";

const screenNames: Record<CashFlowScreen, string> = { review: "월간 리뷰", spending: "소비 분석", upcoming: "자금 일정", import: "자료 가져오기", settings: "설정" };
const primaryScreens = [{ screen: "review", Icon: House }, { screen: "spending", Icon: ChartNoAxesCombined }, { screen: "upcoming", Icon: CalendarDays }] as const;

/** Composition/controller: UI components below receive data and callbacks only. */
export function MotifinPage({ source, actions }: { source: CashFlowSource; actions: CashFlowActions }) {
  const navigate = useNavigate();
  const { screen: requestedScreen } = useParams();
  const [search, setSearch] = useSearchParams();
  const screen = isCashFlowScreen(requestedScreen) ? requestedScreen : "review";
  const [snapshot, setSnapshot] = useState(() => source.read());
  const [importState, dispatchImport] = useReducer(importFlow, initialImportState);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const month = snapshot.months.find(m => m.id === search.get("month")) ?? snapshot.months.at(-1)!;
  const calendarMonth = search.get("month") ?? month.id;
  const calendar = source.calendar(calendarMonth);
  const review = source.review(month.id);
  const requestedCategory = search.get("category");
  const category = requestedCategory && snapshot.categories.includes(requestedCategory) ? requestedCategory : null;
  const lens: SpendingLens = ["size", "changes", "recurring", "classification"].includes(search.get("focus") ?? "") ? search.get("focus") as SpendingLens : "size";
  const sort: SpendingSort = ["amount", "increase", "decrease"].includes(search.get("sort") ?? "") ? search.get("sort") as SpendingSort : "amount";
  const spending = source.spending(month.id, category);
  const transaction = month.transactions.find(t => t.id === search.get("transaction"));
  const payment = month.payments.find(p => p.id === search.get("payment"));
  const setting = search.get("setting");
  const flowPart = [...review.incoming, ...review.outgoing].find(part => part.id === search.get("flow"));
  const activeFileIds = importState.selectedIds.filter(id => !importState.excludedIds.includes(id));
  const preview = source.previewImport(activeFileIds);
  useEffect(() => {
    if (transaction || setting || payment || flowPart) return;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, category, lens, calendarMonth]);

  function onNavigate(next: CashFlowScreen) {
    setNotice("");
    void navigate(cashFlowLocation(next, month.id));
  }
  function spendingLocation(monthId: string, name: string | null, nextLens = lens, nextSort = sort) {
    const location = new URL(cashFlowLocation("spending", monthId, name), "http://wireframe.local");
    location.searchParams.set("focus", nextLens); location.searchParams.set("sort", nextSort);
    return `${location.pathname}${location.search}`;
  }
  function onCategory(next: string | null) { void navigate(spendingLocation(month.id, next)); }
  function onCategoryRename(name: string, next: string) {
    setSnapshot(actions.renameCategory(name, next));
    if (category === name) setSearch(current => { const params = new URLSearchParams(current); params.set("category", next.trim()); return params; }, { replace: true });
  }
  function onCategoryMerge(name: string, target: string) {
    setSnapshot(actions.mergeCategory(name, target));
    if (category === name) setSearch(current => { const params = new URLSearchParams(current); params.set("category", target); return params; }, { replace: true });
  }
  function onManagedCategory(name: string) {
    const available = snapshot.months.filter(m => m.transactions.some(t => allocationsFor(t).some(a => a.category === name)));
    const target = available.some(m => m.id === month.id) ? month.id : available.at(-1)?.id ?? month.id;
    void navigate(spendingLocation(target, name));
  }
  function onTransaction(id: string) { setSearch(current => { const next = new URLSearchParams(current); next.delete("payment"); next.delete("setting"); next.delete("flow"); next.set("transaction", id); return next; }); }
  function closeTransaction() { setSearch(current => { const next = new URLSearchParams(current); next.delete("transaction"); return next; }, { replace: true }); setNotice(""); }
  function onSetting(name: string) { setNotice(""); setSearch(current => { const next = new URLSearchParams(current); next.set("setting", name); return next; }); }
  function closeOverlay(key: "payment" | "setting" | "flow") { setSearch(current => { const next = new URLSearchParams(current); next.delete(key); return next; }, { replace: true }); }
  function onFlowPart(part: CashFlowPart) {
    setSearch(current => { const next = new URLSearchParams(current); next.delete("transaction"); next.delete("payment"); next.delete("setting"); next.set("flow", part.id); return next; });
  }
  function onFinding(finding: ReviewFinding) {
    const target = finding.target;
    if (target.type === "category") void navigate(cashFlowLocation("spending", target.monthId, target.category));
    else {
      const location = new URL(cashFlowLocation("review", target.monthId), "http://wireframe.local");
      location.searchParams.set("transaction", target.id);
      void navigate(`${location.pathname}${location.search}`);
    }
  }
  function onImportEvent(event: ImportEvent) {
    if (event.type !== "start") { dispatchImport(event); return; }
    if (!activeFileIds.length) { dispatchImport({ type: "error", message: "가져올 샘플 파일을 선택해주세요." }); return; }
    const hasBank = snapshot.importFiles.some(file => activeFileIds.includes(file.id) && file.source === "bank");
    const usesSaved = snapshot.pdfPasswordSaved && importState.useSavedPassword;
    if (hasBank && !usesSaved && !importState.passwordProvided) { dispatchImport({ type: "error", message: "은행 PDF를 열 샘플 암호를 입력해주세요." }); return; }
    if (preview.issues.length || preview.corrections.some(c => !importState.decisions[c.id])) {
      if (importState.step === "attention") dispatchImport({ type: "error", message: "문제 파일을 제외하고, 값이 다른 항목의 처리 방법을 선택해주세요." });
      else dispatchImport({ type: "attention" });
      return;
    }
    let next = actions.applyImport(activeFileIds, importState.decisions);
    if (hasBank && !usesSaved && importState.passwordProvided && importState.rememberPassword) next = actions.setPdfPasswordSaved(true);
    setSnapshot(next);
    dispatchImport({ type: "complete", result: {
      added: preview.added, duplicates: preview.duplicates,
      corrected: preview.corrections.filter(c => importState.decisions[c.id] === "replace").length,
      kept: preview.corrections.filter(c => importState.decisions[c.id] === "keep").length,
      skippedFiles: importState.excludedIds.length,
      months: preview.months.map(item => {
        const updated = next.months.find(m => m.id === item.id)!;
        return { ...item, bank: updated.bankCoverage === "complete", card: updated.cardCoverage === "complete" };
      }),
    } });
  }
  if (requestedScreen && !isCashFlowScreen(requestedScreen)) return <Navigate replace to={cashFlowLocation("review", month.id)} />;

  return <div className="mf-workspace">
    {screen === "review" ? <>
      <header className="mf-product-header mf-review-header">
        <span className="mf-brand">MOTIFIN<span aria-hidden="true">.</span></span>
        <label className="mf-month-picker"><span className="sr-only">분석 월</span><select value={month.id} onChange={e => { dispatchImport({ type: "reset" }); void navigate(cashFlowLocation(screen, e.target.value)); }}>{snapshot.months.map(m => <option value={m.id} key={m.id}>{m.label}</option>)}</select></label>
        <Button variant="outline" aria-label="설정 열기" onClick={() => onNavigate("settings")}><Settings2 size={19} /></Button>
      </header>
      <h1 ref={heading} tabIndex={-1} className="sr-only">{month.label} 월간 리뷰 · {month.period}</h1>
    </> : <>
      <header className="mf-product-header"><div><span className="mf-brand">MOTIFIN<span aria-hidden="true">.</span></span><span className="mf-brand-caption">한 달의 기록, 다음의 발견</span></div><Button variant="outline" aria-label="설정 열기" onClick={() => onNavigate("settings")}><Settings2 size={19} /></Button></header>
      <div className="mf-title-row">{screen === "import" || screen === "settings" ? <Button variant="ghost" aria-label="월간 리뷰로 돌아가기" onClick={() => onNavigate("review")}><ArrowLeft size={20} /></Button> : null}<h1 ref={heading} tabIndex={-1}>{screenNames[screen]}</h1>{screen !== "import" ? <label className="mf-month-picker"><span className="sr-only">분석 월</span><select value={screen === "upcoming" ? calendar.monthId : month.id} onChange={e => { dispatchImport({ type: "reset" }); void navigate(screen === "spending" ? spendingLocation(e.target.value, category) : cashFlowLocation(screen, e.target.value)); }}>{(screen === "upcoming" ? calendar.months.map(id => ({ id, label: `${id.slice(0, 4)}년 ${Number(id.slice(5))}월` })) : snapshot.months).map(m => <option value={m.id} key={m.id}>{m.label}</option>)}</select></label> : null}</div>
      <p className="mf-period">{screen === "import" ? "은행 PDF · 카드 XLS · 여러 파일 함께 가져오기" : screen === "upcoming" ? `${calendar.monthId.replace("-", "년 ")}월 · 가상 자금 계획` : `${month.period} · 가상 월의 합성 자료`}</p>
    </>}
    <div className="mf-view" key={screen}>
      {screen === "review" ? <ReviewView month={month} review={review} onNavigate={onNavigate} onFlowPart={onFlowPart} onFinding={onFinding} /> : null}
      {screen === "spending" ? <SpendingView month={month} analysis={spending} lens={lens} sort={sort} onLens={value => { void navigate(spendingLocation(month.id, null, value, value === "changes" ? "increase" : sort)); }} onSort={value => { void navigate(spendingLocation(month.id, null, lens, value)); }} onCategory={onCategory} onTransaction={onTransaction} onManage={() => onSetting("카테고리 관리")} onMonth={id => { void navigate(spendingLocation(id, category)); }} /> : null}
      {screen === "upcoming" ? <UpcomingView key={calendar.monthId} plan={calendar} onMonth={id => { void navigate(cashFlowLocation("upcoming", id)); }} onImport={() => onNavigate("import")} onTransaction={onTransaction} onSave={(id, edit, scope) => setSnapshot(actions.saveCalendarEvent(id, edit, scope))} onChange={(id, change) => setSnapshot(actions.changeCalendarEvent(id, change))} onProtected={amount => setSnapshot(actions.setProtectedAmount(amount))} /> : null}
      {screen === "import" ? <ImportView files={snapshot.importFiles} savedPassword={snapshot.pdfPasswordSaved} state={importState} preview={preview} onEvent={onImportEvent} onReview={() => { const targetMonth = importState.result?.months.at(-1)?.id ?? month.id; void navigate(cashFlowLocation("review", targetMonth)); }} /> : null}
      {screen === "settings" ? <SettingsView snapshot={snapshot} onImport={() => onNavigate("import")} onSetting={onSetting} /> : null}
    </div>
    <nav className="mf-bottom-nav" aria-label="MOTIFIN 주요 탐색">{primaryScreens.map(({ screen: next, Icon }) => <button key={next} aria-current={next === screen ? "page" : undefined} onClick={() => onNavigate(next)}><Icon size={21} aria-hidden="true" /><span>{screenNames[next]}</span></button>)}</nav>
    {flowPart ? <Sheet title={flowPart.label} onClose={() => closeOverlay("flow")}>
      <p className="mf-large-amount">{money(flowPart.amount)}</p>
      <p className="mf-inline-note">{flowPart.detail}</p>
      <TransactionList transactions={month.transactions.filter(t => flowPart.transactionIds.includes(t.id))} onOpen={onTransaction} />
    </Sheet> : null}
    {transaction ? <Sheet title={transaction.title} onClose={closeTransaction}><p className="mf-large-amount">{money(transaction.amount)}</p><dl className="mf-detail-list"><div><dt>발생일</dt><dd>{transaction.date}</dd></div><div><dt>자료 구분</dt><dd>{transaction.source === "bank" ? "은행 입출금" : "카드 이용"}</dd></div><div><dt>의미</dt><dd>{transaction.kind === "transfer" ? "계좌 간 이동 · 소비 아님" : transaction.kind === "card-payment" ? "실제 현금 출금 · 소비 중복 제외" : transaction.kind === "income" ? "외부 소득" : transaction.kind === "refund" ? "소비 취소·환불" : "소비·비용"}</dd></div></dl><p className="mf-inline-note">{transaction.note}</p>
      {transaction.relatedId && month.transactions.some(t => t.id === transaction.relatedId) ? <Button variant="outline" onClick={() => onTransaction(transaction.relatedId!)}>연결된 원거래 보기</Button> : null}
      {transaction.relatedId && !month.transactions.some(t => t.id === transaction.relatedId) ? <Button variant="outline" onClick={() => { const relatedMonth = snapshot.months.find(m => m.transactions.some(t => t.id === transaction.relatedId)); if (relatedMonth) void navigate(`${cashFlowLocation("spending", relatedMonth.id)}&transaction=${transaction.relatedId}`); }}>이전 달 할부 원거래 보기</Button> : null}
      {isConsumption(transaction) ? <AllocationEditor key={`allocation-${transaction.id}`} transaction={transaction} categories={snapshot.categories} onSave={parts => { setSnapshot(actions.allocate(transaction.id, parts)); setNotice("카테고리 배분을 반영했어요. 소비 총액과 원거래 건수는 그대로예요."); }} onAddCategory={name => { setSnapshot(actions.addCategory(name)); }} /> : null}
      {transaction.source === "card" && isConsumption(transaction) ? <TransactionEditor key={transaction.id} transaction={transaction} onSave={edit => { setSnapshot(actions.updateTransaction(transaction.id, edit)); setNotice("수정값을 반영했어요. 같은 파일을 다시 가져와도 이 수정은 유지돼요."); }} onRestore={() => { setSnapshot(actions.restoreTransaction(transaction.id)); setNotice("가져온 값으로 되돌렸어요. 금액이 달라진 경우 배분도 확인해주세요."); }} /> : null}
      <p role="status" className="mf-muted">{notice}</p>
    </Sheet> : null}
    {payment ? <Sheet title={payment.title} onClose={() => closeOverlay("payment")}><p className="mf-large-amount">{payment.amount === null ? "금액 미확인" : money(payment.amount)}</p><p>{payment.date} · {payment.status === "matched" ? "실제 납부 연결" : payment.status === "scheduled" ? "예정 · 출금 전" : "확인 필요"}</p><p className="mf-inline-note">{payment.note}</p>{payment.transactionId ? <Button onClick={() => onTransaction(payment.transactionId!)}>연결된 실제 거래 보기</Button> : <p className="mf-muted">아직 실제 거래가 연결되지 않았어요.</p>}</Sheet> : null}
    {setting ? <Sheet title={setting} onClose={() => closeOverlay("setting")}>
      {setting === "PDF 암호 관리" ? <>
        <p>{snapshot.pdfPasswordSaved ? "PDF 암호가 저장된 상태예요. (시연)" : "저장된 PDF 암호가 없어요."}</p>
        <p className="mf-muted">다음 자료 가져오기에서도 사용할 수 있는 계정 설정이에요. 실제 암호나 생년월일은 표시하지 않아요.</p>
        <Button onClick={() => { setSnapshot(actions.setPdfPasswordSaved(true)); setNotice("샘플 암호 저장 상태를 반영했어요. 실제 암호는 저장하지 않았어요."); }}>{snapshot.pdfPasswordSaved ? "샘플 암호로 변경 시연" : "샘플 암호 저장 시연"}</Button>
        <Button variant="outline" disabled={!snapshot.pdfPasswordSaved} onClick={() => { setSnapshot(actions.setPdfPasswordSaved(false)); setNotice("암호 저장 상태를 해제했어요. 다음 가져오기에서 다시 입력해요."); }}>저장된 암호 삭제 시연</Button>
        <p role="status" className="mf-muted">{notice}</p>
      </> : <>
      {setting === "카테고리 관리" ? <CategoryManager snapshot={snapshot} onAdd={name => { setSnapshot(actions.addCategory(name)); }} onRename={onCategoryRename} onMerge={onCategoryMerge} onDelete={name => { setSnapshot(actions.deleteCategory(name)); }} onCategory={onManagedCategory} /> : setting === "반복 일정 관리" ? <><p>확인된 반복비의 과거 납부와 다음 일정을 함께 확인해요. 자금 일정에서 이번 회차·이후 반복을 구분해 편집할 수 있어요. 실제 납부나 자동 매칭은 수행하지 않아요.</p><Button onClick={() => onNavigate("upcoming")}>반복 일정 보기</Button></> : <><p>현재는 합성 자료만 메모리에서 다루는 와이어프레임이에요.</p><p className="mf-muted">{setting === "데이터 내보내기" ? "내보내기 범위·형식은 실제 기능 연결 단계에서 검토해요. 지금은 파일을 만들지 않아요." : setting === "데이터 삭제" ? "실제 데이터 삭제 기능은 연결되지 않았어요. 검토 도구의 초기화로 샘플만 되돌릴 수 있어요." : "자료·암호·계좌번호를 입력하거나 보관하지 않아요. 실제 보관·삭제 정책은 별도 설계 대상이에요."}</p></>}
      </>}
    </Sheet> : null}
  </div>;
}

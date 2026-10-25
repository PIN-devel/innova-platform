import { Check, FileSpreadsheet, FileText, LockKeyhole } from "lucide-react";
import type { ImportFile, ImportPreview } from "@/entities/cash-flow/model";
import type { ImportEvent, ImportState } from "@/features/cash-flow-workspace/import-flow";
import { Button } from "@/shared/ui/button";
import { Section } from "./components";
import { money } from "./format";

type ImportViewProps = {
  files: ImportFile[]; savedPassword: boolean; state: ImportState; preview: ImportPreview;
  onEvent: (event: ImportEvent) => void; onReview: () => void;
};

export function ImportView({ files, savedPassword, state, preview, onEvent, onReview }: ImportViewProps) {
  const selected = files.filter(file => state.selectedIds.includes(file.id));
  const hasBank = selected.some(file => file.source === "bank");
  const usesSaved = savedPassword && state.useSavedPassword;
  const normalFiles = files.filter(file => !file.issue);
  const issueFiles = files.filter(file => file.issue);
  function fileOption(file: ImportFile) {
    return <label className={`mf-file-option mf-file-checkbox ${state.selectedIds.includes(file.id) ? "is-selected" : ""}`} key={file.id}>
      {file.source === "bank" ? <FileText size={21} aria-hidden="true" /> : <FileSpreadsheet size={21} aria-hidden="true" />}
      <span><strong>{file.name}</strong><small>{file.source === "bank" ? "KB스타뱅킹 · 월급·소비 통장 PDF" : "KB Pay · 카드 이용대금명세서 XLS"}</small></span>
      <input type="checkbox" checked={state.selectedIds.includes(file.id)} onChange={() => onEvent({ type: "select", fileId: file.id })} />
    </label>;
  }
  return <>
    <div className="mf-page-intro"><h2>자료만 가져오세요.</h2><p>원하는 때에 여러 파일을 함께 가져올 수 있어요. 월별 정리는 앱이 알아서 해드려요.</p></div>
    <div className="mf-demo-note">샘플 시연 · 실제 파일·암호를 받거나 서버에 저장하지 않아요.</div>
    {state.step === "sources" ? <>
      <Section title="가져올 파일 선택">
        <p className="mf-muted">은행 PDF와 카드 XLS를 여러 개 선택해보세요. 처음에는 여러 달 자료를 함께 가져와도 돼요.</p>
        {normalFiles.map(fileOption)}
        <p className="mf-muted">은행은 월급·소비 통장 1개가 대상이에요. 다른 계좌 파일은 필요 없어요. 일부 자료만 있어도 시작할 수 있어요.</p>
        <details className="mf-import-scenarios"><summary>문제 있는 파일도 시연하기</summary>{issueFiles.map(fileOption)}</details>
      </Section>
      {hasBank ? <Section title="PDF 암호">
        <div className="mf-password-heading"><LockKeyhole size={18} aria-hidden="true" /><span>생년월일 6자리</span></div>
        {usesSaved ? <>
          <p>저장된 PDF 암호를 사용해요.</p><p className="mf-muted">선택한 은행 PDF들을 같은 암호로 열어요.</p>
          <Button variant="outline" onClick={() => onEvent({ type: "use-saved", value: false })}>이번에는 다른 암호 사용</Button>
        </> : <>
          <div className="mf-password-placeholder" aria-label="실제 암호를 입력하지 않는 시연 영역">{state.passwordProvided ? "••••••" : "입력 전"}<span>암호 입력 시연</span></div>
          <Button variant="outline" disabled={state.passwordProvided} onClick={() => onEvent({ type: "password" })}>{state.passwordProvided ? "샘플 암호 입력됨" : "샘플 암호 입력"}</Button>
          <label className="mf-check"><input type="checkbox" checked={state.rememberPassword} onChange={e => onEvent({ type: "remember", value: e.target.checked })} />다음 가져오기에도 쓰도록 PDF 암호 저장</label>
          <p className="mf-muted">선택한 은행 PDF에 한 번 입력한 암호를 사용해요. 저장 여부만 시연하며 실제 생년월일은 입력하지 않아요.</p>
          {savedPassword ? <Button variant="ghost" onClick={() => onEvent({ type: "use-saved", value: true })}>저장된 암호로 돌아가기</Button> : null}
        </>}
      </Section> : null}
      {state.error ? <p role="alert" className="mf-inline-warning">{state.error}</p> : null}
      <Button className="mf-full" onClick={() => onEvent({ type: "start" })}>선택한 자료 가져오기{selected.length ? ` · ${selected.length}개` : ""}</Button>
    </> : null}
    {state.step === "attention" ? <>
      <Section title="이 항목만 확인해주세요">
        <p className="mf-muted">확인이 필요한 부분만 모았어요. 같은 내역은 자동으로 중복을 제외해요.</p>
        {preview.issues.map(issue => <div className="mf-import-issue" key={issue.fileId}>
          <strong>{issue.name}</strong><p>{issue.message}</p><Button variant="outline" onClick={() => onEvent({ type: "exclude", fileId: issue.fileId })}>이 파일 제외</Button>
        </div>)}
        {preview.corrections.map(c => <fieldset className="mf-import-conflict" key={c.id}>
          <legend>{c.title}</legend><p>{c.userEdited ? "앱에서 수정한 금액" : "기존 금액"} {money(c.before)} · 새 파일 {money(c.after)}</p>
          <label className="mf-check"><input type="radio" name={c.id} checked={state.decisions[c.id] === "keep"} onChange={() => onEvent({ type: "decide", id: c.id, value: "keep" })} />현재 값 유지</label>
          <label className="mf-check"><input type="radio" name={c.id} checked={state.decisions[c.id] === "replace"} onChange={() => onEvent({ type: "decide", id: c.id, value: "replace" })} />새 파일의 값 사용</label>
        </fieldset>)}
        {!preview.issues.length && !preview.corrections.length ? <p>남은 자료는 바로 반영할 수 있어요.</p> : null}
        {state.excludedIds.length ? <p className="mf-muted">선택한 파일 {state.excludedIds.length}개는 이번 가져오기에서 제외해요.</p> : null}
        <p className="mf-muted">거래 내용은 가져온 뒤 앱에서 직접 수정할 수 있어요. 엑셀을 고쳐 다시 올릴 필요는 없어요.</p>
      </Section>
      {state.error ? <p role="alert" className="mf-inline-warning">{state.error}</p> : null}
      <Button className="mf-full" onClick={() => onEvent({ type: "start" })}>확인한 내용으로 계속</Button>
      <Button className="mf-full" variant="outline" onClick={() => onEvent({ type: "back" })}>선택 단계로 돌아가기</Button>
    </> : null}
    {state.step === "done" && state.result ? <Section title="자료를 반영했어요">
      <span className="mf-done-icon"><Check size={30} /></span>
      <p>가져온 기록은 앱이 정리했어요. 월간 리뷰에서 확인하세요.</p>
      <p className="mf-muted">새 내역 {state.result.added}건 · 중복 제외 {state.result.duplicates}건{state.result.corrected ? ` · 변경 반영 ${state.result.corrected}건` : ""}{state.result.kept ? ` · 기존 값 유지 ${state.result.kept}건` : ""}</p>
      {state.result.skippedFiles ? <p className="mf-muted">파일 {state.result.skippedFiles}개를 제외했어요. 필요할 때 다시 가져올 수 있어요.</p> : null}
      {savedPassword ? <p className="mf-muted">PDF 암호 저장 상태도 시연했어요. 다음 가져오기에서 다시 입력하지 않아도 돼요.</p> : null}
      <Button className="mf-full" onClick={onReview}>월간 리뷰 보기</Button>
      <Button className="mf-full" variant="outline" onClick={() => onEvent({ type: "reset" })}>다른 자료도 가져오기</Button>
    </Section> : null}
  </>;
}

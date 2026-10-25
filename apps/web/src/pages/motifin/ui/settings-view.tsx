import { ChevronRight } from "lucide-react";
import type { CashFlowSnapshot } from "@/entities/cash-flow/model";
import { Section } from "./components";

export function SettingsView({ snapshot, onImport, onSetting }: { snapshot: CashFlowSnapshot; onImport: () => void; onSetting: (name: string) => void }) {
  return <><div className="mf-page-intro"><h2>매달, 다시 설정하지 않도록.</h2><p>관리하는 계좌·카드와 설정을 한곳에 모았어요.</p></div>
    <Section title="관리하는 계좌·카드"><div className="mf-setting-source"><strong>KB스타뱅킹 · 월급·소비 통장</strong><p>상세 거래·잔액을 보는 은행 계좌 1개</p><span className="mf-tag">카드대금 결제계좌</span></div><div className="mf-setting-source"><strong>KB Pay · 카드</strong><p>은행 거래와 구분해서 보는 카드 이용·청구·할부</p></div><button className="mf-setting-row" onClick={onImport}>자료 가져오기<ChevronRight size={18} /></button><p className="mf-muted">투자·파킹 통장은 이 계좌에서 관측한 송금·수취만 확인해요. 상대 계좌 잔액은 관리하지 않아요.</p></Section>
    <Section title="분류와 반복 설정">{["카테고리 관리", "반복 일정 관리"].map(name => <button className="mf-setting-row" key={name} onClick={() => onSetting(name)}>{name}<ChevronRight size={18} /></button>)}</Section>
    <Section title="가져오기 기록">{snapshot.importHistory.length ? <ul className="mf-history">{snapshot.importHistory.map((entry, i) => <li key={`${entry}-${i}`}>{entry}</li>)}</ul> : <p className="mf-muted">아직 반영한 자료가 없어요.</p>}</Section>
    <Section title="개인정보와 데이터"><button className="mf-setting-row" onClick={() => onSetting("PDF 암호 관리")}><span>PDF 암호 관리<small className="mf-setting-caption">{snapshot.pdfPasswordSaved ? "저장됨 · 다음 가져오기에 사용 (시연)" : "저장된 암호 없음"}</small></span><ChevronRight size={18} /></button>{["자료 범위와 보관", "데이터 내보내기", "데이터 삭제"].map(name => <button className="mf-setting-row" key={name} onClick={() => onSetting(name)}>{name}<ChevronRight size={18} /></button>)}<p className="mf-muted">이 시안은 합성 데이터만 사용해요. 실제 계좌·파일·암호는 저장하지 않아요.</p></Section>
  </>;
}

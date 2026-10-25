import { useState } from "react";
import { useNavigate } from "react-router";
import { MotifinPage } from "@/pages/motifin/motifin-page";
import { motifinBasePath } from "@/pages/motifin/route";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { createSyntheticSource, wireframeScenarios, type WireframeScenario } from "./synthetic-source";
import "@/pages/motifin/motifin.css";

function Preview({ scenario, onRetry }: { scenario: WireframeScenario; onRetry: () => void }) {
  const [adapter] = useState(() => createSyntheticSource(scenario));
  if (scenario === "loading") return <div className="mf-preview-state"><LoadingState label="기록을 불러오고 있어요" /><p className="mf-muted">검토용으로 멈춘 로딩 상태예요. 위 도구에서 다른 시나리오를 선택하세요.</p></div>;
  if (scenario === "error") return <div className="mf-preview-state"><ErrorState title="기록을 불러오지 못했어요" description="자료가 0원인 상태와 조회 실패를 구분해요. 다시 시도하면 샘플 리뷰로 돌아가요." action={<Button onClick={onRetry}>다시 시도</Button>} /></div>;
  return <MotifinPage source={adapter.source} actions={adapter.actions} />;
}

export function Component() {
  const [scenario, setScenario] = useState<WireframeScenario>("monthly");
  const [revision, setRevision] = useState(0);
  const navigate = useNavigate();
  function reset(next: WireframeScenario) {
    setScenario(next); setRevision(current => current + 1);
    void navigate(`${motifinBasePath}/${next === "cash-shortfall" ? "upcoming?month=2026-10" : next === "correction" ? "import" : next === "classification" ? "spending?category=미분류&focus=classification" : "review"}`, { replace: true });
  }
  return <main id="main-content" className="motifin mf-main">
    <details className="mf-review-tools"><summary>와이어프레임 · 합성 자료 <span>검토 도구</span></summary><div><label className="mf-field">시나리오<select value={scenario} onChange={e => reset(e.target.value as WireframeScenario)}>{wireframeScenarios.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><Button variant="outline" onClick={() => reset(scenario)}>현재 시안 초기화</Button><p>화면 크기 참고: 갤럭시 S25 FE. 모든 금액·거래는 가상이며, 변경은 새로고침 시 초기화돼요.</p></div></details>
    <Preview key={`${scenario}-${revision}`} scenario={scenario} onRetry={() => reset("monthly")} />
  </main>;
}

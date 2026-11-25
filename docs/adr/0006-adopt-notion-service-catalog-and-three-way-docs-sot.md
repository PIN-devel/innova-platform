# ADR-0006: Notion 3-DB 서비스 카탈로그 및 3원 문서 원천(SoT) 채택

- 상태: 승인됨(Accepted)
- 결정일: 2026-11-25
- 적용 범위: 저장소 공통 (`README.md`, `AGENTS.md`, `docs/`, `apps/*/docs/`, `services/*/docs/`, `private-data/**/*.md`)
- 관련 이슈: Linear [PIN-91](https://linear.app/pin-dev/issue/PIN-91), [PIN-92](https://linear.app/pin-dev/issue/PIN-92)
- 후속/연계 이슈: [PIN-93](https://linear.app/pin-dev/issue/PIN-93), [PIN-94](https://linear.app/pin-dev/issue/PIN-94), [PIN-95](https://linear.app/pin-dev/issue/PIN-95)

## 1. 맥락과 문제 정의 (Context)

- **저장소 문서 누적과 구조적 부채**:
  - 2026-11-25 기준 저장소에는 Git 추적 Markdown 42개 파일(2,893줄)과 Git 제외 로컬 작업 문서(`private-data/**/*.md`) 2,204줄이 누적되어 있다.
  - 표준 문서 관리 체계(Diátaxis 4분면, Living Spec vs Point-in-Time 분리, Docs-as-Code 경계) 기준으로 점검한 결과, (1) 현행 기준과 시점별 실측·회고 기록 혼재, (2) Linear 이슈(`PIN-XX`) 단위 파일 증식, (3) 단일 도메인(MOTIFIN) 스펙의 프런트·백엔드 레이어 분산, (4) `AGENTS.md`·`docs/` 간 공통 보안·DB 지침 중복, (5) 일회성 작업 지침·인수인계·감사 문서의 로컬 고립 문제가 확인되었다.
- **기술적·운영적 제약 조건**:
  - **개인 프로젝트 경량성**: 관리자가 1인이므로 DB 수·속성 수·유지보수 절차가 과도하면 지속 운영이 어렵고, Notion 개인/무료 플랜으로만 완결되어야 한다.
  - **AI 코딩 에이전트 접근성**: 샌드박스/오프라인 환경 및 코드 PR 리뷰에서 즉시 참조해야 하는 `AGENTS.md`, ADR, 보안·DB 경계 계약은 Git에 남아야 한다.
  - **보안 및 탈출 전략([ADR-0002](0002-google-cloud-run-msa-and-exit-strategy.md))**: 비공개 학습 문항 원문, 실제 금융 파일·개인 거래 수치, 운영 자격증명은 외부 지식 베이스에 반입할 수 없으며, 벤더 락인 방지를 위한 백업/내보내기 경로가 필요하다.

## 2. 검토한 대안 (Considered Options)

### 대안 1: Git 저장소 단일 보관 유지
- **개요**: 모든 문서를 `docs/`, `apps/*/docs/`, `services/*/docs/`에 계속 보관한다.
- **장점**: 단일 Git PR로 코드와 문서를 함께 리뷰하고 오프라인/샌드박스에서 즉시 읽을 수 있다.
- **단점 및 미채택 사유**: 다중 속성(제품·도메인·문서 유형·상태·검토 주기) 기반 필터·정렬·인덱싱이 어렵고, 제품 기획·와이어프레임·시점별 리포트가 코드 저장소를 계속 비대화시킨다.

### 대안 2: GitHub Wiki 또는 Google Drive 분리
- **개요**: 비코드 문서를 GitHub Wiki 또는 Google Drive/Docs 폴더 구조로 이관한다.
- **장점**: 별도 구독 비용 없이 기존 계정으로 바로 사용할 수 있다.
- **단점 및 미채택 사유**: 폴더·문서 계층 중심이라 다중 속성 쿼리, 관계형 연결(제품 ↔ 컴포넌트 ↔ 스펙), 상태(`Active`/`Superseded`/`Archived`) 인덱싱에 취약하다.

### 대안 3: Notion 단일 문서 DB (`Innova Docs` 1개)
- **개요**: Notion에 문서 목록 DB 1개만 두고 `Select` 속성으로 도메인·서비스를 구분한다.
- **장점**: 초기 구축이 가장 단순하다.
- **단점 및 미채택 사유**: 제품(다중 서비스에 걸치는 MOTIFIN 등)과 패키지(`services/learning` 등) 간 M:N 구조를 설명할 수 없고, 신규 제품/컴포넌트가 추가될 때마다 선택 옵션을 수정해야 하며 이름 변경·종료 이력을 연결하기 어렵다.

### 대안 4: Notion 6-DB 전체 서비스 카탈로그
- **개요**: `Products`, `Capabilities`, `Components`, `Resources`, `Interfaces`, `Knowledge` 6개 DB를 모두 분리한다.
- **장점**: Backstage/C4 모델을 가장 세밀하게 반영한다.
- **단점 및 미채택 사유**: API 계약(`packages/contracts`)·APISIX 라우트가 이미 Git에 있어 `Interfaces`는 이중 관리가 되고, Database-per-Service 원칙상 `Resources`는 `Components` 속성으로 충분하다. 개인 프로젝트 기준 과설계다.

### 대안 5: Git · Notion(3-DB 서비스 카탈로그) · Linear 3원 원천 (선택됨)
- **개요**: 역할에 따라 원천을 3분할하고, Notion에는 필수 아키텍처에 해당하는 **3개 관계형 DB(`Products`, `Components`, `Knowledge`)**와 허브 페이지만 둔다.
- **장점**: 서비스 구조 설명력(제품↔컴포넌트↔DB/RPO↔스펙)과 확장성(스키마·옵션 무변경 확장)을 모두 충족하면서도 DB 3개(평균 8속성)로 경량성을 유지한다.
- **단점 및 위험 요소**: Notion MCP/UI와 Git 간 자동 동기화가 없으므로 카탈로그 정합성 규칙과 주기적 Export 백업 규율을 지켜야 한다.

## 3. 결정 (Decision)

1. **3원 원천(Source of Truth) 소유 경계 확정**:
   - **Git 저장소**: 소스 코드, `README.md`, `AGENTS.md`, `docs/adr/*`, 핵심 공통 운영·보안·DB 정책, 패키지 기술 아키텍처, 문서 채점 기준 원문.
   - **Notion ([Innova Platform 허브](https://app.notion.com/p/42369ba4b33081fca91cf9d63f44208e?pvs=204) + 3-DB)**: 서비스 카탈로그(`Products` · `Components`), 제품 기획·UX 결정, **기능당 현행 스펙 1행** 원칙의 `Knowledge` DB, 릴리스/QA·기준선/감사/인수인계 리포트, Git 원천 문서의 포인터 행(1줄 요약 + GitHub URL).
   - **Linear**: 작업 단위(Issue, 목표·범위·AC, 진행 상태, 정량 채점 결과 댓글) 및 공통 개선 후보([PIN-53](https://linear.app/pin-dev/issue/PIN-53)).
2. **Notion 3-DB 경량 아키텍처**:
   - **`Products` (8행, 5속성)**: Linear 제품 Area 7개 + `Platform` 1행 (`Curriculum`은 `Exam Drill` 내부 기능, `Engineering`은 문서 유형으로 분류).
   - **`Components` (8행, 9속성)**: `pnpm-workspace` 패키지 8개와 1:1 대응. 소유 DB·RPO·개인 데이터 등급은 속성(`DataRPO`, `DataTier`)으로, API·이벤트 요약과 계약 경로는 `Interfaces`·`RepoURL`로, 공용 인프라는 허브 페이지로 관리해 별도 `Resources`/`Interfaces` DB를 두지 않는다.
   - **`Knowledge` (10속성)**: `'기능 스펙'` 유형 행 1개 = 기능 1개로 강제하여 별도 `Capabilities` DB 없이 이슈 단위 문서 증식을 방지한다. 상태 전환(`Draft` → `Active` → `Superseded` / `Archived`)과 `SupersededBy` 자기 참조 관계로 이력을 보존한다.
   - **링크-온리 원칙**: Git이 원천인 `Knowledge` 행은 본문에 1줄 요약과 GitHub URL만 두고 원문을 복제하지 않는다.
3. **정량 채점 매트릭스 의무화**:
   - 구조·이관 완료 여부는 정성 판단 대신 [문서 관리 정책](../documentation-policy.md)에 정의된 **설명력(`E1~E8`)·확장성(`X1~X5`)·경량성(`L1~L5`) 각 80% 이상(0점 항목 0개) + 필수 게이트(`G1~G3`) 전 항목 Pass** 기준으로 판정하고, `PIN-92`(1차)·`PIN-95`(2차 최종)에 실측 증거를 남긴다.
4. **보안 및 벤더 락인 탈출 전략**:
   - 비공개 학습 문항 원문, 실제 금융 원파일·개인 거래 수치, 운영 자격증명·시크릿 값은 Notion·Git·Linear 어디에도 반입하지 않는다(시크릿은 변수 이름만 표기).
   - 코드 실행 계약은 Git에 남기고, Notion 허브 및 3-DB는 **분기별 1회 및 주요 마일스톤 마감 시** Notion `Export` → `Markdown & CSV`(하위 페이지 포함)로 백업한다.

## 4. 결과와 영향 (Consequences)

### 긍정적 영향 (Pros)
- `PIN-92` 1차 실측 기준 설명력 `16/16`(허브 0~1클릭 조회), 확장성 `10/10`(복제 DB에서 스키마·옵션·뷰 무변경 5개 시나리오 통과), 경량성 `10/10`(3-DB, 평균 8.0속성/최대 10속성, 유료 기능 의존 0건)을 달성했다.
- 제품 기획·기능 스펙·시점별 리포트가 코드 PR에서 분리되어 저장소 문서 비대화를 멈출 수 있다.

### 감수할 비용 및 트레이드오프 (Cons & Trade-offs)
- **MCP 직렬화 제약 대응**: Notion MCP 도구 인자의 공백/특수문자(`&`, `:`) 키 직렬화 오류를 회피하기 위해 DB 속성명을 PascalCase(`Summary`, `RepoURL`, `DataRPO`, `DataTier`, `DocType`, `LinearID`, `SourceURL`, `NextReview`, `SupersededBy`)로 유지한다.
- **수동 관리 요소**: Notion MCP가 DB 내부 페이지 템플릿 생성 및 원클릭 Export 실행을 지원하지 않으므로, 템플릿은 허브 §4 가이드로 제공하고 Markdown & CSV Export는 사용자가 주기적으로 확인한다.

### 후속 작업 / 영향받는 영역
- [PIN-93](https://linear.app/pin-dev/issue/PIN-93) (`[Docs-2]`): 저장소 잔류 문서(`AGENTS.md`, `README.md`, `docs/*.md`) 중복 제거 및 Notion `Components` 상호 링크 연결
- [PIN-94](https://linear.app/pin-dev/issue/PIN-94) (`[Docs-3]`): `apps/web/docs/`·`services/finance/docs/`의 기능 단위 통합 Notion 이관 및 저장소 링크-온리 전환
- [PIN-95](https://linear.app/pin-dev/issue/PIN-95) (`[Docs-4]`): `private-data/**/*.md` 보안 분류·비민감 문서 이관 및 2차 최종 정량 채점(회귀 검증)

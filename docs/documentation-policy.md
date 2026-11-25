# 문서 관리 정책

상태: 현행 정책 ([ADR-0006](./adr/0006-adopt-notion-service-catalog-and-three-way-docs-sot.md), [PIN-92](https://linear.app/pin-dev/issue/PIN-92) 개정). 적용 범위: 저장소 전체, Notion 허브·카탈로그, Linear 작업 기록.

## 3원 원천(Source of Truth) 역할과 위치

| 원천 | 위치 | 소유 내용 |
| --- | --- | --- |
| **Git 저장소** | 루트 `README.md` | 설치·실행·공통 검증과 Git/Notion/Linear 문서 진입점 |
| **Git 저장소** | 루트 `AGENTS.md` | AI가 항상 적용할 공통 핵심 지침과 조건별 참조 |
| **Git 저장소** | `apps/<app>/README.md`, `services/<service>/README.md` | 해당 앱/서비스의 실행·환경·문서 진입점 |
| **Git 저장소** | `apps/<app>/AGENTS.md`, `services/<service>/AGENTS.md` | 해당 앱/서비스에만 적용하는 구현·검증 지침 |
| **Git 저장소** | `docs/*.md` | 공통 운영·AI·Git·Linear·DB·보안·복구 정책과 정량 채점 기준 원문 |
| **Git 저장소** | `docs/adr/*.md` | 아키텍처 의사결정 기록(ADR)과 변경 이력 (시계열 보존) |
| **Git 저장소** | `apps/<app>/docs/*.md`, `services/<service>/docs/*.md` | 코드와 함께 PR에서 유지되는 기술 아키텍처·디자인 기준 |
| **Notion** | [Innova Platform 허브](https://app.notion.com/p/42369ba4b33081fca91cf9d63f44208e?pvs=204) · `Products` · `Components` · `Knowledge` | 서비스 카탈로그(제품↔컴포넌트↔DB/RPO), 제품 기획·UX 스펙, **기능당 1행** 현행 기능 스펙, 릴리스/QA·기준선/감사/인수인계 리포트, Git 원천 문서 포인터 행 |
| **Linear** | Pin(PIN) 팀 / Innova Platform 프로젝트 | 개별 Issue(목표·범위·AC·검증 결과), 정량 채점 승인 댓글, 공통 개선 후보([PIN-53](https://linear.app/pin-dev/issue/PIN-53)) |

앱 문서를 루트로 모으거나 같은 규칙을 여러 문서·원천에 복사하지 않는다. 내용이 없는 디렉터리와 목록만 중복하는 README는 만들지 않는다. Git이 원천인 문서를 Notion `Knowledge` DB에 등록할 때는 **1줄 요약 + GitHub URL**만 둔 포인터 행으로 관리하고 본문을 복제하지 않는다.

## 카탈로그 정합성 및 Living Spec 규칙

- **Component·Product 1:1 정합성**:
  - `pnpm-workspace.yaml` 기준 패키지(`apps/*`, `services/*`, `packages/*`)를 추가·폐기·이름 변경할 때는 Notion `Components` 행과 해당 패키지의 `AGENTS.md`/`README.md` 진입점을 함께 갱신한다.
  - Linear 제품 Area를 추가·이름 변경·종료할 때는 Notion `Products` 행을 함께 갱신한다(`Platform` 행 포함; `Curriculum`은 `Exam Drill` 내부 기능, `Engineering`은 문서 유형으로 분류).
- **기능당 현행 스펙 1행 원칙**: Linear 이슈(`PIN-XX`)마다 별도 스펙 문서를 누적하지 않는다. 구현 범위·AC·검증 요약은 Linear 이슈가 소유하고, Notion `Knowledge`의 `'기능 스펙'` 행은 기능 단위로 1행만 유지한다. 스펙이 대체될 때는 기존 행의 `Status`를 `Superseded`로 전환하고 `SupersededBy` 관계로 후속 행을 연결한다.
- **시점별 기록 분리**: 과거 기준선, 실측 검증 로그, 릴리스 판정, 감사/인수인계 기록은 현행 기술 기준 문서에 누적하지 않고 Notion `Knowledge`의 해당 `DocType`(`QA·Baseline`, `Release`, `Audit·Handoff`)과 `Status`(`Active` / `Archived`)로 분리 관리한다.
- **무료 플랜 독립성**: Notion 카탈로그 구조와 저장된 뷰는 Notion 개인/무료 플랜 기능만으로 동작해야 하며 Business/Enterprise 전용 API 필터·정렬에 의존하지 않는다.

## 파일명과 상태

- 직접 작성하는 일반 문서·디렉터리는 소문자 kebab-case와 `.md`를 사용한다.
- `README.md`, `AGENTS.md`, `LICENSE` 및 도구가 요구하는 파일은 예외다. AGENTS의 적용 위치를 이동하지 않는다.
- 현행 기준은 안정적인 이름을 유지한다. 초안은 파일명에 final/v2/draft를 누적하지 않고 본문 상태로 구분한다.
- 과거 기록은 상태·측정일·기준 커밋·실행 환경·제한을 기록한다. 같은 종류의 기록이 늘면 날짜를 포함한 kebab-case 이름으로 구분한다.
- 소스·테스트·생성 파일의 이름은 루트/앱 AGENTS 규칙을 유지한다. 문서 정리를 이유로 source symbol을 바꾸지 않는다.

## 현재 문서와 이동 결정

| 문서 | 역할·처리 |
| --- | --- |
| 루트·Web·서비스 README | 현재 위치 유지; 실행·Git/Notion 문서 탐색 |
| 루트·Web·Gateway·서비스 AGENTS | 현재 위치 유지; 공통/앱 지침의 적용 경계 |
| `docs/documentation-policy.md` | 이 문서; 3원 원천·명명·참조·정량 채점 기준 |
| `docs/ai-workflow.md` | 조사·구현·검증·전달과 읽기 범위 |
| `docs/git-workflow.md` | Git 병합·릴리스·정리 기준 |
| `docs/linear-workflow.md` | 이슈 관리와 자동화 경계 |
| `docs/adr/*.md` | 중대 아키텍처 결정의 배경·대안·영향 기록; 불변성 유지 ([ADR-0001](./adr/0001-record-architecture-decisions.md), [ADR-0006](./adr/0006-adopt-notion-service-catalog-and-three-way-docs-sot.md)) |
| `docs/database-migrations.md` | 서비스 DB 스키마 변경·신규 테이블 메타데이터 기준·dev 검증·복구 준비와 변경별 기록 양식 |
| `docs/backup-and-recovery.md` | 백업·복원, RPO/RTO, 도메인별 격리 복구 절차, 유일 원본 도메인 게이트 |
| `docs/personal-data-boundaries.md` | 개인 데이터 도메인의 공통 접근·세션·오류/로그·보존 경계 및 검증 행렬 |
| `apps/web/docs/architecture.md` | 현행 Web 구조; 앱이 소유 |
| `apps/web/docs/design.md` | 현행 Web UI 기준; 앱이 소유 |
| `services/finance/docs/personal-finance-architecture.md` | 현행 금융 서비스 기술 아키텍처; 서비스가 소유 (기능 스펙·출시는 Notion) |

PIN-31 / PIN-93 / PIN-94 이동·통합표(과거 경로 기록):

| 이전 | 현재 |
| --- | --- |
| `apps/web/ARCHITECTURE.md` | `apps/web/docs/architecture.md` |
| `apps/web/DESIGN.md` | `apps/web/docs/design.md` |
| `apps/web/architecture-baseline.md` | `apps/web/docs/architecture-baseline.md` |
| `docs/database-table-metadata.md` | `docs/database-migrations.md#신규-테이블-메타데이터-기준` (`PIN-93` 통합) |
| `apps/web/docs/motifin-*`, `platform-buttons.md`, `architecture-baseline.md` | Notion `Knowledge` DB 이관 완료 (`PIN-94`) |
| `services/finance/docs/finance-*.md` (7기능 + `finance-release.md`) | Notion `Knowledge` DB 통합 이관 완료 (`PIN-94`) |

## 변경과 검증

문서의 소유 범위부터 결정하고 제목·상태·필요한 절만 작성한다. 문서의 위치·명명·원천 경계·채점 기준은 이 문서, 공통 정책·ADR·기술 아키텍처 원문은 저장소, 제품·기능 스펙·시점별 리포트 원문은 Notion, 작업별 계획/AC/결과는 Linear, 실제 구현은 소스가 소유한다. 초안이 확정되면 원문 링크로 대체하고 이슈나 타 원천에 전문을 복제하지 않는다.

## 정책 채택과 기록 위치

새 정책·운영 지침을 채택하거나 변경하는 작업은 다음 기록을 함께 완료한다. 대화나 이슈 댓글에만 원칙을 남긴 것으로 문서화를 완료하지 않는다.

| 기록 | 원문 위치와 책임 |
| --- | --- |
| 반복 적용할 공통 정책 | 해당 `docs/*.md`에 현행 기준을 기록 (Notion에는 포인터 행만 유지) |
| 중대 아키텍처 결정과 대안 비교 | `docs/adr/`에 ADR로 기록 (ADR-0001 준수, Notion에는 포인터 행만 유지) |
| 코드와 함께 검증할 앱·서비스 기술 구조 | 해당 `apps/<app>/docs/*.md` 또는 `services/<service>/docs/*.md`에 기록 |
| 제품 기획·기능 스펙·릴리스/QA/감사 리포트 | Notion `Knowledge` DB에 기록하고 `Products`/`Components` 관계를 연결 |
| 작업 시 읽을 조건 | 관련 AGENTS에 짧은 조건·링크를 추가하고 README에 탐색 경로 제공 |
| 변경별 계획·완료 기준·검증·운영 결과 | 해당 변경을 소유한 Linear 이슈에 기록; 미실행 항목과 구분 |
| SQL·구현·테스트와 검토 요약 | 원문은 저장소, PR은 변경·검증 요약과 정책·Linear 링크 |

문서화 작업의 완료 기준에 원문 위치 확정, 조건별 진입점 연결, 기록 책임 명시와 링크·diff 검증을 포함한다. 정책 원문을 여러 곳에 복사하거나 변경마다 별도 보고서 파일을 만들 필요는 없다. 문서 작성 완료와 문서에서 정한 실제 검증·운영 실행의 완료는 각각 해당 이슈 범위로 판단한다.

## 보안 경계 및 Notion 탈출·백업

- **외부 반입 금지**: 실제 학습 은행의 문제·정답·해설 원문, 실제 금융 원파일(PDF/XLSX)·개인 거래 실수치, 운영 자격증명·시크릿 값은 Git·Notion·Linear 어디에도 반입하지 않는다. Notion 허브 및 DB에는 시크릿 변수 이름만 표기한다.
- **Notion 백업 및 탈출 주기**: 벤더 락인과 데이터 유실을 방지하기 위해 **분기별 1회 및 주요 마일스톤 마감 시** Notion [Innova Platform 허브](https://app.notion.com/p/42369ba4b33081fca91cf9d63f44208e?pvs=204)에서 `Export` → `Markdown & CSV`(하위 페이지 포함)를 실행해 관계 정보와 본문이 사람이 읽을 수 있는 형태로 보존됨을 확인한다.

## 정량 채점 매트릭스 (구조·이관 검증 기준)

문서 체계 개편이나 대규모 카탈로그 변경 시 정성 판단 대신 아래 매트릭스로 채점하고, 에이전트가 실측 증거를 제시한 뒤 **사용자 승인**으로 통과를 확정한다. 채점 결과는 해당 Linear 이슈 댓글에 기록한다.

- **통과 기준**: **필수 게이트 `G1~G3` 모두 Pass** + **채점 3영역(`E`, `X`, `L`) 각 득점률 80% 이상** + **0점 항목 0개** (항목별 0/1/2점 3단계 척도)

### 1. 설명력 (`E1~E8`, 만점 16점 · 통과 ≥ 13점 · 0점 없음)
`2점`: 허브 3클릭 이내 또는 저장된 뷰 1개로 완전한 답 / `1점`: 3클릭 초과 또는 여러 페이지 조합 / `0점`: 답 불가 또는 코드 열람 필요

| ID | 평가 문항 |
| --- | --- |
| `E1` | 허브 페이지만 보고 서비스 개요(제품·컴포넌트·저장소·외부 의존)를 설명할 수 있는가 |
| `E2` | 제품 목록과 각 제품의 단계 |
| `E3` | 특정 제품(예: MOTIFIN/Personal Finance)의 기능 스펙 목록과 구현 컴포넌트 |
| `E4` | 특정 컴포넌트의 소유 DB·RPO·개인 데이터 등급·복구 문서·장애 시 영향받는 제품 |
| `E5` | 특정 API 경로·이벤트를 제공하는 컴포넌트와 계약 위치(Git 링크) |
| `E6` | 개인 데이터를 유일하게 보관하는 컴포넌트와 적용 경계 기준 |
| `E7` | Linear 이슈·마일스톤에서 현행 기능 스펙 역추적 |
| `E8` | 검토 주기를 넘긴 Active 문서 목록 |

### 2. 확장성 (`X1~X5`, 만점 10점 · 통과 ≥ 8점 · 0점 없음 · 복제 DB 실측)
`2점`: 행 추가·관계/상태 수정만으로 완료(스키마·선택 옵션·뷰 무변경) / `1점`: 선택 옵션 1개 추가 또는 뷰 필터 1개 수정 / `0점`: 속성·DB 추가·뷰 재구성 필요 또는 표현 불가

| ID | 시나리오 |
| --- | --- |
| `X1` | 새 제품 + 새 서비스 + 새 DB 추가 (예: Health & Fitness → `services/health` → `innova_health`) |
| `X2` | 기존 서비스에 두 번째 제품 추가 (예: IT Atlas가 `learning` 재사용) |
| `X3` | 제품 이름 변경 후 종료 (`PIN-32`: MOTIFIN → Personal Finance) |
| `X4` | 서비스 분리·통합 (`apps/api` → `services/*` 전환을 `Deprecated`와 관계로 표현) |
| `X5` | 기능 스펙 대체 및 이력 보존 (`Superseded` + `SupersededBy`) |

### 3. 경량성 (`L1~L5`, 만점 10점 · 통과 ≥ 8점 · 0점 없음)

| ID | 항목 | 2점 | 1점 | 0점 |
| --- | --- | --- | --- | --- |
| `L1` | Notion DB 수 | 3개 이하 | 4~5개 | 6개 이상 |
| `L2` | DB당 관리 속성 수 | 평균 ≤8, 최대 ≤10 | 최대 11~13 | 14개 이상 |
| `L3` | 신규 기능 1건 등록·갱신 시 수정 DB 수 | 1개 DB | 2개 DB | 3개 이상 DB 또는 스키마 수정 |
| `L4` | Notion 유료 플랜 기능 의존도 | 0건 | 보조 뷰 1건 | 핵심 채점 항목 의존 |
| `L5` | Git↔Notion 본문 중복 | 0건 | 1~2건 경미 중복 | 3건 이상 본문 복제 |

### 4. 필수 게이트 (`G1~G3`, 전 항목 Pass 필수)

- **`G1` (보안·탈출)**: (a) 시크릿 값·개인정보·비공개 문항 0건 (b) Markdown/CSV Export 시 관계 정보 보존 (c) `AGENTS.md`·`ADR` 등 코드 계약 Git 유지 (d) 백업 주기 정책 명시
- **`G2` (정합성)**: (a) `Components` 행이 `pnpm-workspace` 패키지와 1:1 (b) `Products` 행이 Linear 제품 Area + `Platform`과 1:1 (c) 신규 패키지·Area 추가 시 카탈로그 갱신 규칙 명시
- **`G3` (링크 위생)**: (a) 저장소·허브·DB 내 깨진 상대 링크·URL 0건 (b) `apps/web` Markdown 변경 시 Tailwind 빌드 회귀 없음

## 문서 검증

이동 시 Markdown 상대 링크와 앵커, AGENTS의 경로 문자열, README 진입점, 코드·설정의 문서 참조를 함께 갱신한다. 문서 내부 코드·자산 경로의 기준 디렉터리도 명시한다. 외부 Linear의 과거 기록은 변경 이력을 보존하고 최종 경로 안내를 보완한다.

문서만 바뀌면 내부 링크·앵커·오래된 경로·파일명·diff와 원문 보존을 검사한다. 실행 코드/계약/설정/의존성 외에 문서가 빌드 입력인지도 확인한다. Web의 Tailwind 자동 탐색은 Markdown도 스캔하므로 이동·내용 변경 시 후보/생성 CSS 비교나 관련 빌드로 영향을 확인한다. [Tailwind 소스 탐색](https://tailwindcss.com/docs/detecting-classes-in-source-files)을 참고한다.

빌드 입력에 영향이 없거나 좁힌 생성물 검증으로 확인되면 전체 앱 테스트·빌드·브라우저 QA를 반복하지 않는다. 실행 코드/계약/설정/의존성이 함께 바뀌면 해당 AGENTS의 검증을 따른다.

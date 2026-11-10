# AI 에이전트 공용 지침

이 파일은 저장소 전체에 적용된다. `apps/web/AGENTS.md`, `apps/api/AGENTS.md`, `apps/api-gateway/AGENTS.md`, `services/auth/AGENTS.md`, `services/finance/AGENTS.md`, `services/ai/AGENTS.md`는 각 앱/서비스를 작업할 때 이 지침에 추가로 적용된다. 저장소 루트에서 AI 에이전트를 시작했다면 해당 앱/서비스를 수정하기 전에 그 대상의 `AGENTS.md`를 직접 읽는다.

## 저장소와 작업 원칙

- 이 저장소는 pnpm 워크스페이스다. `apps/web`은 React 웹 앱, `apps/api-gateway`는 APISIX 게이트웨이, `apps/api`는 기존 Fastify 모놀리스(Render), `services/auth`는 분리된 인증/회원 마이크로서비스(Cloud Run), `services/finance`는 분리된 개인 금융(MOTIFIN) 마이크로서비스(Cloud Run), `services/ai`는 분리된 AI(K-EXAONE 2.5 PoC) 마이크로서비스(Cloud Run), `packages/contracts`는 공유 Zod 스키마, `packages/auth-kit`은 Fastify 인증 공통 킷이다.
- **MSA Database-per-Service 원칙**: 각 마이크로서비스(`services/*`)는 자신이 소유한 전용 데이터베이스(`innova_auth`, `innova_finance` 등)에만 접속하며, 다른 마이크로서비스의 데이터베이스에 직접 접속(읽기 전용 포함)하거나 테이블·외래키(FK)·SQL 잠금을 공유하지 않는다([ADR-0004](docs/adr/0004-split-domain-services-into-packages.md)). 타 도메인 데이터의 조회·검증·변경은 반드시 소유 서비스의 HTTP API를 호출하고, 다중 서비스에 걸친 상태 변경이 필요한 경우 보상 트랜잭션(망취소)으로 원자성을 보호한다.
- 의존성 설치와 공통 검증은 저장소 루트에서 `pnpm`으로 실행한다. 패키지 매니저나 잠금 파일을 임의로 바꾸지 않는다.
- 작업 전에 관련 코드와 기존 수정 사항을 확인한다. 이미 있는 수정 사항을 보존하고, 요청과 무관한 파일은 수정하지 않는다.
- API 요청과 응답의 형태를 바꿀 때는 `packages/contracts`를 기준으로 `@innova/web`과 `@innova/api`의 사용처를 함께 확인한다. 공유 계약을 변경한 뒤에는 루트에서 `pnpm build` 또는 `pnpm typecheck`로 두 앱을 검증한다.
- 비밀 정보와 실제 연결 문자열을 코드와 지침에 넣지 않는다. 환경 변수의 예시는 `.env.example`에만 작성한다.
- 실제 학습 은행의 문제·정답·해설과 사용자 데이터는 저장소나 테스트 fixture에 넣지 않는다. 검증에는 합성 데이터를 사용한다.
- 완료 시 변경 내용, 실행한 검증과 그 결과, 남은 제약을 간결하게 보고한다.

## 외부 리소스·의존성 최신성 및 보안 원칙

- **학습 데이터 기반 버전 추측 엄격 금지**: GitHub Actions(`uses: ...@vX`), 컨테이너 베이스 이미지, npm 패키지 의존성, 런타임 환경 등을 새로 도입하거나 수정할 때 AI 모델의 과거 사전학습 데이터에만 의존하여 오래된 버전을 관성적으로 작성하는 행위를 엄격히 금지한다.
- **최신 안정 버전 및 EOL/Deprecation 정책 실시간 조회 필수**:
  - 외부 액션이나 도구를 지정할 때는 반드시 CLI(`gh release view`, `npm view` 등), 릴리스 정보, 공식 문서 또는 웹 검색을 통해 **현재 유지보수 중인 최신 안정(Stable) 메이저 버전**과 **런타임 지원 중단(EOL/Deprecation) 공지**를 직접 확인한다.
  - GitHub Actions의 경우 러너의 Node.js 런타임 지원 정책(예: Node.js 20 지원 중단에 따른 Node.js 24 호환 메이저 버전 채택) 및 최신 보안 패치를 사전에 검증하여, 구버전 런타임 강제 실행 경고나 보안 사고가 유발되지 않도록 한다.
- **토큰 절감을 이유로 한 검증 생략 금지**: 버전 확인, 마이그레이션 변경점 점검, 보안 권고사항 확인 시 토큰 소모를 피하기 위해 조회를 생략하고 임의의 구버전이나 과거 학습된 낡은 문법을 사용하는 행위를 일절 금지한다.

## 필요한 문서만 읽기

- 아래 표에서 작업에 해당하는 문서만 읽는다. 같은 세션에서 내용이 바뀌지 않은 문서를 다시 읽거나 측정 기록을 기본 문맥에 넣지 않는다.
- 검색은 경로·키워드부터 좁히고 필요한 절만 읽는다. 원격 정보는 작업 전 한 번 확인하고, 쓰기·병합 직전에 달라질 수 있는 상태만 다시 확인한다.

| 작업 | 추가 기준 |
| --- | --- |
| 문서 작성·이동·명명·정책 채택 | [문서 정책](docs/documentation-policy.md) |
| 여러 단계의 조사·구현·검증·전달 절차 설계 | [AI 작업 흐름](docs/ai-workflow.md) |
| 브랜치·PR·릴리스·정리 | [Git 운영](docs/git-workflow.md) |
| Linear 조회·생성·분류·갱신·종료, 공통 개선 후보 기록 | [Linear 운영](docs/linear-workflow.md) |
| DB 스키마·migration 변경과 복구 준비 | [API DB 변경 지침](apps/api/docs/database-migrations.md) |
| 신규 테이블의 식별·감사·소유권·추적 메타 설계 | [테이블 메타데이터 기준](docs/database-table-metadata.md) |
| 중대 아키텍처 결정 확인·작성, 설계 변경 맥락 | `docs/adr/` 내 관련 결정 ([ADR-0001](docs/adr/0001-record-architecture-decisions.md) 체계 준수) |

## Linear 작업 관리

- Pin(PIN) 팀의 Innova Platform 프로젝트에서 관련 이슈를 먼저 조회하고 중복 생성·PR 연결·결과 기록을 피한다. 요청 범위 안에서 목표·범위·완료 기준을 갱신한다.
- 영역 분류는 주요 `Area` Label 하나, Milestone은 완료 기준이 명확한 목표에만 사용한다. 적합한 목표가 없으면 Milestone을 비워 두며 기존 포괄 Milestone에 자동 배정하지 않는다.
- 작업 중 발견한 비차단 공통 개선 후보는 중복 확인 후 [PIN-53](https://linear.app/pin-dev/issue/PIN-53) 댓글에 출처·Area·관찰·아이디어·지금 처리하지 않는 이유를 기록한다. 후보만으로 구현 범위를 넓히지 않으며 실제 버그·보안 위험·장애·AC 차단 문제는 현재 이슈 또는 독립 이슈에서 처리한다. 승격·보류와 Inbox 상태 기준은 [Linear 운영](docs/linear-workflow.md#공통-개선-후보-수집과-처리)을 따른다.
- PR 생성의 In Review, 병합의 Done 전환은 기존 자동화에 맡긴다. 현재 값과 적용 조건을 확인하고, 연동 지연을 즉시 수동 상태 변경으로 대체하지 않는다.
- 자동화 밖의 실제 착수·PR 없는 작업만 필요 시 상태를 갱신한다. 기존 담당자·프로젝트·주기·우선순위는 근거 없이 바꾸지 않는다.
- 검증 결과·미실행 항목·잔여 작업을 구분한다. 배포 등 독립 완료 조건은 PR 연결 전에 범위를 정리하며, 비공개 콘텐츠·사용자 데이터·비밀 값은 Linear에도 복제하지 않는다.

## 파일 이름 규칙

- 직접 관리하는 source file과 directory는 kebab-case를 사용한다.
- 하나의 source file에 대응하는 unit test는 `<source>.test.ts(x)` 형식을 우선한다.
- integration 또는 behavior-oriented test는 설명적인 `*.test.*` 이름을 사용할 수 있다.
- ecosystem/tooling이 정한 이름, generated file, migration file, tool-managed file은 예외로 둔다.
- 문서 이름과 위치는 위 문서 정책을 따른다. `README.md`와 `AGENTS.md`의 이름·적용 위치는 유지한다.

## 기본 검증

- 앱별 명령을 직접 실행할 때 `@innova/contracts`의 빌드 결과가 없거나 계약이 바뀌었다면 먼저 `pnpm --filter @innova/contracts build`를 실행한다.
- 변경 범위에 맞는 검증을 먼저 실행한다. 전체 통합 확인이 필요한 경우 루트에서 `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`를 실행한다.
- 문서만 변경한 경우 링크·앵커·경로·diff와 빌드 입력 여부를 검사한다. Tailwind 스캔처럼 문서가 입력이면 관련 생성물/빌드를 검증하고, 아니면 앱 빌드·테스트·브라우저 QA를 반복하지 않는다.
- 루트 `pnpm test`는 Contracts를 빌드한 뒤 API와 Web 테스트를 모두 실행한다. 새 앱의 테스트를 추가할 때 공용 검증에서 누락되지 않도록 한다.
- 테스트나 빌드가 실패하면 원인과 범위를 확인한다. 실행하지 못한 검증은 통과했다고 보고하지 않는다.

# Codex 공용 지침

이 파일은 저장소 전체에 적용된다. `apps/web/AGENTS.md`와 `apps/api/AGENTS.md`는 각 앱을 작업할 때 이 지침에 추가로 적용된다. 저장소 루트에서 Codex를 시작했다면 해당 앱을 수정하기 전에 그 앱의 `AGENTS.md`를 직접 읽는다.

## 저장소와 작업 원칙

- 이 저장소는 pnpm 워크스페이스다. `apps/web`은 React 웹 앱, `apps/api`는 Fastify API, `packages/contracts`는 두 앱이 공유하는 Zod 스키마와 타입이다.
- 의존성 설치와 공통 검증은 저장소 루트에서 `pnpm`으로 실행한다. 패키지 매니저나 잠금 파일을 임의로 바꾸지 않는다.
- 작업 전에 관련 코드와 기존 수정 사항을 확인한다. 이미 있는 수정 사항을 보존하고, 요청과 무관한 파일은 수정하지 않는다.
- API 요청과 응답의 형태를 바꿀 때는 `packages/contracts`를 기준으로 `@innova/web`과 `@innova/api`의 사용처를 함께 확인한다. 공유 계약을 변경한 뒤에는 루트에서 `pnpm build` 또는 `pnpm typecheck`로 두 앱을 검증한다.
- 비밀 정보와 실제 연결 문자열을 코드와 지침에 넣지 않는다. 환경 변수의 예시는 `.env.example`에만 작성한다.
- 실제 학습 은행의 문제·정답·해설과 사용자 데이터는 저장소나 테스트 fixture에 넣지 않는다. 검증에는 합성 데이터를 사용한다.
- 완료 시 변경 내용, 실행한 검증과 그 결과, 남은 제약을 간결하게 보고한다.

## 필요한 문서만 읽기

- 아래 표에서 작업에 해당하는 문서만 읽는다. 같은 세션에서 내용이 바뀌지 않은 문서를 다시 읽거나 측정 기록을 기본 문맥에 넣지 않는다.
- 검색은 경로·키워드부터 좁히고 필요한 절만 읽는다. 원격 정보는 작업 전 한 번 확인하고, 쓰기·병합 직전에 달라질 수 있는 상태만 다시 확인한다.

| 작업 | 추가 기준 |
| --- | --- |
| 문서 작성·이동·명명 | [문서 정책](docs/documentation-policy.md) |
| 여러 단계의 조사·구현·검증·전달 절차 설계 | [AI 작업 흐름](docs/ai-workflow.md) |
| 브랜치·PR·릴리스·정리 | [Git 운영](docs/git-workflow.md) |
| Linear 조회·생성·갱신·종료 | [Linear 운영](docs/linear-workflow.md) |

## Linear 작업 관리

- Pin(PIN) 팀의 Innova Platform 프로젝트에서 관련 이슈를 먼저 조회하고 중복 생성·PR 연결·결과 기록을 피한다. 요청 범위 안에서 목표·범위·완료 기준을 갱신한다.
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
- 문서만 변경한 경우 내부 링크·앵커·경로 참조·diff를 검증한다. 실행 코드·계약·설정·의존성이 그대로라면 앱 빌드·테스트·브라우저 QA를 반복하지 않는다.
- 루트 `pnpm test`는 Contracts를 빌드한 뒤 API와 Web 테스트를 모두 실행한다. 새 앱의 테스트를 추가할 때 공용 검증에서 누락되지 않도록 한다.
- 테스트나 빌드가 실패하면 원인과 범위를 확인한다. 실행하지 못한 검증은 통과했다고 보고하지 않는다.

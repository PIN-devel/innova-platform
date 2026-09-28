# Codex @innova/web 지침

이 파일은 `apps/web/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다.

- 데이터 흐름·라우팅·세션 구조를 변경할 때 `ARCHITECTURE.md`를 먼저 읽는다. PIN-20 통합 리팩터링의 목표 설계와 현행 감사가 구분되어 있으며, 구현 단계에서 달라진 설계는 같은 문서에 갱신한다. 비교 기준선은 `architecture-baseline.md`를 참조한다.
- React, TypeScript, Vite, React Router, TanStack Query의 현재 구조를 따른다. 라우트와 공통 레이아웃은 `src/app/`, 화면은 `src/pages/`, 기능 동작은 `src/features/`, 도메인 API와 조회 정의는 `src/entities/*/`에 둔다. HTTP 전송과 공통 오류 해석은 `src/shared/api/client.ts`를 재사용한다.
- 서버 데이터는 `entities/*/queries.ts`의 Query Key factory와 query options를 조회·갱신·무효화에서 함께 사용한다. 신선도는 데이터 성격별로 정하고 인증·관리자 데이터에 장기 캐시 정책을 일괄 적용하지 않는다. 변경 성공 응답으로 확정된 결과는 캐시에 반영한 뒤 재검증해, 재조회 실패로 이미 처리된 항목이 되살아나지 않도록 한다.
- QueryClient는 `app/query-client.ts`의 인증 경계 처리를 유지한다. 계정·권한 변경 및 세션 만료 시 보호된 캐시를 제거하고, 조회의 `signal`을 HTTP 호출에 전달한다. 신규 보호 데이터는 `features/auth/clear-protected-queries.ts`의 정리 대상에도 반영한다. QueryClient 밖에서 완료되는 비동기 변경 작업은 `entities/auth/session-version.ts`로 이전 세션의 결과가 새 세션에 적용되지 않게 한다.
- 인증 가드의 계정·권한별 Outlet key를 유지해 학습 세션과 화면 로컬 상태가 다른 계정으로 넘어가지 않도록 한다. 사용자별 진도는 사용자 ID로 격리하고, 문제 본문·정답은 브라우저 영구 저장소에 기록하지 않는다.
- 공통 헤더·탐색·계정 동작은 RootLayout, 단일 `main`과 콘텐츠 폭은 content layouts의 책임이다. 기능 페이지와 오류·로딩 화면에서 Shell 또는 `main`을 중복 생성하지 않는다.
- 최초 데이터 조회에는 화면별 Skeleton, 데이터가 있는 재조회에는 기존 콘텐츠와 보조 상태를 표시한다. 일반 네트워크 오류에서는 재시도를 제공하되 인증·권한 오류에서는 보호 콘텐츠를 유지하지 않는다. 표현 세부 사항은 `DESIGN.md`를 따른다.
- API 데이터는 `@innova/contracts`의 스키마와 타입을 사용한다. 계약을 바꿔야 하면 `packages/contracts`와 API 구현을 함께 확인한다.
- 루트의 `pnpm dev:web`은 MSW 기반 웹을 5173 포트에서 실행한다. `pnpm dev`는 API와 프록시 모드 웹을 함께 실행한다.
- `@innova/web` 변경 후 루트에서 `pnpm --filter @innova/web typecheck`, `pnpm --filter @innova/web lint`, `pnpm --filter @innova/web test`, `pnpm --filter @innova/web build` 중 관련 검증을 실행한다. 공유 계약을 변경했다면 루트 공용 검증도 실행한다. MSW는 API의 접근 제어·상태 전이·오류 코드를 동일하게 재현하고 인증 관련 변경은 양쪽 회귀 테스트로 확인한다.
- React component symbol은 PascalCase를 유지하고 component filename은 kebab-case를 사용한다.
- 단일 hook module은 `use-*.ts(x)`를 우선하며, 하나의 feature에서 관련 hook 여러 개를 관리하는 module은 `hooks.ts`를 사용할 수 있다.
- shadcn/ui generated filename은 생성 도구의 convention을 유지한다.
- 플랫폼 UI를 수정할 때 `DESIGN.md`의 사용 원칙을 확인한다. 실제 token 값은 `src/styles.css`, 공통 구현은 `src/shared/ui/`를 기준으로 한다.

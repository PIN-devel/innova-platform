# Codex web 지침

이 파일은 `apps/web/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다.

- React, TypeScript, Vite, React Router, TanStack Query의 현재 구조를 따른다. 라우트와 로더는 `src/app/` 및 `src/pages/`, 기능 코드는 `src/features/`, HTTP 호출은 `src/api/`에 둔다.
- 서버 데이터는 기능별 `queries.ts`의 쿼리 정의를 재사용한다. 변경 요청 후에는 관련 쿼리를 무효화하거나 갱신해 화면이 최신 상태를 표시하도록 한다.
- API 데이터는 `@innova/contracts`의 스키마와 타입을 사용한다. 계약을 바꿔야 하면 `packages/contracts`와 API 구현, MSW 핸들러를 함께 확인한다.
- 루트의 `pnpm dev:web`은 MSW를 사용하고 `pnpm dev`는 API와 프록시 모드 웹을 함께 실행한다. 두 모드의 동작이 달라지면 `src/mocks/handlers.ts`와 실제 API를 비교한다.
- web 변경 후 루트에서 `pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web build` 중 관련 검증을 실행한다. 공유 계약을 변경했다면 루트 공용 검증도 실행한다.

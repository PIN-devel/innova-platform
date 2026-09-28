# Codex @innova/web 지침

이 파일은 `apps/web/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다.

- React, TypeScript, Vite, React Router, TanStack Query의 현재 구조를 따른다. 라우트와 로더는 `src/app/` 및 `src/pages/`, 기능 코드는 `src/features/`, HTTP 호출은 `src/api/`에 둔다.
- 서버 데이터는 기능별 `queries.ts`의 쿼리 정의를 재사용한다. 변경 요청 후에는 관련 쿼리를 무효화하거나 갱신해 화면이 최신 상태를 표시하도록 한다.
- API 데이터는 `@innova/contracts`의 스키마와 타입을 사용한다. 계약을 바꿔야 하면 `packages/contracts`와 API 구현을 함께 확인한다.
- 루트의 `pnpm dev:web`은 MSW 기반 웹을 5173 포트에서 실행한다. `pnpm dev`는 API와 프록시 모드 웹을 함께 실행한다.
- `@innova/web` 변경 후 루트에서 `pnpm --filter @innova/web typecheck`, `pnpm --filter @innova/web lint`, `pnpm --filter @innova/web build` 중 관련 검증을 실행한다. 공유 계약을 변경했다면 루트 공용 검증도 실행한다.
- React component symbol은 PascalCase를 유지하고 component filename은 kebab-case를 사용한다.
- 단일 hook module은 `use-*.ts(x)`를 우선하며, 하나의 feature에서 관련 hook 여러 개를 관리하는 module은 `hooks.ts`를 사용할 수 있다.
- shadcn/ui generated filename은 생성 도구의 convention을 유지한다.
- 플랫폼 UI를 수정할 때 `DESIGN.md`의 사용 원칙을 확인한다. 실제 token 값은 `src/styles.css`, 공통 구현은 `src/shared/ui/`를 기준으로 한다.

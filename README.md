# innova-platform
A reusable full-stack foundation for personal projects, built with React, Fastify, PostgreSQL, and a monorepo architecture.

## Workspace

pnpm 12를 사용합니다. 저장소 루트에서 한 번만 의존성을 설치하면 됩니다.

```sh
pnpm install
```

MSW로 웹을 실행할 때:

```sh
pnpm dev:web
```

실제 API로 웹을 실행할 때는 DB를 설정한 뒤 다음 한 명령으로 API와 웹을 함께 실행합니다:

```sh
pnpm dev
```

API만 별도로 실행하려면 `pnpm dev:api`를 사용합니다.

MSW 모드의 웹 주소는 `http://localhost:5173`, 실제 API 모드는 `http://localhost:5174`입니다. 실제 API 모드에서는 MSW를 시작하지 않고 Vite가 `/api` 요청을 백엔드의 `http://127.0.0.1:3000`으로 전달합니다. 포트를 분리해 기존 MSW 서비스 워커의 영향을 받지 않습니다.

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

`apps/web`과 `apps/api`는 `packages/contracts`의 `@innova/contracts`를 `workspace:*`로 참조합니다. 이 패키지의 Zod 스키마와 타입이 items API의 공통 계약이며, API는 같은 스키마에서 Fastify용 JSON Schema를 생성합니다. 계약을 수정한 뒤에는 루트에서 `pnpm build` 또는 `pnpm typecheck`를 실행해 두 앱을 검증하세요.

# innova-platform
React, Fastify, PostgreSQL 기반 모노레포입니다. `/exam`에서 Exam Drill을 사용합니다.

## Workspace

pnpm 12를 사용합니다. 저장소 루트에서 한 번만 의존성을 설치하면 됩니다.

```sh
pnpm install
```

DB를 설정한 뒤 API와 웹을 함께 실행할 때:

```sh
pnpm --filter @innova/api db:migrate
pnpm dev
```

웹만 MSW와 함께 실행하려면 `pnpm dev:web`을 사용합니다. 이 모드는 `http://localhost:5173`에서 실행됩니다.

API만 별도로 실행하려면 `pnpm dev:api`를 사용합니다.

API 모드의 웹 주소는 `http://localhost:5174/exam`입니다. Vite가 `/api` 요청을 `http://127.0.0.1:3000`으로 전달합니다. `DATABASE_URL`과 32자 이상의 임의 `JWT_SECRET`은 Git에서 제외되는 `apps/api/.env`에 설정합니다. `/login` 또는 `/signup`에서 인증하면 HttpOnly 쿠키가 발급되고 `/api/exam/*`에 전달됩니다. 배포 환경은 HTTPS를 사용해야 합니다.

Exam Drill의 기본 AWS SAP 은행은 `exam_banks`, `exam_concepts`, `exam_scenarios` 테이블에 저장됩니다. 가입 사용자는 기본 은행과 사용자가 가져온 별도 은행의 전체 콘텐츠를 읽을 수 있습니다. 개념, 문제, 정답, 해설 파일은 이 저장소에 두지 않습니다. 새 DB를 시드해야 할 때는 Git 밖에 보관한 비공개 JSON 경로를 `EXAM_BANK_SEED_PATH`로 지정해 `pnpm --filter @innova/api db:seed:exam`을 실행합니다. `pnpm --filter @innova/api db:verify:exam`은 DB 레코드의 형식과 개수만 검사합니다. 앱에서 별도 은행을 가져오면 DB에 저장됩니다. 브라우저 저장소에는 사용자별 학습 통계와 문항 ID만 남고, 문제 문장과 정답은 저장되지 않습니다.

기존 `exam-drill`에서 사용자가 추가한 은행은 기존 앱의 설정에서 JSON으로 내보낸 뒤 새 앱의 설정에서 가져오면 DB에 저장됩니다. 서로 다른 출처의 브라우저 저장소는 자동으로 공유되지 않으므로 기존 개인 학습 진도는 새 앱으로 자동 이전되지 않습니다.

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

`apps/web`과 `apps/api`는 `packages/contracts`의 `@innova/contracts`를 공유합니다. Exam Drill 은행의 JSON 검증도 이 패키지의 Zod 스키마를 사용합니다.

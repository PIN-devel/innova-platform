# Codex api 지침

이 파일은 `apps/api/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다.

- Fastify 앱 구성은 `src/app.ts`, 라우트는 `src/routes/`, DB 연결과 저장소 코드는 `src/db/`의 현재 분리를 따른다. 라우트 테스트는 `buildApp`에 테스트용 저장소를 주입해 실제 DB 없이 실행한다.
- 요청과 응답의 타입 및 스키마는 `@innova/contracts`를 기준으로 한다. 엔드포인트를 바꾸면 공유 계약, web 호출, 관련 테스트를 함께 확인한다.
- DB 스키마를 수정할 때는 `src/db/schema.ts`와 생성된 `drizzle/` 마이그레이션을 함께 반영한다. `pnpm --filter api db:generate`로 마이그레이션을 만들고 내용을 검토한다. `db:migrate`는 연결 대상 DB를 확인한 뒤 실행한다.
- `DATABASE_URL` 등 비밀 값은 `.env`에만 두고 커밋하지 않는다. 필요한 변수의 이름과 예시 형식은 `.env.example`에 반영한다.
- api 변경 후 루트에서 `pnpm --filter api typecheck`, `pnpm --filter api test`, `pnpm --filter api build` 중 관련 검증을 실행한다. 공유 계약을 변경했다면 루트 공용 검증도 실행한다.

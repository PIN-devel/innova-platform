# Codex @innova/api 지침

이 파일은 `apps/api/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다.

- Fastify 앱 구성은 `src/app.ts`, 라우트는 `src/routes/`, DB 연결과 저장소 코드는 `src/db/`의 현재 분리를 따른다. 라우트 테스트는 `buildApp`에 테스트용 저장소를 주입해 실제 DB 없이 실행한다.
- 요청과 응답의 타입 및 스키마는 `@innova/contracts`를 기준으로 한다. 엔드포인트를 바꾸면 공유 계약, `@innova/web` 사용처, 관련 테스트를 함께 확인한다.
- 인증·권한은 매 요청의 DB 사용자 상태와 `src/auth.ts` 가드로 판정한다. JWT의 사용자 ID만으로 승인 상태나 관리자 권한을 추정하지 않는다. 승인 상태와 역할은 별개다: pending 관리자도 사용자 관리는 가능하지만 Exam 접근은 approved만 허용하고, rejected 계정은 둘 다 차단한다.
- 가입 승인·거절은 저장소에서 pending 조건으로 원자적으로 갱신한다. 이미 approved인 계정의 재승인은 멱등적으로 허용하지만 rejected 계정을 승인 성공으로 반환하거나 암묵적으로 복구하지 않는다. 경쟁 요청의 상태 충돌은 공유 오류 계약으로 알린다.
- 인증된 API의 `Cache-Control: no-store`와 쿠키 기반 응답 분리를 유지한다. 프런트엔드 Query 캐시 정책은 서버 권한 검사나 HTTP 캐시 정책을 대체하지 않는다.
- DB 스키마를 수정할 때는 `src/db/schema.ts`와 생성된 `drizzle/` 마이그레이션을 함께 반영한다. `pnpm --filter @innova/api db:generate`로 마이그레이션을 만들고 내용을 검토한다. `db:migrate`는 연결 대상 DB를 확인한 뒤 실행한다.
- 이미 운영에 적용된 마이그레이션은 수정하거나 재생성하지 않고 후속 마이그레이션을 추가한다. 릴리스에서는 대상 브랜치 대비 신규 마이그레이션과 환경 설정의 변경 유무를 확인한다.
- `DATABASE_URL` 등 비밀 값은 `.env`에만 둔다. 필요한 변수의 이름과 예시 형식은 `.env.example`에 반영한다.
- `@innova/api` 변경 후 루트에서 `pnpm --filter @innova/api typecheck`, `pnpm --filter @innova/api test`, `pnpm --filter @innova/api build` 중 관련 검증을 실행한다. 공유 계약을 변경했다면 루트 공용 검증도 실행한다.

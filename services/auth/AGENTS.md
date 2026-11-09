# AI 에이전트 @innova/auth 지침

이 파일은 `services/auth/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다.

- Fastify 앱 구성은 `src/app.ts`, 라우트는 `src/routes/`, DB 연결과 저장소 코드는 `src/db/`의 분리를 따른다. 라우트 테스트는 `buildApp`에 테스트용 저장소를 주입해 실제 DB 없이 실행한다.
- 요청과 응답의 타입 및 스키마는 `@innova/contracts`를 기준으로 하며, 공통 오류·로거·쿠키/JWT 가드는 `@innova/auth-kit`을 사용한다.
- 인증·권한은 매 요청의 DB 사용자 상태와 `@innova/auth-kit`의 가드로 판정한다. JWT의 사용자 ID만으로 승인 상태나 관리자 권한을 추정하지 않는다. 승인 상태와 역할은 별개다: pending 관리자도 사용자 관리는 가능하지만 승인이 필요한 일반 리소스 접근은 approved만 허용하고, rejected 계정은 차단한다.
- 가입 승인·거절은 저장소에서 pending 조건으로 원자적으로 갱신한다. 이미 approved인 계정의 재승인은 멱등적으로 허용하지만 rejected 계정을 승인 성공으로 반환하거나 암묵적으로 복구하지 않는다. 경쟁 요청의 상태 충돌은 공유 오류 계약으로 알린다.
- **전환기 레거시 동기화 (Dual-Write)**: `LEGACY_DATABASE_URL`이 설정된 경우, `users` 생성·승인·거절 변경을 레거시 모놀리스 DB(`neondb.users`)에도 동일 `id`로 비동기 미러링하여 기존 Render API가 동일한 사용자 상태를 바라볼 수 있도록 한다. 미러링 실패 시 요청은 실패하지 않고 `auth.legacy_sync.failed` 로그를 남긴다.
- 인증된 API의 `Cache-Control: no-store`와 쿠키(`innova_auth`) 기반 응답 분리를 유지한다.
- DB 스키마·migration 변경은 `drizzle/` 마이그레이션 체인을 따른다. 작업 전 로컬 `services/auth/.env`의 `DATABASE_URL`이 대상 Neon 브랜치 Connection string인지 확인하며 비밀 값 자체를 요청·출력하지 않는다.
- `DATABASE_URL`, `LEGACY_DATABASE_URL`, `JWT_SECRET` 등 비밀 값은 `.env`에만 둔다. 필요한 변수의 이름과 예시 형식은 `.env.example`에 반영한다.
- `services/auth` 변경 후 루트에서 `pnpm --filter @innova/auth typecheck`, `pnpm --filter @innova/auth test`, `pnpm --filter @innova/auth lint`를 실행한다.

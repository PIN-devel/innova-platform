# AI 에이전트 @innova/auth 지침

이 파일은 `services/auth/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다.

- Fastify 앱 구성은 `src/app.ts`, 라우트는 `src/routes/`, DB 연결과 저장소 코드는 `src/db/`의 분리를 따른다. 라우트 테스트는 `buildApp`에 테스트용 저장소를 주입해 실제 DB 없이 실행한다.
- 요청과 응답의 타입 및 스키마는 `@innova/contracts`를 기준으로 하며, 공통 오류·로거·쿠키/JWT 가드는 `@innova/auth-kit`을 사용한다.
- 인증·권한은 매 요청의 DB 사용자 상태와 `@innova/auth-kit`의 가드로 판정한다. JWT의 사용자 ID만으로 승인 상태나 관리자 권한을 추정하지 않는다. 승인 상태와 역할은 별개다: pending 관리자도 사용자 관리는 가능하지만 승인이 필요한 일반 리소스 접근은 approved만 허용하고, rejected 계정은 차단한다.
- 가입 승인·거절은 저장소에서 pending 조건으로 원자적으로 갱신하며, `@innova/auth-kit`의 `DistributedLock`(`lock:auth:user-status:<userId>`)으로 동일 사용자 상태 전이의 동시성을 제어한다(충돌 시 `409 CONFLICT`). 성공적인 상태 변경 시 `auth:user:<userId>` 캐시를 무효화하고 `EventPublisher`로 `auth.user.status-changed` 도메인 이벤트를 발행한다(발행 실패는 로깅만 수행하고 승인/거절 트랜잭션을 롤백하지 않는다). 이미 approved인 계정의 재승인은 멱등적으로 허용하지만 rejected 계정을 승인 성공으로 반환하거나 암묵적으로 복구하지 않는다.
- **단일 진실 공급원 (Single Source of Truth)**: `innova_auth` 전용 데이터베이스의 `users` 테이블을 단독 소유하며, 전환기 레거시 동기화(Dual-Write)는 PIN-78에서 완전히 종료되었다.
- 인증된 API의 `Cache-Control: no-store`와 쿠키(`innova_auth`) 기반 응답 분리를 유지한다.
- DB 스키마·migration 변경은 `drizzle/` 마이그레이션 체인을 따른다. 작업 전 로컬 `services/auth/.env`의 `DATABASE_URL`이 검증용 Neon dev 브랜치 Connection string인지 확인해야 하며, **운영(`production`) 자격증명을 조회·취득·저장하거나 터미널 명령어·스크립트에 인라인으로 노출하는 행위를 엄격히 금지한다**. 운영 DB 마이그레이션은 오직 GitHub Actions CI/CD 파이프라인을 통해서만 실행한다.
- `DATABASE_URL`, `JWT_SECRET` 등 비밀 값은 로컬 검증용 `.env`에만 둔다. 필요한 변수의 이름과 예시 형식은 `.env.example`에 반영하며 실제 비밀 값을 대화, 로그, PR, 이슈에 복제하지 않는다.
- `services/auth` 변경 후 루트에서 `pnpm --filter @innova/auth typecheck`, `pnpm --filter @innova/auth test`, `pnpm --filter @innova/auth lint`를 실행한다.

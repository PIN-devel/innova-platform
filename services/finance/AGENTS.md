# AI 에이전트 @innova/finance 지침

이 파일은 `services/finance/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다. 금융 도메인 설계·암호·개인정보 기준은 `apps/api/docs/finance-*.md`와 `personal-finance-architecture.md`를 따른다(문서 위치는 분리 전 기준이며 이 서비스에도 동일하게 적용한다).

- Fastify 앱 구성은 `src/app.ts`, 라우트는 `src/routes/`, DB 연결과 저장소 코드는 `src/db/`의 분리를 따른다. 라우트 테스트는 `buildApp`에 테스트용 `userLookup`과 저장소를 주입해 실제 DB 없이 실행한다.
- 요청과 응답의 타입 및 스키마는 `@innova/contracts`를 기준으로 하며, 공통 오류·로거·쿠키/JWT 가드는 `@innova/auth-kit`을 사용한다.
- 이 서비스는 **Database-per-Service 원칙**에 따라 `innova_finance` DB의 `finance_*` 테이블만 소유하며, **`innova_auth` 등 타 서비스의 DB에 절대 직접 접속하지 않는다**. `owner_id`는 Auth 서비스가 소유한 사용자 ID이며 DB 외래키·`users` 조인·`FOR SHARE` 잠금을 만들지 않는다. 소유자 단위 직렬화는 `finance_business_scopes` / `finance_pdf_secrets`의 revision CAS로 한다.
- 승인 상태 확인(`GET /api/auth/me`)과 PDF 암호 저장·재사용 시의 계정 비밀번호 재인증(`POST /api/auth/login`)은 매 요청 `UserLookup`(`src/db/users.ts`)을 통해 Auth 서비스 HTTP API(`AUTH_SERVICE_URL`)로 판정하며 JWT 클레임만으로 추정하지 않는다. 타 서비스 DB의 상태 변경이 필요한 경우에도 소유 서비스의 API를 호출하고 보상 트랜잭션(망취소)으로 보호한다.
- 승인 철회는 요청 진입 시 검사한다. 이미 진입한 쓰기 요청과의 경합은 DB가 막지 않는다(분리 전 `FOR SHARE` 보호는 제거됨).
- 암호화 키(`FINANCE_RAW_ENCRYPTION_KEY`, `FINANCE_PDF_PASSWORD_KEYRING`)는 이 서비스에만 주입한다. Raw/JWT 키 재사용을 금지하며 비밀 값은 `.env`와 배포 Secrets에만 둔다. 변수 이름과 예시 형식은 `.env.example`에 반영한다.
- 금융 응답의 `Cache-Control: no-store`, `X-Expected-User`/Origin/`X-Finance-Request` 검사와 쿠키(`innova_auth`) 기반 응답 분리를 유지한다.
- DB 스키마·migration 변경은 `drizzle/` 마이그레이션 체인을 따르고 [DB 변경 지침](../../apps/api/docs/database-migrations.md)의 기록 양식을 사용한다. 이미 적용한 migration은 수정하지 않는다. 작업 전 로컬 `services/finance/.env`의 `DATABASE_URL`이 검증용 Neon dev 브랜치 Connection string인지 사용자가 확인해야 하며, **운영(`production`) 자격증명을 조회·취득·저장하거나 터미널 명령어·스크립트에 인라인으로 노출하는 행위를 엄격히 금지한다**. 운영 DB 마이그레이션은 오직 GitHub Actions CI/CD 파이프라인을 통해서만 실행한다.
- `services/finance` 변경 후 루트에서 `pnpm --filter @innova/finance typecheck`, `pnpm --filter @innova/finance test`, `pnpm --filter @innova/finance lint`를 실행한다.

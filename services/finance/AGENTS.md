# AI 에이전트 @innova/finance 지침

이 파일은 `services/finance/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다. 금융 도메인 설계·암호·개인정보 기준은 `services/finance/docs/finance-*.md`와 `personal-finance-architecture.md`, 컴포넌트 카탈로그는 [@innova/finance](https://app.notion.com/p/42369ba4b33081d58ee5ea9862c01667?pvs=204)를 따른다.

- Fastify 앱 구성은 `src/app.ts`, 라우트는 `src/routes/`, DB 연결과 저장소 코드는 `src/db/`의 분리를 따른다. 라우트 테스트는 `buildApp`에 테스트용 `userLookup`과 저장소를 주입해 실제 DB 없이 실행한다.
- 요청과 응답의 타입 및 스키마는 `@innova/contracts`를 기준으로 하며, 공통 오류·로거·쿠키/JWT 가드는 `@innova/auth-kit`을 사용한다.
- 이 서비스는 **Database-per-Service 원칙**에 따라 `innova_finance` DB의 `finance_*` 테이블만 소유하며, **`innova_auth` 등 타 서비스의 DB에 절대 직접 접속하지 않는다**. `owner_id`는 Auth 서비스가 소유한 사용자 ID이며 DB 외래키·`users` 조인·`FOR SHARE` 잠금을 만들지 않는다. 소유자 단위 직렬화는 `finance_business_scopes` / `finance_pdf_secrets`의 revision CAS로 한다.
- 승인 상태 확인(`GET /api/auth/me`)은 `createCachedUserLookup`(`CacheStore` Fail-Open)과 `AUTH_SERVICE_URL`을 통해 판정하고, PDF 암호 재인증(`POST /api/auth/login`) 및 고위험 경로의 원본 조회는 캐시를 우회하여 Auth 서비스 HTTP API를 직접 호출한다(`GCP_IAM_AUTH_ENABLED=true` 또는 Cloud Run `K_SERVICE` + HTTPS일 때 GCP OIDC ID 토큰 `X-Serverless-Authorization` 자동 첨부). JWT 클레임만으로 승인 상태를 추정하지 않으며 타 서비스 DB 상태 변경이 필요한 경우 소유 서비스 API와 보상 트랜잭션(망취소)을 사용한다.
- `POST /internal/events/user-status` 및 `/dlq`(`src/routes/internal-events.ts`)는 APISIX에 노출하지 않는 내부 Pub/Sub Push 웹훅이며, `INTERNAL_EVENT_TOKEN` 검증·`eventId` 멱등성 가드 후 `auth:user:<userId>` 캐시를 무효화하고 `currentStatus === "rejected"`일 때 미소비 PDF 재인증 시도(`consumed_at IS NULL`)를 즉시 폐기한다.
- 승인 철회는 요청 진입 시 검사한다. 이미 진입한 쓰기 요청과의 경합은 DB가 막지 않는다(분리 전 `FOR SHARE` 보호는 제거됨).
- 암호화 키(`FINANCE_RAW_ENCRYPTION_KEY`, `FINANCE_PDF_PASSWORD_KEYRING`)는 이 서비스에만 주입한다. Raw/JWT 키 재사용을 금지하며 비밀 값은 `.env`와 배포 Secrets에만 둔다. 변수 이름과 예시 형식은 `.env.example`에 반영한다.
- 금융 응답의 `Cache-Control: no-store`, `Vary: Cookie`, `X-Expected-User`/Origin/`X-Finance-Request` 검사 및 [개인 데이터 경계 기준](../../docs/personal-data-boundaries.md)의 소유권·오류·로그 보호를 유지한다.
- DB 스키마·migration은 `drizzle/` 체인과 [DB 변경·복구 지침](../../docs/database-migrations.md) 및 루트 `AGENTS.md`의 운영 자격증명 금지·CI/CD 마이그레이션 독점 원칙을 따른다(로컬 검증은 `services/finance/.env`의 dev 대상 확인 후 실행).
- `services/finance` 변경 후 루트에서 `pnpm --filter @innova/finance typecheck`, `pnpm --filter @innova/finance test`, `pnpm --filter @innova/finance lint`를 실행한다.

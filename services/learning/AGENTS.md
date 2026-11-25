# AI 에이전트 @innova/learning 지침

이 파일은 `services/learning/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다. 컴포넌트 카탈로그는 [@innova/learning](https://app.notion.com/p/42369ba4b33081308471c1fa5826fd44?pvs=204)에서 확인한다.

- Fastify 앱 구성은 `src/app.ts`, 라우트는 `src/routes/`, DB 연결과 저장소 코드는 `src/db/`의 분리를 따른다. 라우트 테스트는 `buildApp`에 테스트용 `userLookup`과 저장소를 주입해 실제 DB 없이 실행한다.
- 요청과 응답의 타입 및 스키마는 `@innova/contracts`를 기준으로 하며, 공통 오류·로거·쿠키/JWT 가드는 `@innova/auth-kit`을 사용한다.
- 이 서비스는 **Database-per-Service 원칙**에 따라 `innova_learning` DB의 12개 테이블(Exam 3개, Curriculum 9개)만 소유하며, **`innova_auth` 등 타 서비스의 DB에 절대 직접 접속하지 않는다**.
- 승인 상태 확인(`GET /api/auth/me`)은 `UserLookup`(`src/db/users.ts`)을 `@innova/auth-kit`의 `createCachedUserLookup`(`CacheStore` Fail-Open)로 감싸 Auth 서비스 HTTP API(`AUTH_SERVICE_URL`)를 호출하며, 시험 문제 은행 조회(`src/db/exam.ts`)도 `Cache-Aside`를 적용한다. `GCP_IAM_AUTH_ENABLED=true`(또는 Cloud Run `K_SERVICE` + HTTPS)일 때는 GCP 메타데이터 OIDC ID 토큰(`X-Serverless-Authorization`)을 자동 첨부한다. JWT 클레임만으로 승인 상태를 추정하지 않는다.
- `POST /internal/events/user-status` 및 `/dlq`(`src/routes/internal-events.ts`)는 APISIX에 노출하지 않는 내부 Pub/Sub Push 웹훅이며, `INTERNAL_EVENT_TOKEN` 검증과 `eventId` 멱등성 가드 후 `auth:user:<userId>` 캐시를 즉시 무효화한다.
- 비공개 GCS 에셋(`gs://innova-assets`)은 `createGcsCurriculumAssetReader`(`src/curriculum-assets.ts`)를 통해 서빙한다. GCP Cloud Run 메타데이터 서버 ADC 토큰 조회 및 인메모리 캐싱을 기본 지원하며, 장애 발생 시 원인이나 자격 증명을 로그나 클라이언트에 노출하지 않고 `503 INTERNAL_ERROR` (`Private asset storage is unavailable`)로 마스킹한다.
- 인증된 API의 `Cache-Control: no-store`와 쿠키(`innova_auth`) 기반 응답 분리를 유지한다.
- DB 스키마·migration은 `drizzle/` 체인과 [DB 변경·복구 지침](../../docs/database-migrations.md) 및 루트 `AGENTS.md`의 운영 자격증명 금지·CI/CD 마이그레이션 독점 원칙을 따른다(로컬 검증은 `services/learning/.env`의 dev 대상 확인 후 실행).
- `services/learning` 변경 후 루트에서 `pnpm --filter @innova/learning typecheck`, `pnpm --filter @innova/learning test`, `pnpm --filter @innova/learning lint`를 실행한다.

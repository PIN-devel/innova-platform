# @innova/finance

Innova 플랫폼의 개인 금융(MOTIFIN) 마이크로서비스입니다. Cloud Run(`innova-finance-api`)으로 배포되며 API Gateway(APISIX)가 `/api/finance/**` 트래픽을 전달합니다.

## 기술 스택
- **런타임**: Node.js (v24), Fastify 5
- **ORM / DB**: Drizzle ORM, Neon PostgreSQL (`innova_finance` 전용 데이터베이스, `finance_*` 16개 테이블)
- **보안**: AES-256-GCM 필드 암호화(`FINANCE_RAW_ENCRYPTION_KEY`), 계정 저장 PDF 암호 키링(`FINANCE_PDF_PASSWORD_KEYRING`)
- **공유 패키지**: `@innova/contracts`, `@innova/auth-kit`

## 엔드포인트
- `/api/finance/raw/**`: Raw 추출 필드 가져오기·조회
- `/api/finance/business/**`: 비즈니스 반영, 분류·분석·리뷰·자금 일정
- `/api/finance/transactions/**`: 수기 거래, 단건 삭제, XLSX 내보내기
- `/api/finance/pdf-password/**`: 선택 PDF 암호 저장·재사용·삭제
- `POST /internal/events/user-status`, `POST /internal/events/dlq`: (내부 전용, APISIX 비공개) 사용자 상태 변경 Push 수신, 캐시 무효화 및 거절 시 미소비 PDF 재인증 시도 폐기
- `GET /health`, `GET /api/health`, `GET /ready`, `GET /api/ready`

그 외 `/api/*` 경로는 `404 NOT_FOUND`를 반환합니다.

## 사용자 상태 조회 (Database-per-Service)
이 서비스는 `innova_auth` 데이터베이스에 직접 접속하지 않으며 `users` 외래키를 갖지 않습니다. 매 요청의 사용자 승인 상태(`GET /api/auth/me`)와 PDF 암호 재인증(`POST /api/auth/login`)은 `AUTH_SERVICE_URL`을 통해 Auth 마이크로서비스(`innova-auth-api`)의 HTTP API를 호출하여 검증합니다.

## 환경 변수
`.env.example`을 복사하여 `.env`를 생성합니다.
- `DATABASE_URL`: `innova_finance` 연결 문자열
- `AUTH_SERVICE_URL`: Auth 마이크로서비스(`innova-auth-api`) 기본 URL (예: 로컬 `http://127.0.0.1:3001`)
- `JWT_SECRET`: Auth 서비스와 동일한 값 (32자 이상)
- `FINANCE_RAW_ENCRYPTION_KEY`, `FINANCE_PDF_PASSWORD_KEYRING`, `FINANCE_PDF_PASSWORD_ACTIVE_KEY_VERSION`: 금융 전용 암호화 키
- `FINANCE_ALLOWED_ORIGINS`: 변경 요청을 허용할 정확한 Origin 목록(쉼표 구분, 와일드카드 금지)
- `AUTH_COOKIE_NAME`, `LOG_LEVEL`, `PORT`(기본 8080)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `AUTH_USER_CACHE_TTL_MS`: (선택) 서버리스 Redis 캐시 설정 (미설정 시 인메모리 폴백)
- `INTERNAL_EVENT_TOKEN`: (선택) `/internal/events/*` 웹훅 인증 토큰

## 스크립트
- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm test`: PGlite 기반 합성 데이터 테스트
- `pnpm typecheck`, `pnpm lint`
- `pnpm db:generate`, `pnpm db:migrate`

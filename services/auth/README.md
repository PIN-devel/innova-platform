# @innova/auth (Authentication & Identity Management Service)

Innova 플랫폼의 **인증 및 사용자·인가 관리(Identity & Access Management, IAM)** 마이크로서비스입니다.
Cloud Run(`innova-auth-api`)으로 배포되며, API Gateway(APISIX)를 통해 `/api/auth/**` 및 `/api/admin/**` 트래픽을 전담 처리합니다.
플랫폼 내 모든 타 도메인 마이크로서비스(`learning`, `finance`, `ai`)의 단일 진실 공급원(Identity Provider) 역할을 수행합니다.

## 핵심 도메인 책임
1. **인증 (Authentication)**: 회원가입, 로그인, 로그아웃, 세션 확인(`/api/auth/me`), JWT 발급 및 `innova_auth` 세션 쿠키 관리.
2. **사용자 관리 (User Management)**: Argon2 비밀번호 해싱, 사용자 계정 생성, 회원 생명주기 관리.
3. **인가 및 승인 관리 (Access & Approval Control)**: 관리자 승인 대기(`pending`), 승인(`approved`), 거절(`rejected`) 상태 전이 및 관리자 전용 사용자 관리 API(`/api/admin/**`).

## 기술 스택
- **런타임**: Node.js (v24), Fastify 5
- **보안/인증**: `@fastify/jwt`, `@fastify/cookie`, `argon2`
- **ORM / DB**: Drizzle ORM, Neon PostgreSQL (`innova_auth` 전용 데이터베이스)
- **공유 패키지**: `@innova/contracts` (Zod 스키마 계약), `@innova/auth-kit` (공통 인증 가드, Graceful Shutdown, 로거)

## 엔드포인트
- `POST /api/auth/signup`: 회원가입 (승인 대기 `pending` 상태로 생성)
- `POST /api/auth/login`: 로그인 (검증 성공 시 `innova_auth` HttpOnly 쿠키 발급)
- `GET /api/auth/me`: 현재 세션 사용자 정보 조회 (인증 필요)
- `POST /api/auth/logout`: 로그아웃 (세션 쿠키 무효화)
- `GET /api/admin/users/pending`: 가입 승인 대기 목록 조회 (관리자 전용)
- `POST /api/admin/users/:id/approve`: 가입 승인 (관리자 전용, 멱등성 보장)
- `POST /api/admin/users/:id/reject`: 가입 거절 (관리자 전용)
- `GET /health`, `GET /api/health`: 헬스체크
- `GET /ready`, `GET /api/ready`: 데이터베이스 준비성 체크

## 환경 변수
`.env.example`을 복사하여 `.env`를 생성합니다.
- `DATABASE_URL`: Neon PostgreSQL `innova_auth` 데이터베이스 연결 문자열
- `JWT_SECRET`: JWT 서명/검증 비밀키 (32자 이상)
- `PORT`: 서비스 포트 (기본값: 8080)
- `AUTH_COOKIE_NAME`: 세션 쿠키 이름 (기본값: `innova_auth`)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: (선택) 서버리스 Redis 캐시·분산 락 연동 (미설정 시 인메모리 폴백)
- `PUBSUB_PROJECT_ID`, `PUBSUB_USER_EVENTS_TOPIC`: (선택) Cloud Run 운영 환경에서 `auth.user.status-changed` 이벤트 발행용 Pub/Sub 토픽
- `EVENT_SUBSCRIBER_URLS`: (선택) 로컬 환경 HTTP Fan-out 대상 URL 목록 (쉼표 구분)
- `INTERNAL_EVENT_TOKEN`: (선택) 내부 Push 이벤트 웹훅(`x-internal-event-token`) 인증 토큰

## 스크립트
- `pnpm dev`: 개발 서버 기동 (`tsx watch`)
- `pnpm build`: TypeScript 컴파일
- `pnpm test`: 단위 테스트
- `pnpm typecheck`: 타입 체크
- `pnpm lint`: 코드 스타일 검사 (`oxlint`)
- `pnpm db:generate`: Drizzle 마이그레이션 생성
- `pnpm db:migrate`: Drizzle 마이그레이션 적용

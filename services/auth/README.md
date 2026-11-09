# @innova/auth

Innova 플랫폼의 인증 및 회원(가입 승인/거절) 마이크로서비스입니다. Cloud Run(`innova-auth-api`)으로 배포되며, API Gateway(APISIX)를 통해 `/api/auth/**` 및 `/api/admin/**` 트래픽을 처리합니다.

## 기술 스택
- **런타임**: Node.js (v24), Fastify 5
- **보안/인증**: `@fastify/jwt`, `@fastify/cookie`, `argon2`
- **ORM / DB**: Drizzle ORM, Neon PostgreSQL (`innova_auth` 전용 데이터베이스)
- **공유 패키지**: `@innova/contracts` (Zod 스키마 계약), `@innova/auth-kit` (공통 인증 가드, 오류, 로거)

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
- `LEGACY_DATABASE_URL`: (전환기 한정) 레거시 Render 백엔드가 참조하는 `neondb` 연결 문자열 (이중 쓰기 미러링)
- `JWT_SECRET`: JWT 서명/검증 비밀키 (32자 이상, Render 백엔드와 동일한 값 사용)
- `PORT`: 서비스 포트 (기본값: 8080)
- `AUTH_COOKIE_NAME`: 세션 쿠키 이름 (기본값: `innova_auth`)

## 스크립트
- `pnpm dev`: 개발 서버 기동 (`tsx watch`)
- `pnpm build`: TypeScript 컴파일
- `pnpm test`: 단위 및 저장소 미러링 테스트
- `pnpm typecheck`: 타입 체크
- `pnpm lint`: 코드 스타일 검사 (`oxlint`)
- `pnpm db:generate`: Drizzle 마이그레이션 생성
- `pnpm db:migrate`: Drizzle 마이그레이션 적용

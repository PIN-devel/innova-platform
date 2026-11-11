# @innova/learning

Innova 플랫폼의 학습(Exam Drill 및 Curriculum) 마이크로서비스입니다. Cloud Run(`innova-learning-api`)으로 배포되며 API Gateway(APISIX)가 `/api/exam/**`, `/api/curriculum/**` 트래픽을 전달합니다.

## 기술 스택
- **런타임**: Node.js (v24), Fastify 5
- **ORM / DB**: Drizzle ORM, Neon PostgreSQL (`innova_learning` 전용 데이터베이스, Exam 3개 + Curriculum 9개 테이블)
- **에셋 스토리지**: Google Cloud Storage (`gs://innova-assets`, Cloud Run Metadata Server ADC 토큰 조회 기반 무키 서빙)
- **공유 패키지**: `@innova/contracts`, `@innova/auth-kit`

## 엔드포인트
- `/api/exam/**`: 시험 문제 은행 조회 (`GET /banks/default`, `GET /banks/:id`), 커스텀 문제 은행 등록 (`POST /banks`)
- `/api/curriculum/**`: 커리큘럼 과목·단원·문제 조회, 정답 채점 (`POST /subjects/:subjectId/chapters/:chapterId/questions/:questionId/grade`), 비공개 에셋 이미지 서빙 (`GET /subjects/:subjectId/chapters/:chapterId/blocks/:blockId/assets/:index`)
- `GET /health`, `GET /api/health`, `GET /ready`, `GET /api/ready`

그 외 `/api/*` 경로는 `404 NOT_FOUND`를 반환합니다.

## 사용자 상태 조회 (Database-per-Service)
이 서비스는 `innova_auth` 데이터베이스에 직접 접속하지 않으며 `users` 테이블 또는 외래키를 갖지 않습니다. 매 요청의 사용자 존재 및 승인 상태(`approvalStatus === 'approved'`)는 `AUTH_SERVICE_URL`을 통해 Auth 마이크로서비스(`innova-auth-api`)의 HTTP API(`GET /api/auth/me`)를 호출하여 검증합니다.

## GCS 비공개 에셋 서빙 (Keyless ADC)
Curriculum 삽화/다이어그램 에셋은 비공개 GCS 버킷(`gs://innova-assets`)에 보관되어 있으며, Cloud Run 실행 환경의 메타데이터 서버(`http://metadata.google.internal/...`)에서 단기 OAuth2 Bearer 토큰을 동적으로 조회·인메모리 캐싱하여 서빙합니다. 장애 또는 네트워크 단절 시 내부 세부 정보를 마스킹하고 `503 INTERNAL_ERROR` (`Private asset storage is unavailable`)를 반환합니다.

## 환경 변수
`.env.example`을 복사하여 `.env`를 생성합니다.
- `DATABASE_URL`: `innova_learning` 연결 문자열
- `AUTH_SERVICE_URL`: Auth 마이크로서비스(`innova-auth-api`) 기본 URL (예: 로컬 `http://127.0.0.1:3001`)
- `JWT_SECRET`: Auth 서비스와 동일한 값 (32자 이상)
- `CURRICULUM_ASSET_BUCKET`: GCS 버킷명 (기본: `innova-assets`)
- `CURRICULUM_ASSET_ROOT`: (선택) 로컬 파일시스템 에셋 디렉토리 경로
- `GCP_STORAGE_TOKEN`: (선택) 메타데이터 서버가 없는 환경을 위한 정적 Bearer 토큰
- `EXAM_BANK_SEED_PATH`: (선택) 시험 문제 은행 비공개 시드 파일 경로
- `AUTH_COOKIE_NAME`: 세션 쿠키명 (기본: `innova_auth`)
- `PORT`: 서비스 포트 (기본: 8080)

## 스크립트
- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm test`: PGlite 기반 합성 데이터 및 에셋 리더 테스트
- `pnpm typecheck`, `pnpm lint`
- `pnpm db:generate`, `pnpm db:migrate`
- `pnpm db:seed:exam`, `pnpm db:verify:exam`

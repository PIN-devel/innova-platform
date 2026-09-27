# API

Fastify, TypeScript, Drizzle ORM, Neon PostgreSQL API입니다. Exam Drill 은행을 DB에 저장합니다. 루트의 `pnpm dev` 또는 `pnpm dev:web`으로 API와 웹을 함께 실행합니다.

## 실행

```sh
pnpm install
pnpm --filter @innova/api db:migrate
pnpm --filter @innova/api db:verify:exam
pnpm dev
```

개발 환경의 기본 주소는 `http://127.0.0.1:3000`입니다. 운영 환경에서는 `HOST`를 지정하지 않으면 `0.0.0.0`에 바인딩하며, Render가 제공하는 `PORT`를 사용합니다. `HOST`와 `PORT` 환경 변수로 변경할 수 있습니다.
DB 연결은 `apps/api/.env`의 `DATABASE_URL`을 사용합니다. `JWT_SECRET`도 같은 파일에 32자 이상의 임의 문자열로 설정해야 API가 시작됩니다. 로그 수준은 `LOG_LEVEL`로 설정하며 기본값은 `info`입니다. 실제 `.env` 파일은 Git에서 제외됩니다. `/api/exam/*`는 로그인 후 발급된 HttpOnly 쿠키가 필요합니다. 응답은 `Cache-Control: no-store`입니다. 외부 배포에는 HTTPS가 필요합니다.

개념, 문제, 정답, 해설 JSON은 저장소에 포함하지 않습니다. 새 DB로 이관할 때만 Git 밖의 비공개 원본 파일을 지정하세요: `EXAM_BANK_SEED_PATH=/absolute/private/path.json pnpm --filter @innova/api db:seed:exam`. 기본 은행이 이미 있으면 `pnpm --filter @innova/api db:verify:exam`으로 형식과 개수를 확인할 수 있습니다. 원본 파일과 DB를 필드별로 비교해야 하는 경우에는 비공개 파일을 별도로 검사하세요.

테이블 정의는 `src/db/schema.ts`, 마이그레이션 파일은 `drizzle/`에 있습니다. 스키마를 변경한 뒤 아래 명령으로 새 마이그레이션을 만들고 적용합니다.

```sh
pnpm --filter @innova/api db:generate
pnpm --filter @innova/api db:migrate
```

```sh
pnpm build
pnpm --filter @innova/api start
pnpm test
pnpm typecheck
```

## 예시 요청

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/` | Fastify 기본 응답 |
| GET | `/health` | 프로세스 생존 상태 확인 |
| GET | `/ready` | DB 연결 준비 상태 확인 |
| POST | `/api/auth/signup` | 회원가입 및 자동 로그인 |
| POST | `/api/auth/login` | 로그인 |
| GET | `/api/auth/me` | 현재 사용자 조회 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/exam/banks/default` | 기본 AWS SAP 은행 조회 |
| GET | `/api/exam/banks/:id` | 저장된 은행 조회 |
| POST | `/api/exam/banks` | 검증 후 새 은행 저장 |

```sh
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

`/health`는 DB 연결과 무관한 liveness 확인 경로입니다(Render Health Check Path로 사용할 수 있습니다). `/ready`는 Neon DB에 `SELECT 1`을 실행해 준비 상태를 확인하고, 실패 시 안전한 503 응답을 반환합니다. API 오류의 `X-Request-Id` 응답 헤더와 구조화된 stdout 로그의 `reqId`를 이용해 요청을 추적할 수 있습니다.

Fastify 공식 [Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/), [TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [Testing](https://fastify.dev/docs/latest/Guides/Testing/) 가이드를 참고했습니다.

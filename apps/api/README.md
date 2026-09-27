# API

Fastify, TypeScript, Drizzle ORM, Neon PostgreSQL로 만든 기본 API 예제입니다. `items`는 DB에 저장되며 처음에는 빈 목록입니다.
저장소 루트에서 `pnpm dev`를 실행하면 API와 프록시 모드 웹이 함께 시작되어 `/api/items` 요청을 이 API로 전달합니다. MSW만 사용하는 웹은 `pnpm dev:web`, API만 실행하려면 `pnpm dev:api`를 사용합니다.

## 실행

```sh
pnpm install
pnpm --filter api db:migrate
pnpm dev
```

기본 주소는 `http://127.0.0.1:3000`입니다. `HOST`와 `PORT` 환경 변수로 변경할 수 있습니다.
DB 연결은 `apps/api/.env`의 `DATABASE_URL`을 사용합니다. 새 환경에서는 `.env.example`을 복사하고 본인의 Neon 연결 문자열을 설정하세요. `.env`는 Git에서 제외됩니다.

테이블 정의는 `src/db/schema.ts`, 마이그레이션 파일은 `drizzle/`에 있습니다. 스키마를 변경한 뒤 아래 명령으로 새 마이그레이션을 만들고 적용합니다.

```sh
pnpm --filter api db:generate
pnpm --filter api db:migrate
```

```sh
pnpm build
pnpm --filter api start
pnpm test
pnpm typecheck
```

## 예시 요청

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/` | Fastify 기본 응답 |
| GET | `/health` | 상태 확인 |
| GET | `/api/items` | 목록 조회 |
| GET | `/api/items/:id` | 단건 조회 |
| POST | `/api/items` | 생성 (`{ "name": "Ruler" }`) |
| PUT | `/api/items/:id` | 수정 (`{ "name": "Pencil" }`) |
| DELETE | `/api/items/:id` | 삭제 |

```sh
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/items
curl -X POST http://127.0.0.1:3000/api/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ruler"}'
```

Fastify 공식 [Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/), [TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [Testing](https://fastify.dev/docs/latest/Guides/Testing/) 가이드를 참고했습니다.

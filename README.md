# innova-platform

React, Fastify, Apache APISIX, Neon PostgreSQL 기반의 서버리스 마이크로서비스(MSA) 모노레포입니다.
Google Cloud Run 및 Firebase Hosting 기반으로 운영되며, 벤더 락인을 차단하는 독립 인프라 탈출 패키지(`docker-compose.yml`)를 갖추고 있습니다.

## 아키텍처 구성

```
[Client (Browser)]
       │
       ├── 정적 자산 ──► [Firebase Hosting] (apps/web)
       │
       └── /api/** (VITE_API_BASE_URL)
              ▼
[Cloud Run API Gateway] (apps/api-gateway - Apache APISIX Standalone, OIDC ID Token 주입)
       │ (Zero Trust IAM: --no-allow-unauthenticated, roles/run.invoker)
       ├── /api/auth/**, /api/admin/**  ──► [innova-auth-api]     (services/auth)     ──► DB: innova_auth
       ├── /api/exam/**, /api/curriculum/** ──► [innova-learning-api] (services/learning) ──► DB: innova_learning, GCS: innova-assets
       ├── /api/finance/**             ──► [innova-finance-api]  (services/finance)  ──► DB: innova_finance
       └── /api/ai/**                  ──► [innova-ai-api]       (services/ai)       ──► Exaone API
```

| 구분 | 패키지/디렉터리 | 역할 및 배포 환경 |
| --- | --- | --- |
| **Frontend** | `apps/web` (`@innova/web`) | React 19, Vite, TanStack Query, FSD 아키텍처 (Firebase Hosting) |
| **API Gateway** | `apps/api-gateway` | Apache APISIX 3.19 Standalone, 쿠키 브릿지·CORS·업스트림 OIDC ID 토큰 주입 (Cloud Run) |
| **Auth** | `services/auth` (`@innova/auth`) | 인증, 회원 관리, 인가/승인 단일 진실 공급원 (Cloud Run) |
| **Learning** | `services/learning` (`@innova/learning`) | Exam Drill 문항 은행 및 Curriculum 에셋 무키 서빙 (Cloud Run) |
| **Finance** | `services/finance` (`@innova/finance`) | 개인 금융(MOTIFIN) 원천 데이터 암호화 및 분석 (Cloud Run) |
| **AI** | `services/ai` (`@innova/ai`) | K-EXAONE 2.5 기반 AI 챗 스트리밍 (Cloud Run) |
| **공유 계약** | `packages/contracts` (`@innova/contracts`) | 프런트엔드·백엔드 공유 Zod 스키마 및 타입 인터페이스 |
| **공통 킷** | `packages/auth-kit` (`@innova/auth-kit`) | Fastify 공통 가드, 서버리스 캐시·분산 락·Push 이벤트 추상화, Graceful Shutdown, 구조화 로거, 에러 핸들러 |

---

## 문서와 작업 기준

| 목적 | 문서 |
| --- | --- |
| AI 공통·앱별 지침 | [공통 AGENTS](./AGENTS.md), [Web AGENTS](./apps/web/AGENTS.md), [Gateway AGENTS](./apps/api-gateway/AGENTS.md), [Auth AGENTS](./services/auth/AGENTS.md), [Learning AGENTS](./services/learning/AGENTS.md), [Finance AGENTS](./services/finance/AGENTS.md), [AI AGENTS](./services/ai/AGENTS.md) |
| 서비스 카탈로그·제품/기능 스펙·리포트 | [Innova Platform Notion 허브](https://app.notion.com/p/42369ba4b33081fca91cf9d63f44208e?pvs=204) (`Products` · `Components` · `Knowledge`) |
| 문서 위치·원천·정량 채점 기준 | [문서 정책](./docs/documentation-policy.md) |
| 필요한 정보만 읽고 조사·검증·전달하기 | [AI 작업 흐름](./docs/ai-workflow.md) |
| 브랜치·PR·릴리스 | [Git 운영](./docs/git-workflow.md) |
| Label·Milestone·Issue 역할, 개선 Inbox, 상태 자동화 | [Linear 운영](./docs/linear-workflow.md) |
| DB 스키마 변경·신규 테이블 메타·복구 준비 | [DB 스키마 변경과 복구 지침](./docs/database-migrations.md) |
| 백업·복원, RPO/RTO, 도메인별 격리 복구 기준 | [백업·복원 및 도메인별 복구 기준](./docs/backup-and-recovery.md) |
| 개인 데이터 도메인의 접근·세션·보존 경계 및 검증 행렬 | [개인 데이터 경계 기준](./docs/personal-data-boundaries.md) |
| 아키텍처 결정 기록(ADR)과 변경 맥락 | `docs/adr/` ([ADR-0001](./docs/adr/0001-record-architecture-decisions.md) 체계 준수) |
| 앱/서비스 실행과 현행 기준 | [Web](./apps/web/README.md), [Auth](./services/auth/README.md), [Learning](./services/learning/README.md), [Finance](./services/finance/README.md), [AI](./services/ai/README.md) |

---

## 로컬 개발 및 실행

pnpm 12를 사용합니다. 저장소 루트에서 한 번만 의존성을 설치합니다.

```sh
pnpm install
```

### 1) 웹 프론트엔드 단독 개발 (MSW Mock 모드)
백엔드 서버 없이 브라우저에서 모의 데이터로 전체 UI를 실행합니다:
```sh
pnpm dev:web
# http://localhost:5173
```

### 2) 클라우드 탈출 전체 스택 실행 (Docker Compose)
타 클라우드, 온프레미스, 또는 로컬 환경에서 4대 마이크로서비스와 API Gateway 전체를 단일 네트워크로 구동합니다:
```sh
# .env 파일에 DB Connection string 및 JWT_SECRET 등을 설정한 후
pnpm docker:up
# 최초 이미지 빌드 포함 시: docker compose up --build -d

# API Gateway 진입점: http://localhost:8080/health
# 종료: pnpm docker:down
```

### 3) 개별 마이크로서비스 단독 개발
독립 서비스 단위로 개발 서버를 기동합니다:
```sh
pnpm dev:auth      # 포트 8080 (또는 PORT 설정값)
pnpm dev:learning  # 포트 8080
pnpm dev:finance   # 포트 8080
pnpm dev:ai        # 포트 8080
```

---

## 공통 검증 파이프라인

```sh
pnpm build        # 공유 계약/킷 빌드 후 전체 패키지 빌드
pnpm typecheck    # 전체 패키지 TypeScript 타입 검사
pnpm test         # 전체 단위 및 통합 테스트 실행
pnpm lint         # Oxlint 기반 정적 분석
```

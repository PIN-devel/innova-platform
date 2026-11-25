# Web

React 웹 앱이다. 명령은 저장소 루트에서 실행한다.

- `pnpm dev:web` (또는 `pnpm dev`): API 없이 MSW 모드, `http://localhost:5173`.
- 로컬 백엔드 연동: `pnpm docker:up`으로 API Gateway(`http://localhost:8080`) 및 마이크로서비스 스택을 기동한 뒤 `VITE_API_BASE_URL=http://localhost:8080/api pnpm dev:web`(또는 개별 서비스 기동 시 `pnpm --filter @innova/web dev:api`, `http://localhost:5174`)로 연결한다.

MOTIFIN은 `/motifin/review`에서 시작한다. `pnpm dev:web`은 합성 MSW를, 로컬 백엔드 연동(`docker-compose.yml` 또는 개별 서비스)은 실제 API를 사용한다. 승인된 디자인의 실제 적용 경로와 시안 코드 제거 기록은 [디자인 결정·제품 적용](./docs/motifin-wireframe.md)을 참고한다.

설치·계약 빌드·공통 검증과 전체 스택(`docker-compose.yml`) 실행은 [루트 README](../../README.md)를 따른다. 백엔드 서비스별 환경 설정은 [Auth](../../services/auth/README.md), [Learning](../../services/learning/README.md), [Finance](../../services/finance/README.md), [AI](../../services/ai/README.md) README와 각 서비스 및 `apps/api-gateway`의 `.env.example`을 참고한다.

| 필요한 작업 | 기준 |
| --- | --- |
| 서비스 카탈로그·제품/기능 스펙 | [@innova/web (Notion)](https://app.notion.com/p/42369ba4b330810496eeffc448ff9ec0?pvs=204) · [Innova Platform 허브](https://app.notion.com/p/42369ba4b33081fca91cf9d63f44208e?pvs=204) |
| MOTIFIN 목적·브랜드·최신 범위와 구현 인수 | [제품 기준](./docs/motifin-product.md) |
| MOTIFIN 실제 파일 Raw 가져오기 | [적재 안내](../../services/finance/docs/finance-raw-ingestion.md) — 로컬 API 연동 → `/motifin/import` |
| Web 구현·검증 | [Web AGENTS](./AGENTS.md) |
| 구조·라우팅·데이터·세션 | [아키텍처](./docs/architecture.md) |
| UI·토큰·접근성 | [디자인](./docs/design.md) |
| 과거 측정 비교·QA 재현 | [과거 측정 기록](./docs/architecture-baseline.md) |

측정 기록의 수치는 현재 성능이나 이번 작업의 검증 결과로 재사용하지 않는다.

## 브라우저 E2E 재현 절차

합성 데이터만으로 주요 사용자 여정(인증/세션 복귀, 404 콘솔 경고 부재, MOTIFIN 핵심 흐름, 모바일 390px 44px 터치 영역)을 검증한다.

- **최초 1회 브라우저 설치:** `pnpm --filter @innova/web e2e:install`
- **기본 실행(MSW 모드, 전용 포트 `5175`):** `pnpm test:e2e`
- **외부/로컬 API 서버 대상 전환 실행:**
  `E2E_BASE_URL=http://localhost:5174 E2E_USER_EMAIL=<이메일> E2E_USER_PASSWORD=<비밀번호> pnpm test:e2e`
  *(운영 DB나 운영 자격증명은 사용하지 않으며, `E2E_BASE_URL` 지정 시 `E2E_USER_EMAIL`·`E2E_USER_PASSWORD` 환경변수가 필수다.)*
- **합성 금융 파일 캐시 및 산출물 관리:**
  - `apps/web/test/e2e/.fixtures/`(로컬 재사용 캐시), `apps/web/test-results/`, `apps/web/playwright-report/`는 `.gitignore`로 관리된다.
  - 로컬 캐시 강제 재생성: `pnpm --filter @innova/web e2e:fixtures --force`
  - 로컬 캐시 및 실패 산출물 정리: `pnpm --filter @innova/web e2e:clean` (이후 `pnpm test:e2e` 재실행 시 자동 생성된다.)

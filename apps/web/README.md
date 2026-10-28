# Web

React 웹 앱이다. 명령은 저장소 루트에서 실행한다.

- `pnpm dev:web`: API 없이 MSW 모드, `http://localhost:5173`.
- `pnpm dev`: API와 프록시 모드 웹을 함께 실행, `http://localhost:5174`.

MOTIFIN은 `/motifin/review`에서 시작한다. `pnpm dev`는 로컬 API를, `pnpm dev:web`는 합성 MSW를 사용한다. 승인된 디자인의 실제 적용 경로와 시안 코드 제거 기록은 [디자인 결정·제품 적용](./docs/motifin-wireframe.md)을 참고한다.

설치·계약 빌드·공통 검증은 [루트 README](../../README.md)를 따른다. API 연결 환경 설정은 [API README](../api/README.md)와 해당 앱의 `.env.example`을 참고한다.

| 필요한 작업 | 기준 |
| --- | --- |
| MOTIFIN 목적·브랜드·최신 범위와 구현 인수 | [제품 기준](./docs/motifin-product.md) |
| MOTIFIN 실제 파일 Raw 가져오기 | [적재 안내](../api/docs/finance-raw-ingestion.md) — `pnpm dev` → `/motifin/import` |
| Web 구현·검증 | [Web AGENTS](./AGENTS.md) |
| 구조·라우팅·데이터·세션 | [아키텍처](./docs/architecture.md) |
| UI·토큰·접근성 | [디자인](./docs/design.md) |
| 과거 측정 비교·QA 재현 | [과거 측정 기록](./docs/architecture-baseline.md) |

측정 기록의 수치는 현재 성능이나 이번 작업의 검증 결과로 재사용하지 않는다.

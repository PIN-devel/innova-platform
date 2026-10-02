# Web

React 웹 앱이다. 명령은 저장소 루트에서 실행한다.

- `pnpm dev:web`: API 없이 MSW 모드, `http://localhost:5173`.
- `pnpm dev`: API와 프록시 모드 웹을 함께 실행, `http://localhost:5174`.

설치·계약 빌드·공통 검증은 [루트 README](../../README.md)를 따른다. 실제 환경 값은 .env.example을 참고한다.

| 필요한 작업 | 기준 |
| --- | --- |
| Web 구현·검증 | [Web AGENTS](./AGENTS.md) |
| 구조·라우팅·데이터·세션 | [아키텍처](./docs/architecture.md) |
| UI·토큰·접근성 | [디자인](./docs/design.md) |
| 과거 측정 비교·QA 재현 | [과거 측정 기록](./docs/architecture-baseline.md) |

측정 기록의 수치는 현재 성능이나 이번 작업의 검증 결과로 재사용하지 않는다.

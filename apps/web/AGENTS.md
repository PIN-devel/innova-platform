# Codex @innova/web 지침

루트 `AGENTS.md`에 추가로 적용한다. 구현 경로는 `apps/web/src/`, 테스트·설정 경로는 `apps/web/` 기준이다.

- 구조·라우팅·데이터·세션 변경은 [아키텍처](docs/architecture.md)의 관련 절을 읽고 구현과 함께 갱신한다. UI 변경은 [디자인](docs/design.md)을 따른다. 과거 측정 기록은 비교·재현할 때만 읽는다.
- `app → pages → features → entities → shared` 방향을 유지한다. app은 composition·Provider·layout·global lifecycle, `pages/<route>/route.ts`는 route adapter, features는 command, entities는 query/API를 소유한다. 구현·타입 모두 역방향 import를 금지하며 중앙 app 파일에 route-specific 동작을 누적하지 않는다.
- Router가 route-linked 조회·변경·재검증을 조정하고 단일 QueryClient가 server-state를 소유한다. 도메인 query key/options를 재사용하고 generic Router × Query helper는 `shared/lib/router-query/`에 둔다. 도메인별 invalidation 대상은 page/feature가 정한다.
- 변경 성공은 확정 결과를 먼저 cache에 반영한다. 재조회 실패로 완료 항목을 되살리지 않는다. freshness는 데이터별로 정하고 인증·관리자 데이터에 장기 캐시를 일괄 적용하지 않는다.
- 인증 경계의 session epoch·보호 cache 제거·GET signal 전달·비동기 command의 이전 세션 결과 격리를 유지한다. 계정·권한 변경과 만료 시 보호 UI/cache/local 세션을 격리하고 문항 본문·정답은 영구 저장하지 않는다.
- 공통 Shell·탐색·단일 main은 RootLayout/content layout이 소유한다. 기능·오류·로딩 화면에서 Shell을 복제하지 않는다. 최초 Skeleton, 기존 데이터의 보조 재조회 상태, 일반 오류 재시도와 인증·권한 오류의 보호 콘텐츠 제거를 유지한다.
- HTTP는 `shared/api/client.ts`, 계약은 `@innova/contracts`를 사용한다. API 변경 시 MSW도 접근 제어·상태 전이·오류를 동일하게 재현하고 양쪽 회귀를 확인한다.
- React symbol은 PascalCase, 파일은 kebab-case를 사용한다. 단일 hook은 `use-*.ts(x)`, 관련 hook 묶음은 `hooks.ts`를 허용한다. shadcn 생성 파일은 도구 규칙을 유지한다.
- Web 검증은 루트 기준에서 범위에 맞게 선택한다. Oxlint가 layer 방향과 cycle을 검사한다. lint 구성·버전 변경은 실제 lint와 `test/fsd-lint.test.mjs`를 함께 검증한다. slice public API나 모든 cross-slice 제한을 선제 도입하지 않는다.

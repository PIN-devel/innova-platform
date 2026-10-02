# Frontend Data Architecture

상태: 현행 구현 기준. 설정·테스트 경로는 `apps/web/`, `app/pages/features/entities/shared` 구현 경로는 `apps/web/src/` 기준이다.

PIN-20의 데이터 흐름과 PIN-29의 책임 배치 기준이다. UI는 [디자인 기준](./design.md)을 따른다. 과거 수치와 QA 재현이 필요할 때만 [측정 기록](./architecture-baseline.md)을 읽는다. Data Mode와 단일 Query Cache를 유지한다.

- PIN-20 시작 기준: `develop` `f7f259ca61dc16a2a22206f116b74d490f6b55e6`. 당시 원격 main과 이력은 달랐지만 tree는 같았다.
- PIN-29 시작 기준: 최신 `develop` `13eaea6057c7f1fb8cdf4960ebec1f5c4e3cd62d`(Curriculum 기반 PR #28 포함). Web에서 발견한 역방향 app import는 6개 파일의 9개였고, 중앙 route-data와 전역 key refresh helper를 제거했다.
- PIN-20~26은 PR #24로 develop에 통합됐다. PIN-29는 최신 develop의 코드에 대한 구조 후속 작업이며 데이터 흐름을 재설계하지 않는다.
- PIN-29 검증 당시 설치 버전: TanStack Query 5.103.2, React Router 8.4.0, React 19.3.0, Vite 8.3.1. 현재 버전은 lockfile을 확인하며 package.json의 최소 버전과 구분한다.

## 1. 현행 감사와 교체 결과

PIN-21 기준 Router는 createBrowserRouter/RouterProvider만 사용하고 loader/action/lazy는 없었다. Shell·guard·page의 staleTime 0 Hook이 순차 mount에서 중복 요청할 수 있었다. 관리자 변경은 useMutation, import는 page의 imperative POST였다. 선택 은행은 계정 공용 localStorage에 저장되었다.

| 경로 | 현재 진입과 변경 | 유지하는 UI/상태 |
| --- | --- | --- |
| `/`, `*` | root session middleware, public 콘텐츠 | Shell, 단일 main, 홈/404. me 오류가 public 콘텐츠를 차단하지 않음 |
| `/login`, `/signup` | public middleware, route Action/useFetcher, schema 검증, replace redirect | 입력·확인 비밀번호는 local, 필드/폼 오류 |
| `/logout` | fetcher.Form → auth Action | 서버 실패 메시지, 성공/이미 만료 시 login 이동 |
| `/approval-pending`, `/signup-rejected` | 상태별 middleware + live guard | 계정 정보, 문의, Router 상태 재확인 |
| `/admin/users` | admin middleware → Loader → Query 구독, 결정 Action/useFetcher | Skeleton, cache 유지·갱신 경고, 성공 항목 제거 |
| `/exam` | approved middleware → Loader → Query 구독, import/Quiz Action/useFetcher | 은행 또는 교재 Subject/Chapter/view는 URL, 학습·답변은 local |

PIN-8의 Shell/콘텐츠 layout 및 단일 main, PIN-9의 최초 Skeleton/기존 데이터 갱신/오류·빈 결과 구분, PIN-10의 entity query key/options와 성공 응답 우선 cache patch를 유지했다. 접근 검사와 재검증의 시작 책임은 Router로 옮겼고 기존 useMutation 실행 경로와 은행 localStorage 선택은 제거했다.

## 2. 책임과 파일 배치

| 영역 | 책임 |
| --- | --- |
| `app/router.tsx` | composition root: 주입된 단일 QueryClient, route tree, middleware·page adapter·lazy 연결 |
| `app/query-client.ts`, root layout | Provider/캐시 구성, 인증 변경 감지, 공통 Shell, focus/online lifecycle |
| `pages/auth/route.ts`, `pages/admin-users/route.ts`, `pages/exam/route.ts` | 해당 route의 loader/action, FormData·URL 입력, 접근 검사, command/query 호출, redirect/error |
| `features/auth/route-session.ts` | middleware 접근 snapshot/context와 순수 returnTo 검사 |
| auth session/commands, `features/start-lesson/model/import-bank.ts` 등 feature commands | epoch·전환/변경 잠금, 보호 cache 정리, domain parsing/merge, 성공 응답의 cache 반영 |
| `entities/*/queries.ts` | key, queryFn, freshness, GC/retry. 별도 변경 실행 경로 없음 |
| `entities/*/api.ts`, `shared/api/client.ts` | HTTP·credentials·signal·공통 오류/Contracts |
| page | 캐시 구독, fetcher, 사용자 입력, local 학습 상태 |
| `shared/lib/router-query/` | 도메인 비의존 QueryObserver bridge·Loader fallback·명시적 key invalidation → Router revalidation·generic ActionResult |
| API/Contracts | 최종 인증·인가 및 wire schema. 이번 작업에서 변경 없음 |

`createAppRouter(client)`와 `createAppRoutes(client)`에는 Provider와 같은 client를 전달한다. loader/action이 전역 client나 Hook을 사용하지 않는다. Loader 반환값은 null이며 User/목록/은행을 loaderData에 복사하지 않는다. middleware snapshot은 한 요청의 접근 판정용이며 두 번째 서버 캐시가 아니다.

기본 의존 방향은 `app → pages → features → entities → shared`다. 상위 layer가 하위 layer를 조합하며 하위 layer에서 상위 layer의 구현·타입을 import하지 않는다. 같은 layer의 slice 간 의존 제한과 public API/barrel 강제는 현재 범위에 포함하지 않는다. Auth form 결과 필드 타입은 `pages/auth/route.ts`의 `AuthActionResult`, 공통 error/code/ok 형식은 shared의 generic `ActionResult<Field>`가 소유한다. Logout feature는 page adapter를 import하지 않는다.

## 3. 조회·freshness·재검증

설치 소스와 공식 API를 확인해 신규 imperative 조회는 `queryClient.query(options)`를 사용한다. deprecated ensureQueryData/fetchQuery를 신규 코드에 사용하지 않는다. `'static'`은 invalidation도 무시할 수 있어 이 데이터에는 사용하지 않는다.

| 데이터 | freshness / GC | 조회 시작 |
| --- | --- | --- |
| auth/me | staleTime 0, 기본 GC | root middleware에서 실행별 확인; 401만 null로 해석 |
| admin pending | staleTime 0, 기본 GC | admin 접근 확인 뒤 Loader |
| exam bank | staleTime 5분, GC 30분 | approved 접근 확인 뒤 Loader; fresh면 GET 없음 |

보호 key는 `examBankKeys.detail(id, epoch)`, `adminUserKeys.pending(epoch)`이다. `meta.sessionVersion`으로 QueryCache의 이전 세션 오류도 격리한다. UI는 `useSessionScope()`의 현재 epoch와 같은 options로 구독한다.

UI 구독은 enabled false로 **조회 시작을 Router에 맡긴다**. 최초 조회·진입·재시도·focus/online을 포함해 Router만 재검증을 시작하므로 mount refetch나 Query 자동 focus refetch와 중복되지 않는다. root Shell의 focus/online listener는 보이는 문서에서 router.revalidate를 요청한다. 실패한 auth도 public 폼을 허용한다.

`shared/lib/router-query/route-query.ts`는 client.query를 기다리는 동안 enabled false QueryObserver를 유지한다. StrictMode/초기 fallback의 임시 UI observer가 마지막 구독을 해제해 Loader의 공유 GET을 취소하는 실제 브라우저 문제를 방지한다. 종료 시 반드시 해제하고 세션 제거로 detach된 Query의 GC timer도 정리한다. `loadRouteQuery`의 기존-data fallback은 같은 모듈에 있고, 세션 검사 callback은 page adapter가 전달한다. Shared는 auth/admin/exam key 또는 epoch 구현을 import하지 않는다.

- 최초/재진입: middleware auth → 접근 검사 → Loader → query freshness 판정. fresh Exam 재진입은 은행 GET 0, stale/명시적 invalidate는 1.
- Action 성공: 확정 patch → invalidate(refetchType none) → Router 자동 revalidation. Action에서 active refetch를 추가 실행하지 않는다.
- 수동 refresh/실패 retry: shared의 `useRouteRefresh(keys)`가 전달받은 key만 invalidate(none)한 뒤 Router revalidate를 기다린다. Exam page는 현재 bank/epoch, admin page는 현재 pending/epoch, 승인 상태 page와 인증 guard는 auth/me를 선택한다. Exam refresh가 admin cache를 무효화하지 않는다. root middleware의 auth/me는 staleTime 0이므로 모든 revalidation에서 접근 상태를 재확인한다.
- 기본 은행 이동: 대상 bank key를 invalidate(none)하고 URL로 이동한다.
- view 변경도 기본 Router revalidation을 유지한다. fresh bank는 추가 GET 없이 재사용하며, auth가 변경된 경우 새 epoch의 missing bank를 확실히 준비한다. view만 보고 shouldRevalidate false로 고정하면 세션 변경 시 조회가 누락될 수 있어 적용하지 않았다.

일반 네트워크/5xx 조회 실패는 같은 epoch/key의 기존 데이터가 있으면 Loader가 진입을 허용하고 Query의 error로 경고한다. missing data, 401/403/404, schema 오류는 이 fallback으로 다루지 않는다. 성공한 POST 뒤 GET 실패를 POST 실패로 변환하거나 rollback하지 않는다.

## 4. 취소와 세션 격리

Query signal은 HTTP GET까지 전달한다. Router request.signal은 자동으로 Query signal과 같아지지 않는다. navigation abort만으로 공유 GET을 cancel하지 않는다. 같은 세션의 GET은 캐시를 준비할 수 있고, handler는 await 후 request abort/epoch를 검사해 이전 이동의 redirect를 실행하지 않는다.

세션 전환에서는 이전 auth/protected GET을 cancel/remove한다. Query 밖 POST는 epoch fence를 완료·오류·await 경계에 적용한다. 서버 POST의 롤백이나 취소를 보장하지 않고 자동 재전송하지 않는다. QueryCache onError는 meta의 epoch가 현재 client와 같은 경우에만 세션을 정리한다.

인증 명령은 `features/auth/commands.ts`에서 **동시 실행을 거부하는 단일 실행 잠금**을 사용한다. 대기열에 중복 로그인/로그아웃을 쌓지 않으며 버튼 잠금만 믿지 않는다.

1. 전환 잠금 설정 → epoch 상승/보호 캐시 제거 → auth GET cancel → auth null. live guard는 잠금 동안 보호 UI를 즉시 숨긴다.
2. POST 성공의 epoch 확인 후 auth cache commit. QueryCache identity 구독은 전환 중 중복 epoch 상승을 하지 않는다.
3. POST 실패 시 `/me`로 실제 cookie 상태를 확인하고 잠금을 해제한다. 이전 보호 데이터를 복원하지 않으며 logout 실패를 성공으로 표시하지 않는다.
4. 일반 `/me`에서 id/role/approvalStatus가 바뀌면 렌더 전에 보호 cache를 지우고 epoch를 올린다. 같은 identity는 학습/cache를 유지한다.
5. 계정/권한/epoch로 keyed Outlet을 사용한다. query/session/error가 이전 계정에 속하면 새 화면에 적용하지 않는다.

쿠키를 공유하는 여러 탭은 focus/online과 다음 navigation/API에서 수렴한다. 서버 push나 즉시 탭 동기화는 추가하지 않았다. 실제 API의 쿠키/DB 인가는 유지하며 client 접근 검사가 서버 권한 검사를 대체하지 않는다.

## 5. 인증과 접근 표

root session middleware가 먼저 me를 확인하고 child access middleware가 검사한 뒤 next를 호출한다. 이후 Loader는 병렬로 실행될 수 있다. 각 보호 Loader/Action도 `requireAccess`를 호출하며 유효한 context/epoch 없이 HTTP를 시작하지 않는다. 부모 Loader의 실행 순서를 가정하지 않는다.

| 상태 | Exam | 관리자 | 상태 페이지/공개 인증 |
| --- | --- | --- | --- |
| anonymous | login + returnTo | login + returnTo | 상태 페이지는 login; 인증 폼 허용 |
| pending member | pending | pending | pending |
| pending admin | pending | 허용 | pending |
| approved member | 허용 | exam | exam |
| approved admin | 허용 | 허용 | exam 또는 안전한 returnTo |
| rejected | rejected | rejected | rejected |

홈/404는 항상 public이다. me 네트워크 오류는 public 콘텐츠와 폼을 허용하며 보호 route는 error boundary로 차단한다. auth POST는 me 장애로 막지 않는다. logout은 public-only guard 하위에 두지 않는다.

복귀 주소는 `/login?returnTo=...`로 전달한다. `safeReturnTo`는 URL parser로 같은 origin과 허용된 `/`, `/exam`, `/admin/users`만 받아들인다. 외부 URL, 역슬래시, 이중 slash, 인증/상태 순환, 인코딩 우회는 `/exam`으로 fallback한다. POST 응답의 승인 상태가 복귀 주소보다 우선한다.

`LiveAccessBoundary`는 middleware 뒤의 얇은 Query observer이다. 진입 후 권한 상실이나 인증 오류에도 즉시 보호 콘텐츠를 숨기며, 기능별 5개 guard의 중복 본문을 통합했다.

## 6. Action First와 변경 정합성

| 변경 | 실행 경로 |
| --- | --- |
| login/signup | page useFetcher → route auth Action → authenticate → replace redirect |
| logout | Shell fetcher.Form → logout Action → authenticate |
| approve/reject | admin useFetcher → admin Action → decideUser |
| Exam JSON import | multipart useFetcher → exam Action → import-bank command → saved URL |
| 학습/채점/목표/진도 초기화 | 기존 local feature. 서버 변경이 아니므로 Action 불필요 |

현재 서버 변경은 모두 route와 연결되어 useMutation 예외를 남기지 않았다. 향후 Router 독립 작업, 복잡한 optimistic rollback 등의 실제 필요가 있을 때만 useMutation을 허용하고 캐시 갱신 주체·예외 이유를 기록한다. 같은 작업의 Action과 Mutation 실행 경로를 복제하지 않는다.

관리자 결정은 epoch와 사용자 ID별 잠금을 사용한다. 같은 사용자의 concurrent fetcher 요청은 추가 POST 전에 거부하고, 다른 사용자 결정은 병렬 허용한다. 성공 후 이전 pending GET을 cancel하고 epoch를 다시 확인한다. `setQueryData` updater로 확정 항목만 제거한 뒤 invalidate(none)한다. 자기 상태 변경이면 auth cache도 갱신한다. POST 실패는 항목을 제거하지 않는다.

Import Action은 FormData의 파일/merge mode와 route URL을 읽고 feature command를 호출한다. `features/start-lesson/model/import-bank.ts`는 JSON 해석·Contracts schema 검증·현재 은행 조합·같은 ID의 incoming note 우선 병합·동시 import 잠금을 소유한다. 요청 시작 snapshot의 epoch를 파일 읽기·POST·cache seed 뒤 검사한다. 저장 성공 응답으로 새 은행 cache를 seed하므로 redirect 직후 새 은행 GET이 필요하지 않다. Action은 결과에 따라 redirect/error를 반환하며 본문을 actionData나 영구 저장소에 복제하지 않는다.

## 7. URL, local state, Loading/Error/Lazy

- 은행: `/exam?bank=id`, 생략/default는 aws-sap. 없는 ID는 오류와 기본 은행 이동을 제공한다.
- 탭: `view=units|review|mock|settings`, 생략/unknown은 home. Loader가 replace로 정규화한다.
- lesson/result, 답변/index/primer/타이머/feedback은 URL에 넣지 않는다. 사용자별 통계·오답 ID는 기존 sanitized progress 저장을 유지한다. 본문·정답·입력 답변의 영구 저장은 금지한다.
- 예전 active-bank localStorage는 읽거나 쓰지 않는다. 기존 키를 삭제하기 위한 별도 migration은 불필요하며 새 URL 흐름에 영향을 주지 않는다.
- Workspace는 은행과 location key로 분리해 bank/view/back/forward 이동에서 local 세션을 리셋한다. 정상 revalidation은 location key를 바꾸지 않아 학습 snapshot과 timer를 유지한다.
- 학습 중 pathname/search 변경은 useBlocker 확인과 beforeunload 보조 안내를 제공한다. 계정 전환은 keyed guard가 확인 없이 즉시 폐기한다. 이탈·reload 후 미완료 세션 복원은 보장하지 않는다.

Shell과 가벼운 handler는 eager, auth/admin/exam page는 route lazy다. 초기 HydrateFallback도 Shell + 해당 content layout/Skeleton의 단일 main을 유지한다. 이후 navigation은 기존 화면과 Shell의 role=status 안내를 유지한다. 같은 key 재조회는 기존 콘텐츠와 Query isFetching/error 경고, fetcher는 해당 작업의 pending/error를 표시한다.

App의 공통 Route boundary는 도메인 key를 추측하지 않고 Router revalidation만 요청한다(`useRouteRefresh()`의 빈 key 목록). 실패·missing Query는 stale이므로 Loader가 재시도하고 auth/me도 다시 조회한다. 기존 데이터 경고의 page retry는 해당 key를 명시적으로 invalidate한다. document/chunk 오류처럼 reload가 필요한 경우 홈 이동 또는 브라우저 새로고침을 사용할 수 있다. skip link, aria-busy, reduced-motion Skeleton, Semantic token을 유지한다.

## 8. 검증과 제한

### FSD dependency guard

잠금 파일로 설치되는 Oxlint 1.85.0의 schema와 공식 문서를 확인했다. `.oxlintrc.json`의 source override에서 다음 규칙을 error로 실행한다. ESLint나 별도 import graph framework를 추가하지 않는다.

- `fsd/layer-direction`: 기존 Oxlint `jsPlugins` API로 실행하는 단일 로컬 규칙(`lint/fsd-plugin.mjs`). `@/`, 상대경로, Vite `/src/` 경로를 정규화한 뒤 source/target layer를 비교한다. native `no-restricted-imports`는 문자열만 검사하므로 `@/shared/../app` 같은 우회와 layer 이름을 가진 허용된 내부 폴더의 오탐을 함께 피하려고 이 작은 규칙을 사용했다. import/export, literal dynamic import/require, type-only import와 TypeScript import type도 검사한다.
- native `import/no-cycle`: import plugin을 활성화하고 외부 패키지는 제외한다. `ignoreTypes: false`로 type-only cycle도 검사하며 깊이를 인위적으로 제한하지 않는다. 현재 tsconfig의 `@/*` 해석은 fixture로 검증한다.

`test/fsd-lint.test.mjs`는 실제 Web config/로컬 규칙을 임시 프로젝트에서 Oxlint로 실행한다. 모든 허용 방향·같은 layer, 10개의 역방향 edge와 alias/relative/dot-segment 경로, type/import/export 형태, alias/relative/type-only cycle의 통과·실패를 검사한다. 임시 위반 코드는 테스트 종료 시 삭제된다. 구성 변경 뒤 `pnpm --filter @innova/web test`와 `lint`를 함께 실행한다.

범위는 현재 5개 layer의 의존 방향과 cycle이다. slice public API 강제·모든 cross-slice 제한·parent relative 금지·새 alias 자동 지원은 추가하지 않는다. 계산된 dynamic import/require 경로는 정적으로 검증할 수 없으므로 route lazy와 내부 모듈 참조에는 literal 경로를 사용한다. Oxlint JS plugin API는 alpha이므로 버전 변경 시 guard fixture를 반드시 실행한다.

`test/router-data.test.mjs`는 실제 createMemoryRouter + MSW로 접근 표, query freshness/중복 요청, action/revalidation, concurrent fetcher, 세션 fence, navigation abort 공유, StrictMode 구독 해제, 오래된 GET과 성공 patch 경합, multipart import, URL history/retry를 검증한다. 기존 query-cache와 static Shell 회귀 테스트를 함께 유지한다. 정적 markup harness는 handler를 제거해 UI만 검사하고 별도 실제 Router 테스트가 실행 책임을 검증한다.

PIN-29에서 도메인별 refresh의 비관련 cache 유지, concepts/scenarios merge 우선순위와 incoming metadata, 동시 import 거부 및 세션 전환 중 늦은 파일 읽기의 POST 차단을 추가로 검증한다. 공통 boundary의 missing-bank retry는 기존 Router 테스트를 유지한다.

PIN-20 브라우저 QA는 합성 MSW 계정/문항으로 수행했다. PIN-29는 화면을 변경하지 않으며 기존 Router/Query/Shell/MSW 테스트와 추가 회귀 테스트로 검증한다. 이번 구조 변경에서 브라우저 QA, 실제 운영 API/cookie·다중 탭, 느린 chunk 다운로드·새 배포 chunk 실패, 실제 모바일 기기 성능을 새로 검증하지 않았다. PIN-20 측정 수치는 초기 dependency 합계와 전체 lazy chunk 합계로 구분하며 warning threshold는 변경하지 않았다.

## 참고

Router/Query는 PIN-20에서, Oxlint는 PIN-29에서 설치 타입/소스와 공식 문서를 확인했다.

- [TanStack QueryClient](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient)
- [React Router middleware](https://reactrouter.com/how-to/middleware)
- [React Router actions](https://reactrouter.com/start/data/actions)
- [Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)
- [Oxlint no-restricted-imports](https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports)
- [Oxlint JS plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins)
- [Oxlint import/no-cycle](https://oxc.rs/docs/guide/usage/linter/rules/import/no-cycle)

## Curriculum Vertical Slice

`/exam?subject=<id>`는 Curriculum Chapter 목록, `chapter=<id>`는 읽기 화면, `view=quiz`는 교재 Quiz다. 기존 bank/view URL과 AWS SAP 학습 경로는 유지한다. Subject 선택은 Curriculum Subject 조회와 별도의 AWS SAP 링크를 사용하며 ExamBank adapter를 두지 않는다.

- `entities/curriculum`은 공유 response schema로 HTTP 응답을 검증하고 subjects/chapters/chapter/quiz Query를 소유한다. key에 session epoch를 포함하며 5분 freshness와 30분 GC를 사용한다. 보호 cache 정리 대상에 Curriculum을 포함한다.
- `pages/exam/route.ts`는 승인된 접근을 확인한 뒤 조회를 시작한다. page는 enabled false로 구독한다. Quiz 제출은 fetcher Form → route Action → `features/study-curriculum/submit-answer.ts` → API를 통과하며 이전 세션의 완료 결과를 차단한다. 답안·채점 결과는 메모리에만 존재하며 학습 기록을 DB나 localStorage에 저장하지 않는다.
- Chapter의 `readingOrder`는 모든 SourceBlock ID를 정확히 한 번 담는 명시적 순서다. Section/block position은 기존 sibling scope를 유지한다. parent/child 콘텐츠가 교차할 수 있으므로 API는 읽기 순서가 없는 Chapter를 409로 차단하며 page/PDF 위치 기반 heuristic을 사용하지 않는다. Section TOC의 sibling 정렬은 탐색만 담당하며 본문을 재정렬하지 않는다.
- `/api/curriculum`은 매 요청 DB-current approved guard와 no-store/Vary Cookie를 적용한다. Chapter 읽기는 JSONB 콘텐츠를 그대로 제공하고 Quiz 조회는 답안을 제외한다. grade 응답에서 답안과 교재 해설/evidence를 제공한다. `exact`는 문자열 그대로 비교하며 trim, synonym, Unicode normalization, fuzzy/LLM 평가를 사용하지 않는다. self-assessment와 unresolved는 자동 정답 판정을 하지 않는다.
- 그림은 인증된 block/content-index API로만 읽는다. 선택적인 `CURRICULUM_ASSET_ROOT` 아래 assetKey 상대 경로의 PNG/JPEG/WebP/GIF를 허용하며 traversal·root 밖 symlink·SVG/HTML을 거부한다. 런타임 자산이 없으면 명시적인 unavailable 안내를 표시하고 콘텐츠를 생성하여 대체하지 않는다.
- private assets는 Git 및 Vercel public bundle에 포함하지 않는다. 현재 로컬 private runtime에서 사용 가능하나 Render/Vercel 운영 환경에 해당 디렉터리가 제공되는 방식은 배포 후속 작업이다. 이번 Slice는 Production PostgreSQL 적재와 로컬 후보 코드의 API/Router/UI 검증이며 main 병합·운영 애플리케이션 배포를 포함하지 않는다.
- MSW의 Curriculum은 합성 샘플만 제공하며 동일한 승인 제한과 exact 채점을 재현한다. 계약/import/API/Router·cache·render 회귀도 합성 데이터로 수행한다.

# Frontend Data Architecture

PIN-20 통합 리팩터링의 실제 구현 기준이다. UI는 [DESIGN.md](./DESIGN.md), 변경 전후 측정과 QA는 [architecture-baseline.md](./architecture-baseline.md)를 따른다. Data Mode를 유지하며 API/DB를 재작성하지 않는다.

- 기반: 최신 `develop` `f7f259ca61dc16a2a22206f116b74d490f6b55e6`. 원격 main과 이력은 달랐지만 tree는 같았다.
- 작업 브랜치: 사용자가 신규 브랜치를 요청하여 `refactor/pin-20-data-flow`를 develop에서 생성했다. 기존 PIN-21 설계 커밋을 cherry-pick하여 이 문서를 이어받았다. develop 대상 단일 PR을 제출한다.
- 설치 버전: TanStack Query 5.103.2, React Router 8.4.0, React 19.3.0, Vite 8.3.1. package.json의 최소 버전과 구분한다.

## 1. 현행 감사와 교체 결과

PIN-21 기준 Router는 createBrowserRouter/RouterProvider만 사용하고 loader/action/lazy는 없었다. Shell·guard·page의 staleTime 0 Hook이 순차 mount에서 중복 요청할 수 있었다. 관리자 변경은 useMutation, import는 page의 imperative POST였다. 선택 은행은 계정 공용 localStorage에 저장되었다.

| 경로 | 현재 진입과 변경 | 유지하는 UI/상태 |
| --- | --- | --- |
| `/`, `*` | root session middleware, public 콘텐츠 | Shell, 단일 main, 홈/404. me 오류가 public 콘텐츠를 차단하지 않음 |
| `/login`, `/signup` | public middleware, route Action/useFetcher, schema 검증, replace redirect | 입력·확인 비밀번호는 local, 필드/폼 오류 |
| `/logout` | fetcher.Form → auth Action | 서버 실패 메시지, 성공/이미 만료 시 login 이동 |
| `/approval-pending`, `/signup-rejected` | 상태별 middleware + live guard | 계정 정보, 문의, Router 상태 재확인 |
| `/admin/users` | admin middleware → Loader → Query 구독, 결정 Action/useFetcher | Skeleton, cache 유지·갱신 경고, 성공 항목 제거 |
| `/exam` | approved middleware → Loader → Query 구독, import Action/useFetcher | 은행/view는 URL, 학습·답변·타이머는 local |

PIN-8의 Shell/콘텐츠 layout 및 단일 main, PIN-9의 최초 Skeleton/기존 데이터 갱신/오류·빈 결과 구분, PIN-10의 entity query key/options와 성공 응답 우선 cache patch를 유지했다. 접근 검사와 재검증의 시작 책임은 Router로 옮겼고 기존 useMutation 실행 경로와 은행 localStorage 선택은 제거했다.

## 2. 책임과 파일 배치

| 영역 | 책임 |
| --- | --- |
| `app/router.tsx`, `route-data.ts` | 주입된 단일 QueryClient, route tree, loader/action/lazy, URL·redirect·재검증 |
| `features/auth/route-session.ts` | middleware 접근 snapshot/context와 순수 returnTo 검사 |
| `app/query-client.ts`, auth session/commands | 인증 변경 감지, epoch, 전환 잠금, 보호 cache 정리 |
| `entities/*/queries.ts` | key, queryFn, freshness, GC/retry. 별도 변경 실행 경로 없음 |
| `entities/*/api.ts`, `shared/api/client.ts` | HTTP·credentials·signal·공통 오류/Contracts |
| feature commands | API 변경 응답의 세션 검사와 확정 cache 반영 |
| page | 캐시 구독, fetcher, 사용자 입력, local 학습 상태 |
| API/Contracts | 최종 인증·인가 및 wire schema. 이번 작업에서 변경 없음 |

`createAppRouter(client)`와 `createAppRoutes(client)`에는 Provider와 같은 client를 전달한다. loader/action이 전역 client나 Hook을 사용하지 않는다. Loader 반환값은 null이며 User/목록/은행을 loaderData에 복사하지 않는다. middleware snapshot은 한 요청의 접근 판정용이며 두 번째 서버 캐시가 아니다.

## 3. 조회·freshness·재검증

설치 소스와 공식 API를 확인해 신규 imperative 조회는 `queryClient.query(options)`를 사용한다. deprecated ensureQueryData/fetchQuery를 신규 코드에 사용하지 않는다. `'static'`은 invalidation도 무시할 수 있어 이 데이터에는 사용하지 않는다.

| 데이터 | freshness / GC | 조회 시작 |
| --- | --- | --- |
| auth/me | staleTime 0, 기본 GC | root middleware에서 실행별 확인; 401만 null로 해석 |
| admin pending | staleTime 0, 기본 GC | admin 접근 확인 뒤 Loader |
| exam bank | staleTime 5분, GC 30분 | approved 접근 확인 뒤 Loader; fresh면 GET 없음 |

보호 key는 `examBankKeys.detail(id, epoch)`, `adminUserKeys.pending(epoch)`이다. `meta.sessionVersion`으로 QueryCache의 이전 세션 오류도 격리한다. UI는 `useSessionScope()`의 현재 epoch와 같은 options로 구독한다.

UI 구독은 enabled false로 **조회 시작을 Router에 맡긴다**. 최초 조회·진입·재시도·focus/online을 포함해 Router만 재검증을 시작하므로 mount refetch나 Query 자동 focus refetch와 중복되지 않는다. root Shell의 focus/online listener는 보이는 문서에서 router.revalidate를 요청한다. 실패한 auth도 public 폼을 허용한다.

`shared/api/route-query.ts`는 client.query를 기다리는 동안 enabled false QueryObserver를 유지한다. StrictMode/초기 fallback의 임시 UI observer가 마지막 구독을 해제해 Loader의 공유 GET을 취소하는 실제 브라우저 문제를 방지한다. 종료 시 반드시 해제하고 세션 제거로 detach된 Query의 GC timer도 정리한다.

- 최초/재진입: middleware auth → 접근 검사 → Loader → query freshness 판정. fresh Exam 재진입은 은행 GET 0, stale/명시적 invalidate는 1.
- Action 성공: 확정 patch → invalidate(refetchType none) → Router 자동 revalidation. Action에서 active refetch를 추가 실행하지 않는다.
- 수동 refresh/실패 retry: `useRouteRefresh`가 auth/admin/exam key를 invalidate(none)한 뒤 Router revalidate를 기다린다.
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

Import Action은 파일/merge mode/schema를 확인한다. 요청 시작 snapshot의 epoch를 파일 읽기·POST·cache seed 뒤 검사하고 같은 client의 동시 import를 차단한다. 저장 성공 응답으로 새 은행 cache를 seed하므로 redirect 직후 새 은행 GET이 필요하지 않다. 본문을 actionData나 영구 저장소에 복제하지 않는다.

## 7. URL, local state, Loading/Error/Lazy

- 은행: `/exam?bank=id`, 생략/default는 aws-sap. 없는 ID는 오류와 기본 은행 이동을 제공한다.
- 탭: `view=units|review|mock|settings`, 생략/unknown은 home. Loader가 replace로 정규화한다.
- lesson/result, 답변/index/primer/타이머/feedback은 URL에 넣지 않는다. 사용자별 통계·오답 ID는 기존 sanitized progress 저장을 유지한다. 본문·정답·입력 답변의 영구 저장은 금지한다.
- 예전 active-bank localStorage는 읽거나 쓰지 않는다. 기존 키를 삭제하기 위한 별도 migration은 불필요하며 새 URL 흐름에 영향을 주지 않는다.
- Workspace는 은행과 location key로 분리해 bank/view/back/forward 이동에서 local 세션을 리셋한다. 정상 revalidation은 location key를 바꾸지 않아 학습 snapshot과 timer를 유지한다.
- 학습 중 pathname/search 변경은 useBlocker 확인과 beforeunload 보조 안내를 제공한다. 계정 전환은 keyed guard가 확인 없이 즉시 폐기한다. 이탈·reload 후 미완료 세션 복원은 보장하지 않는다.

Shell과 가벼운 handler는 eager, auth/admin/exam page는 route lazy다. 초기 HydrateFallback도 Shell + 해당 content layout/Skeleton의 단일 main을 유지한다. 이후 navigation은 기존 화면과 Shell의 role=status 안내를 유지한다. 같은 key 재조회는 기존 콘텐츠와 Query isFetching/error 경고, fetcher는 해당 작업의 pending/error를 표시한다.

Route boundary retry는 invalidate(none) + Router revalidation이다. document/chunk 오류처럼 reload가 필요한 경우 홈 이동 또는 브라우저 새로고침을 사용할 수 있다. skip link, aria-busy, reduced-motion Skeleton, Semantic token을 유지한다.

## 8. 검증과 제한

`test/router-data.test.mjs`는 실제 createMemoryRouter + MSW로 접근 표, query freshness/중복 요청, action/revalidation, concurrent fetcher, 세션 fence, navigation abort 공유, StrictMode 구독 해제, 오래된 GET과 성공 patch 경합, multipart import, URL history/retry를 검증한다. 기존 query-cache와 static Shell 회귀 테스트를 함께 유지한다. 정적 markup harness는 handler를 제거해 UI만 검사하고 별도 실제 Router 테스트가 실행 책임을 검증한다.

브라우저 QA는 합성 MSW 계정/문항으로 수행했다. 실제 운영 API/cookie·다중 탭, 느린 chunk 다운로드·새 배포 chunk 실패, 실제 모바일 기기 성능은 이 PR에서 검증하지 않았다. 측정 수치를 초기 dependency 합계와 전체 lazy chunk 합계로 구분하며 warning threshold는 변경하지 않았다.

## 참고

2026-10-01 KST에 설치 타입/소스와 공식 문서를 확인했다.

- [TanStack QueryClient](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient)
- [React Router middleware](https://reactrouter.com/how-to/middleware)
- [React Router actions](https://reactrouter.com/start/data/actions)
- [Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)

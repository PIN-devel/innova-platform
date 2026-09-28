# Frontend Data Architecture

PIN-20 통합 리팩터링의 설계 기준. PIN-21에서 작성한 **목표 설계**이며, 아래 현행 감사 외의 패턴은 아직 구현되지 않았다. PIN-22~26은 구현과 함께 이 문서를 갱신한다. UI 표현은 [DESIGN.md](./DESIGN.md), 측정·검증 기준선은 [architecture-baseline.md](./architecture-baseline.md)를 따른다.

- 감사 기준: `develop`의 `f7f259ca61dc16a2a22206f116b74d490f6b55e6` (2026-09-29 KST).
- 공통 작업 브랜치: `refactor/pin-20-frontend-data-architecture`. 이슈별 브랜치/PR 없이 논리적 커밋을 이어가고 PIN-26에서만 develop 대상 PR을 만든다.
- 범위: 전체 Frontend의 통합 교체. 필요한 API/Contracts 수정은 허용하지만 Backend/DB 재작성, 새 제품 기능, SSR/Framework Mode 전환은 포함하지 않는다.

## 1. 확정 조건과 설계 재량

사용자 확정 조건은 Data Mode + TanStack Query, Query의 단일 서버 캐시, Action First, 의미 있는 Exam URL 상태, 저장소 내 설계 관리와 단일 통합 브랜치다. `ensureQueryData()`를 새 표준으로 사용하지 않는다.

이 문서는 그 조건 아래 **middleware 선행 인증, Loader의 freshness 확인, Action의 캐시 확정 반영, Router 주도의 후속 재검증**을 선택한다. 구현자는 파일 분할, helper 이름, route ID, 테스트 harness, 작은 UI 구성과 청크 경계를 조정할 수 있다. 상태 소유권·접근 정책·캐시 정합성·학습 보존 정책을 바꾸려면 근거와 영향을 이 문서 및 해당 이슈에 기록한다. 상위 조건과 충돌하면 임의 변경하지 않는다.

## 2. 현행 감사

### 주요 경로와 데이터 흐름

현행 `src/main.tsx`는 단일 QueryClientProvider와 RouterProvider를 구성한다. `src/app/router.tsx`는 Data Router를 사용하지만 **loader/action/lazy/shouldRevalidate가 하나도 없다**. 페이지는 모두 정적 import다. 아래 모든 경로에서 RootLayout이 `useCurrentUser()`를 구독한다.

| 경로 | 현재 조회·접근 | 변경·탐색·상태 | Loading / Error |
| --- | --- | --- | --- |
| `/` | public, 홈 고유 서버 조회 없음 | Link로 서비스/계정 이동 | 계정 오류가 홈을 차단하지 않음 |
| `/login`, `/signup` | PublicOnly + SessionNotice의 `/auth/me` 구독 | Hook mutation → auth 캐시 → 컴포넌트 navigate. 입력/비밀번호 확인은 local, 복귀 주소는 location.state | 폼 오류와 필드 오류. me 실패 시 폼 허용 |
| `/approval-pending` | 상태 전용 component guard와 페이지가 me 구독 | 버튼 refetch → approved면 navigate; guard도 redirect | 계정 조회 실패와 확인 실패 표현 |
| `/signup-rejected` | rejected 전용 guard와 me 구독 | 문의 mailto, Shell logout | 계정 오류/로딩은 guard |
| `/admin/users` | RequireAdmin 렌더 이후 `usePendingUsers()` | approve/reject useMutation; 성공 항목 제거 → invalidate. 자기 상태 변경 시 auth 캐시 갱신 | 최초 Skeleton, cached refetch 실패는 목록+경고, 접근 오류는 차단 |
| `/exam` | RequireAuth 이후 `useQuery(examBankQuery(activeId))` | 은행 ID는 전역 localStorage, 7개 view·학습 진행은 local. import는 컴포넌트의 imperative POST | 최초 Skeleton, cached refetch 실패는 콘텐츠+경고, 접근 오류는 차단 |
| `*` | public 404 | 홈 Link | content layout 내부 404 |

근거: `src/features/auth/{auth-boundary,route-access,hooks,clear-protected-queries}.ts(x)`, `src/pages/auth/auth-pages.tsx`, `src/pages/{admin-users,approval-pending,signup-rejected}/index.tsx`, `src/pages/exam/exam-page.tsx`.

### 유지할 기반, 바꿀 책임

| 근거 | 판단 | 목표 변경 |
| --- | --- | --- |
| PIN-8: RootLayout, content layouts, 중첩 error boundaries | Shell/단일 main 분리는 적절함 | 유지. 데이터·코드 로딩 중에도 Shell을 보장 |
| PIN-9: Exam/Admin Skeleton, cached error 경고 | 최초/재조회/빈 결과/접근 오류 구분이 적절함 | 유지. Router pending까지 연결 |
| PIN-10: entity key/options, Exam 5분/30분, no-store | 데이터별 정책과 HTTP/메모리 캐시 분리는 적절함 | 유지. Loader와 Component가 같은 options를 사용 |
| auth-boundary의 5개 유사 guard | 렌더 이후 접근 검사와 오류/redirect 중복 | 순수 접근 판정은 유지하고 middleware/handler로 이동. 렌더 경계에는 즉시 은닉·local reset만 남김 |
| me를 Shell/guard/page에서 staleTime 0으로 구독 | in-flight 중복은 Query가 합치지만 순차 mount는 추가 GET 가능 | route 준비가 조회, UI는 중복 mount refetch 없이 구독. 지연시간으로 숨기지 않음 |
| app/query-client의 auth 성공 구독 + cacheAuthenticatedUser의 명시적 clear | identity 전환을 React 렌더 전 감지하는 장점. 같은 전환에서 clear/version 증가가 중복될 수 있음 | 단일 세션 전환 연산으로 통합 |
| clear-protected-queries의 key prefix와 session-version | 보호 데이터 제거 및 늦은 admin/import 결과 방어가 이미 존재 | 폐기하지 않고 epoch·읽기·쓰기·오류에 일관 적용 |
| auth hooks의 login/signup/logout onSuccess | admin/import와 달리 시작 세션/인증 전환 경합 방어가 없음 | 인증 명령 직렬화 + 완료 시 epoch 검증 |
| admin 성공 → filter → invalidate | 재조회 실패에도 성공 상태를 보존하는 올바른 정책 | 유지. 성공 전 시작된 GET이 뒤늦게 덮어쓰지 않도록 cancel 경계 보강 |
| exam-page의 import/refresh/cache/toast/selectBank | 도메인 변경과 페이지 상태·저장이 결합; import pending 잠금 없음 | Action과 작은 feature command로 이동 |
| `innova.exam.active-bank.v1` | 은행을 새로고침으로 복원하지만 공유/뒤로가기 불가, 계정별 설정도 아님 | URL을 유일한 선택 은행 소유자로 지정 |
| useProgress(userId), withoutContent | 사용자별 통계/ID 저장, 문제/정답/입력 제거가 적절함 | 보존. 서버 상태로 위장하거나 모든 진도를 서버로 옮기지 않음 |
| query/entity의 mutation helper 및 API 재export | 캐시 정책의 위치가 흩어지고 얇은 Hook이 많음 | query 파일은 조회 정의, feature command는 변경 결과 반영. 가치를 주지 않는 wrapper 제거 |

기존 다중 useQuery 자체는 이중 캐시가 아니다. 동일 key의 observer들은 같은 캐시를 본다. 중복 GET 위험과 책임 중복을 구분한다. 현재 보안 취약점이나 운영 장애를 재현한 것으로 해석하지 않는다.

## 3. 책임과 모듈 경계

| 영역 | 소유 책임 | 소유하지 않는 것 |
| --- | --- | --- |
| `app/` | QueryClient 생성, Router 조립·주입, Shell, 공통 pending/error, 세션 이벤트 연결 | 도메인 HTTP 구현, 학습 규칙 |
| route handler / middleware | URL 해석, 접근 요구, Loader/Action, redirect, revalidation 조정 | 별도 서버 캐시, React Hook 호출 |
| `entities/*/queries.ts` | key factory, queryFn, freshness/GC/retry, 도메인 조회 정의 | navigation/toast, 폼 입력 상태 |
| `entities/*/api.ts` | HTTP와 Contracts 파싱 | QueryClient, Router, UI |
| `features/` | 작업별 command와 결과 캐시 반영, auth lifecycle, 학습 규칙 | 별도 캐시/일반 workflow engine |
| `pages/` | Query 구독, 폼/Fetcher, 사용자 의도와 local UI | 직접 fetch, 중복 mutation 실행 경로 |
| `shared/api/client.ts` | credentials, signal, 공통 오류 envelope/request ID | 특정 경로 redirect, session 전역 싱글턴 |
| `packages/contracts` / API | wire schema 및 서버의 인증·인가·상태 전이 | 클라이언트 캐시나 라우트 정책 |

`createAppRouter(queryClient)` / `createAppRoutes(queryClient)`로 **Provider와 같은 인스턴스**를 주입한다. 테스트는 독립 client/router를 만든다. handler가 전역 singleton을 import하지 않는다. lazy 모듈도 주입된 client를 받는 factory 또는 Router context를 사용하며 별도 client를 만들지 않는다.

Loader는 Query 캐시를 준비한 뒤 `null` 또는 정규화된 URL 식별자 같은 작은 메타데이터만 반환한다. User/은행/관리자 목록을 loaderData와 Query 양쪽에서 UI 원본으로 사용하지 않는다. middleware context의 접근 snapshot은 한 실행에만 유효하고 UI가 구독하는 두 번째 User store가 아니다.

## 4. 조회와 재검증

### 설치 API와 선택

lockfile/설치 결과는 `@tanstack/react-query` 및 query-core **5.103.2**, React Router **8.4.0**, React **19.3.0**, Vite **8.3.1**이다. package.json의 최소 버전과 구분한다.

query-core의 `src/queryClient.ts`에서 `query(options)`와 `ensureQueryData/fetchQuery/prefetchQuery`의 deprecated 주석을 확인했다. 신규 imperative 조회는 **`queryClient.query(options)`**를 사용한다. 이는 fresh이면 cache, stale/invalidated/missing이면 조회를 기다리고 실패를 reject한다. retry는 각 options에서 명시한다. `select`는 반환값 변환이며 캐시 원본 소유권을 바꾸지 않는다.

`staleTime: 'static'`은 invalidate된 데이터도 그대로 돌려줄 수 있다. `Infinity`는 시간 만료가 없지만 invalidate에는 반응한다. 따라서 ensureQueryData를 `'static'`으로 기계 치환하지 않는다. 현재 auth/admin/exam에는 둘 다 채택하지 않는다. `enabled`, observer refetch 옵션은 imperative 호출의 실행 제어가 아니므로 Loader는 접근 검사 후에만 query를 호출한다.

### 데이터별 기준

| 데이터 | freshness / GC | 진입과 재조회 | 구독 정책 |
| --- | --- | --- | --- |
| auth/me | staleTime 0, 메모리만 | middleware에서 현재 실행의 identity 확인. `/me`의 401만 null로 해석 | Shell 등은 cache 구독; 준비 완료 후 mount 추가 요청 없음. focus/reconnect 재검증은 한 auth observer가 담당 |
| admin pending | staleTime 0, 기본 GC 5분 | 접근 확인 뒤 Loader가 최신 목록 조회 | route 준비 후 `refetchOnMount: false`; focus/reconnect는 Query에 허용 |
| exam bank | staleTime 5분, gcTime 30분 | missing/stale이면 Loader가 await, fresh이면 GET 없음 | 동일 options 구독. Loader 직후 중복 mount refetch를 끔; focus/reconnect는 stale일 때 허용 |

보호 key는 기존 도메인 prefix를 유지하고 **세션 epoch를 포함**한다. 예: `['exam-bank', epoch, canonicalBankId]`, `['admin','users','pending',epoch]`. raw 문자열은 options/갱신에 반복하지 않는다. epoch는 권한 자체가 아니라 이전 세션 결과의 격리 장치다. 세션 전환 시 과거 key를 제거하므로 사용자 수만큼 캐시가 누적되지 않는다. auth/me는 고정 key이며 전환 중 cancel 및 commit 검사를 적용한다.

컴포넌트는 useQuery로 구독하고 `undefined`/오류 상태를 다룬다. Loader 완료만 믿고 non-null assertion을 늘리지 않는다. 세션 clear/GC/실패 때문에 이후 데이터가 없어질 수 있다. route 준비가 보장된 구독에만 `refetchOnMount: false`를 적용하고, Loader 없는 독립 위젯까지 전역 비활성화하지 않는다. 인증 구독은 pending 전환 중 자동 GET이 출발하지 않도록 제한한다.

### 한 번의 갱신에 한 실행 주체

1. 최초 진입: middleware auth → 보호 Loader → `client.query(options)` → 동일 Query 구독. auth/admin의 staleTime 0을 늘려 중복을 숨기지 않는다.
2. 재진입: Router가 Loader를 실행하면 Query가 freshness를 판단한다. Exam fresh에는 은행 GET 0, stale에는 1. auth 확인은 별도다.
3. Action 성공: 확정 캐시 반영 → 관련 key invalidate(`refetchType: 'none'`) → Router의 자동 Loader revalidation이 GET을 수행한다. Action에서 invalidate의 기본 active refetch와 Router 재검증을 동시에 시작하지 않는다.
4. 독립 useMutation 예외: 해당 command는 invalidate만 하고, 호출 adapter가 active Query refetch를 책임진다. 추가 router.revalidate는 하지 않는다.
5. 명시적 새로고침/재시도: 대상 key invalidate(`none`) 후 `revalidator.revalidate()`를 한 경로로 연결한다. Query freshness 때문에 사용자의 갱신이 cache hit로 끝나지 않아야 한다. 기본 은행 복귀는 기본 key를 invalidate한 뒤 해당 URL로 navigation하며 별도 direct GET을 하지 않는다.
6. `shouldRevalidate`는 기본값을 유지한다. Exam의 bank가 같고 `view`만 달라졌다면 은행 Loader는 생략 가능하다. auth middleware 검사는 유지한다. POST 성공·bank 변경·명시적 revalidate를 전역 false로 막지 않는다.

조회 중인 동일 key의 Query promise는 공유되지만, **완료 후 staleTime 0인 새 호출까지 합쳐지는 것은 아니다**. focus/reconnect와 navigation이 겹치는 경우도 검증한다. 임의 debounce나 time window를 추가하지 않는다.

### 실패와 취소

Loader의 missing-data 실패는 route error로 올린다. 동일 epoch/key에 기존 데이터가 있고 일반 네트워크/5xx 재조회만 실패했다면 Loader는 진입/갱신을 완료할 수 있고, Query의 error와 기존 데이터로 경고를 표시한다. 접근 오류, 404, schema 오류는 usable stale fallback으로 삼지 않는다. 특히 POST 성공 후 목록 재조회 실패를 Action 실패로 바꾸지 않는다.

Query의 `queryFn({ signal })`을 HTTP까지 전달한다. Router `request.signal`과 Query signal은 자동 연결되지 않는다. **navigation 취소만으로 공유 key의 Query를 cancel하지 않는다**: 다른 Loader/observer가 기다리는 GET까지 취소할 수 있다. 같은 epoch의 요청은 완료되어 캐시를 데울 수 있지만, handler는 await 후 request abort/epoch를 확인해 redirect·toast·로컬 변경을 하지 않는다. event listener를 쓰면 종료 때 해제한다.

세션 전환은 예외다. 모든 이전 보호 요청과 auth 조회를 cancel하고 캐시를 제거한다. 성공 캐시 patch를 덮을 수 있는 이전 목록 GET도 해당 key만 cancel한다. Abort는 서버 POST 취소나 롤백을 보장하지 않으므로 요청을 자동 재전송하지 않는다. Query가 취소됐다는 이유로 인증 해제·오류 toast를 실행하지 않는다.

## 5. Action First와 변경 정합성

### 작업별 선택

| 작업 | 기본 adapter | 결과 |
| --- | --- | --- |
| 로그인/회원가입 | route Action + Form | Contracts 검증, session commit, 안전한 복귀 URL로 replace redirect |
| 로그아웃 | 명시적 logout Action + fetcher.Form | 성공 또는 이미 만료된 세션 정리, `/login` 이동 |
| 관리자 승인/거절 | `/admin/users` Action + useFetcher | intent/id 검증, 같은 화면에서 row pending/error, 성공 목록 patch |
| Exam JSON import | `/exam` Action + useFetcher | 파일/merge 검증, POST 응답 cache seed, 성공 시 새 bank URL로 전환 |
| 기본 은행 복귀/상태 확인 | navigation/revalidation | 읽기이며 Mutation으로 포장하지 않음 |
| 목표 변경·학습 기록 초기화·채점·파일 export | local feature 함수 | 서버 변경이 아니므로 Action/useMutation 불필요 |

현재 작업 중 useMutation을 반드시 남겨야 하는 사례는 확인되지 않았다. 향후 복잡한 optimistic rollback, Router 생명주기와 무관한 작업 등 구체적 필요가 생기면 사용 이유와 캐시 갱신 주체를 문서화한다. 파일 import라는 이유만으로 예외를 만들지 않는다. 동일 버튼이 Action과 mutate를 함께 부르지 않는다.

Action은 브라우저에서 실행되는 어댑터다. API endpoint를 대체하거나 비밀을 가질 수 없다. 공유 스키마로 input을 검증하고 expected validation/business 오류는 필드/폼 action data와 적절한 오류 status로 반환한다. passwordConfirm은 Frontend 검증만 하고 API에 추가하지 않는다. 예기치 않은 장애는 route boundary, 접근 오류는 공통 session 처리로 보낸다. redirect Response를 일반 catch로 삼키지 않는다.

**feature command는 Router/React 비의존 함수**로 입력 → entity API → epoch 검증 → 확정 cache patch → invalidate(none)를 한 곳에 둔다. 작은 작업이면 Action 내부에 두어도 되지만 Hook에 같은 정책을 복제하지 않는다. helper 계층을 만들기 위해 모든 API를 감싸지 않는다.

### 관리자 결정 순서

1. Action이 admin 접근 snapshot과 epoch를 확보하고 intent/id를 검증한다.
2. 서버 POST를 한 번 실행한다. 실패 시 성공 항목 제거를 수행하지 않는다.
3. 성공 후 현재 epoch를 확인하고, 결정 이전에 시작된 pending GET을 cancel한다. **await 뒤 다시 epoch를 확인**한다.
4. `setQueryData`의 updater로 응답 user.id를 현재 목록에서 제거한다. 오래된 배열 snapshot으로 전체를 덮지 않는다. 자기 계정 결정이면 session commit이 우선하며 이전 epoch 목록을 다시 만들지 않는다.
5. 현재 epoch의 목록을 invalidate(none)하고 성공 결과를 반환한다. Router 재검증 실패는 목록 경고이며 POST 재시도 사유가 아니다.

동일 사용자에 대한 승인/거절은 공통 pending identity로 중복 제출을 막는다. 서로 다른 사용자 fetcher는 병렬 허용하지만 성공 patch가 서로를 되돌리면 안 된다. Router는 응답 표시 순서를 관리할 뿐 API의 중복 실행/원자성을 보장하지 않는다. 서버의 pending 조건 갱신, approved 재승인 멱등성, reject 충돌 정책을 유지한다. 404/409이면 설명과 목록 갱신을 제공하되 성공으로 가장하지 않는다.

### Exam import

파일 읽기와 스키마 검증도 epoch/화면 작업 token의 범위에 포함한다. submit 동안 다시 import하지 못하게 한다. merge는 제출한 bank ID와 그때의 데이터에 대해 수행하며, 진행 중 다른 bank로 이동했다면 늦은 완료가 사용자를 되돌리지 않는다. command의 성공은 같은 epoch에서 캐시에 반영할 수 있으나 navigation/toast는 아직 유효한 화면 intent일 때만 실행한다.

성공 응답의 `saved.id` key를 seed한 뒤 URL을 변경하여 즉시 중복 GET을 피한다. POST 이후 전송 오류는 서버에서 생성됐는지 불명확할 수 있으므로 자동 재시도/자동 rollback을 하지 않는다. 현재 API는 모든 approved 사용자가 은행을 생성할 수 있고 은행이 개인 소유라는 계약은 없다. 이번 구조 변경을 소유권/권한 제품 변경으로 확대하지 않는다.

## 6. Authentication / Authorization / Session

### 접근 표 (role과 approvalStatus를 분리)

| 사용자 | `/login`, `/signup` | `/exam` | `/admin/users` | 상태 페이지 |
| --- | --- | --- | --- | --- |
| anonymous | 허용 | login + 안전한 returnTo | login + returnTo | login |
| pending member | approval-pending 이동 | approval-pending | approval-pending | pending만 허용 |
| pending admin | approval-pending 이동 | approval-pending | 허용 | pending에서 관리자 링크 |
| approved member | exam 또는 검증된 returnTo | 허용 | exam 이동 | exam 이동 |
| approved admin | exam 또는 검증된 returnTo | 허용 | 허용 | exam 이동 |
| rejected (role 무관) | signup-rejected 이동 | signup-rejected | signup-rejected | rejected만 허용 |

홈/404는 public이다. 공개 경로에서 me 네트워크 오류는 Shell 경고와 public 콘텐츠를 유지한다. 보호 경로에서는 identity를 확인할 수 없으면 새 보호 조회/표시를 허용하지 않고 재시도 화면을 제공한다. 실패를 anonymous로 단정해 redirect loop를 만들지 않는다.

Loader redirect는 location.state를 넘길 수 없으므로 `/login?returnTo=...`처럼 URL로 복귀 대상을 전달한다. origin이 같고 허용된 내부 경로인지 URL parser로 검증한다. `//`, 외부 origin, auth/status 순환 경로, 인코딩 우회를 배제하고 fallback은 `/exam`이다. POST 결과의 승인 상태가 returnTo보다 우선한다.

### 병렬 Loader 앞의 인증 경계

React Router 8.4.0의 **Data Mode `middleware`**를 사용한다. root의 session middleware가 QueryClient로 me를 준비하고, child access middleware가 위 표를 검사한 뒤 `next()`를 호출한다. 그 이후 matched Loader들은 병렬 실행된다. 부모 Loader가 자식보다 먼저 끝난다고 가정하지 않는다. custom dataStrategy나 자체 middleware engine은 도입하지 않는다.

각 보호 Loader/Action은 실행 context에 유효한 access snapshot이 있는지, 필요한 role/status와 epoch가 맞는지 확인하고 HTTP를 시작한다. 새 route가 middleware 밖에 잘못 배치돼도 무검사 실행하지 않게 한다. 직접 호출 테스트도 context를 명시한다. snapshot은 캐시 참조/epoch를 한 실행에 묶는 용도이며 다음 navigation까지 재사용하지 않는다. Action 뒤 재검증에서는 snapshot을 새로 확인하고, 인증 변경 전 snapshot을 재사용하지 않는다.

me는 middleware에서 한 번 조회하고 UI mount가 다시 조회하지 않는다. login/signup/logout POST는 이전 me 조회 실패로 차단하지 않는다. 각각 공통 인증 명령 경계를 사용하고, 공개 guard를 POST에 그대로 적용하여 로그아웃을 방해하지 않는다. root session middleware는 public 오류를 저장하고 child에서 필요한 오류 경계로 표현하여 Shell 전체를 불필요하게 교체하지 않는다.

**서버가 최종 권한 검사자다.** API의 cookie JWT 검증 + 매 요청 DB 사용자 조회, approved/admin guard, `Cache-Control: no-store`와 `Vary: Cookie`를 유지한다. /me 직후 권한이 바뀌는 TOCTOU도 보호 API의 401/403이 차단한다. 클라이언트 fresh cache는 접근 허가 증거가 아니다.

### 세션 전환 연산

기존 session-version을 QueryClient 단위 **epoch**로 유지한다. 하나의 coordinator가 다음을 처리한다. 유지하는 부가 상태는 epoch/전환 중 여부/identity tuple 정도이며 AuthUser의 두 번째 store는 만들지 않는다.

1. 로그인·회원가입·로그아웃 시작 시 같은 client의 인증 명령을 직렬화한다. 버튼만 막는 것이 아니라 중복 실행 경로를 막는다. epoch를 먼저 올리고 보호 화면을 잠그며 auth 및 보호 GET을 cancel/remove한다. 새로운 보호 조회도 전환 중 시작하지 않는다.
2. 인증 POST 완료가 현재 연산인지 확인하고 auth cache를 commit한다. auth 성공 구독과 명시적 commit이 같은 전환을 이중 처리하지 않도록 단일 연산으로 합친다. 취소가 불가능한 POST 결과의 cache/redirect/toast에도 검사를 적용한다.
3. 인증 명령 실패 시 세션 전환 잠금을 해제하고 `/me`로 실제 쿠키 상태를 확인한다. 실패했다고 이전 보호 데이터를 복원하지 않는다. logout 실패를 성공으로 알리지 않는다.
4. 일반 `/me` 재검증에서 id/role/approvalStatus 변경 또는 null 전환을 감지하면 epoch 상승 → 보호 cancel/remove → local subtree reset을 렌더 전에 적용한다. identity가 같으면 cache/local 학습을 보존한다.
5. 모든 보호 queryFn/command는 시작 epoch를 가지고 완료·오류·await 이후에 유효성을 확인한다. 이전 epoch의 401/403은 새 계정의 세션을 지우면 안 된다. QueryCache onError도 해당 epoch인지 확인한다. MutationCache.clear만으로 POST가 취소된다고 보지 않는다.

현재 `QueryCache.subscribe` 방식은 유지 가능하지만 변경 감지는 coordinator로 모은다. protected prefix 등록 또는 query meta 선택은 구현 재량이나 조회·정리·오류 분류가 같은 기준이어야 한다. 무관한 public query까지 무조건 clear하지 않는다.

401은 auth null과 보호 cache 제거, pending/rejected는 상태 반영 후 해당 경로 이동, FORBIDDEN은 보호 콘텐츠를 숨기고 me 재확인이다. me가 계속 admin을 반환하는 resource-level FORBIDDEN은 접근 불가로 표시하며 무한 재조회하지 않는다. 네트워크/5xx는 세션 만료로 간주하지 않는다.

middleware는 진입을 제어하고 **얇은 렌더 경계는 관찰 중 권한 상실을 즉시 숨긴다**. 보호 subtree key에 epoch/identity를 반영하여 학습 상태가 계정 사이로 넘어가지 않게 한다. 단순 URL/view 변경이나 정상 background refresh에는 subtree 전체를 remount하지 않는다.

여러 탭은 쿠키를 공유하지만 QueryClient/epoch는 공유하지 않는다. 기본 보장은 focus/reconnect와 다음 navigation/API에서 재검증하는 수준이다. 즉시 탭 간 동기화나 서버 push는 이번 범위에 추가하지 않는다. 이미 처리 중인 인증 POST의 서버 부작용까지 client epoch가 막지는 못한다. 직렬화와 응답 후 me 확인으로 수렴시키며 실서버 쿠키 경합은 PIN-24/26의 검증 항목이다.

## 7. URL / Server / Local State

| 상태 | 소유자 | 정책 |
| --- | --- | --- |
| 현재 은행 | URL `/exam?bank=<id>` | 없으면 `aws-sap`; `default` 별칭은 aws-sap으로 정규화. Query key와 URL parser가 동일 ID를 사용 |
| 홈·유닛·오답·모의·설정 탐색 | URL `view=units|review|mock|settings`, 생략=home | 복원/공유 가능한 탐색 탭만 URL. 하나의 `/exam` route로 충분 |
| 서버 사용자·은행·관리자 목록 | Query cache | 컴포넌트 state/localStorage에 복사하지 않음 |
| 진행 중 session/답변/index/timer/primer/feedback | Exam local state | lesson/result를 URL에 만들지 않음. reload/departure 후 진행 중 세션 복원 약속 없음 |
| 마지막 결과 상세 | local memory + 기존 sanitized progress | 본문/정답/답변의 영구 저장 금지 |
| 누적 통계/오답 ID/일일 목표 | 사용자별 localStorage | 서버 데이터가 아닌 현재 제품의 브라우저 기록. 기존 사용자 key와 내용 제거 정책 유지 |
| 폼 입력·file·import mode·대화상자·경고 | component/fetcher state | 공유/영구 저장 불필요 |

unknown view는 home으로 replace 정규화한다. 없는 bank ID는 오류와 기본 은행 이동을 제공하고 무조건 조용히 기본 은행으로 덮지 않는다. localStorage의 active-bank key는 신규 조회에서 읽지 않고 제거하여 URL과 이중 동기화하지 않는다. 진도는 이번에 서버나 새 bank별 저장 구조로 마이그레이션하지 않는다. 서로 다른 은행의 note ID 충돌은 기존 데이터 모델의 제약으로 남기고 fixture로 영향 범위를 확인한다.

bank 변경·다른 경로 이탈·학습 중 back/forward는 진행 중 작업 폐기 확인을 제공한다. 허용하면 session/drafts/timer를 리셋하고 해당 URL을 연다. view만 변경할 때도 학습이 진행 중이면 같은 확인을 적용한다. 정상 Query refetch는 현재 생성된 LessonSession의 문제 snapshot을 바꾸거나 타이머를 초기화하지 않는다. 계정/권한 전환에서는 확인 없이 즉시 폐기한다. beforeunload는 브라우저 지원 범위 내 보조 안내다.

## 8. Navigation / Loading / Error / Lazy

RootLayout과 content layout의 소유권은 PIN-8 그대로다. Shell은 eager, 무거운 Exam/Admin page 구현은 route lazy를 우선 사용한다. path/index/children 같은 matching 정보, 가벼운 loader/action factory, 접근 정책은 정적으로 두어 코드 import와 데이터 준비가 병렬로 진행될 수 있게 한다. Loader가 page 전체를 import하면 코드 분할 효과를 잃는다. 수동 vendor 분할·warning threshold 상향부터 시작하지 않는다.

- 최초 직접 진입: 해당 route의 eager `HydrateFallback`/Skeleton으로 Shell+단일 main을 표시한다. root loader가 Shell까지 막는 구성이나 빈 화면을 피한다. 초기 fallback에서도 auth 구독이 middleware와 중복 GET을 만들지 않아야 한다.
- navigation: `useNavigation`으로 Shell 내 작은 상태 표시. 이전 콘텐츠를 유지할 수 있으면 유지한다. 최초 대상 데이터가 없으면 콘텐츠 영역 Skeleton; 권한 전환이면 이전 보호 콘텐츠를 먼저 숨긴다.
- same-key revalidation: Query `isFetching`/`isRefetchError`가 영역 상태를 담당한다. 전체 Shell/학습 세션을 Skeleton으로 교체하지 않는다.
- fetcher: 해당 폼/row pending과 오류를 표시한다. `navigation.state` 하나로 모든 mutation을 잠그지 않는다. 반복 화면 성공 toast는 같은 action 결과에 한 번만 실행한다.
- missing-data/404/예기치 않은 loader 오류: 가장 가까운 content error boundary. 일반 재시도는 key invalidate + Router revalidation으로 복구한다. chunk import 실패는 새 배포 가능성을 설명하고 document reload를 제공할 수 있다.
- route boundary와 Query error 경계가 같은 오류를 toast/페이지로 중복 출력하지 않는다. Query background 오류는 cached data 옆 경고, 접근 오류는 세션 경계가 우선이다.
- role=status, aria-busy, skip link, 단일 main, focus 이동, reduced-motion을 유지한다. history back/forward의 화면과 focus도 검증한다.

## 9. 참조 패턴과 금지 패턴

다음은 목표 형태를 설명하는 축약 예시이며 아직 존재하지 않는 helper 이름을 포함한다. 실제 signature와 에러/취소 처리는 위 정책을 구현해야 한다.

```ts
// app: Provider와 같은 client. session/access middleware 뒤에 loader 실행.
const routes = createAppRoutes(queryClient);

// pages/admin-users/loader.ts (개념 예시)
const adminLoader = (client: QueryClient) => async ({ request, context }) => {
  const scope = requireCurrentAccess(context, client, "admin");
  const options = pendingUsersQuery(scope.epoch);
  try {
    await client.query(options);
  } catch (error) {
    // 취소·다른 epoch·접근/404/schema 오류는 이 fallback에 포함하지 않는다.
    if (!hasUsableSameSessionData(client, options, error, scope)) throw error;
  }
  assertCurrentRequestAndSession(request, client, scope);
  return null;
};

// component: loaderData로 목록을 다시 저장하지 않는다.
const pending = useQuery({
  ...pendingUsersQuery(currentEpoch),
  refetchOnMount: false,
});

// feature command의 성공 구간 (인증/입력 검증/POST는 생략)
assertSessionVersion(client, epoch);
await client.cancelQueries({ queryKey: pendingKey, exact: true });
assertSessionVersion(client, epoch);
client.setQueryData(pendingKey, (users) => users?.filter(u => u.id !== saved.id));
await client.invalidateQueries({ queryKey: pendingKey, exact: true, refetchType: "none" });
// Action이 성공을 반환하면 Router가 loader를 재실행한다.
```

피해야 할 패턴:

- 부모 Loader의 redirect만 믿고 자식 Loader가 보호 API를 먼저 호출.
- `getQueryData(...) ?? query(...)`로 stale/invalidated 검사 무시, 모든 조회에 `'static'` 적용.
- API의 no-store를 Query cache 금지로 해석하거나 fresh cache를 권한 증명으로 사용.
- Action의 POST → active invalidate refetch → Router revalidation → staleTime 0 mount refetch의 연쇄.
- 성공 목록을 오래된 배열 snapshot으로 덮거나 refetch 실패 시 mutation rollback.
- navigation abort를 공유 Query 전체 cancel에 무조건 연결하거나 POST가 서버에서도 취소됐다고 가정.
- Query 데이터를 `useState`/loaderData/persistent cache로 복제; 모든 local 작업을 Action으로 이동.
- Router/Core Framework 전환, 전역 key registry, 범용 repository wrapper, 장기 middleware framework를 이번 작업에 추가.

## 10. 구현 인계와 완료 검증

| 이슈 | 책임·예상 변경 | 선행/협업 | 핵심 검증 |
| --- | --- | --- | --- |
| PIN-22 | client 주입, entity options의 imperative query, Loader factory, cached error fallback, refresh/revalidation/cancellation | PIN-21. PIN-24의 scope/epoch 계약을 먼저 맞춤 | 첫 조회/fresh/stale/invalidated, 0 staleTime 중복 mount, shared GET 취소, 반환값/캐시 단일 소유 |
| PIN-23 | auth/admin/import Action, Form/Fetcher, feature command, 성공 patch와 invalidate(none), 중복 제출 | PIN-24의 session command와 공동 구현 | POST 성공+GET 실패, 이전 GET 덮어쓰기, 서로 다른 fetcher/같은 row 경합, 실패 POST, 화면 이탈 후 import |
| PIN-24 | middleware/context, 접근 표, 세션 coordinator, protected epoch keys, live render 은닉/reset | PIN-22/23보다 먼저 최소 scope/세션 계약을 구현하면 편리. 별도 브랜치 불필요 | 모든 role/status 직링크, 병렬 Loader, 계정 전환 중 GET/POST/error, 늦은 auth 응답, self decision, loop/flash |
| PIN-25 | 전체 page 연결, Exam URL parser·상태 분리, lazy 및 pending/error/blocked navigation | PIN-22/23/24 완료 기반 | deep link/reload/back, 은행/학습 전환, fresh import GET 0, timer/refetch, lazy failure, Shell와 landmark |
| PIN-26 | 구현/문서 일치, baseline 재측정, 통합 회귀, develop 대상 단일 PR | PIN-25 및 전체 AC | 루트 4개 gate, 번들 초기 의존 청크 합산, 실브라우저/실API QA와 잔여 위험 |

실행 순서는 이슈 번호를 기계적으로 따르지 않는다. PIN-24의 작은 session/access 기반 → PIN-22 Loader → PIN-23 Action → PIN-25 전체 연결로 같은 브랜치에서 진행할 수 있다. 이슈 상태는 각 AC 실제 충족 시 변경한다. API/Contracts 변경은 현재 필수로 판정하지 않았으며, 응답 파싱 일관화에는 이미 있는 ExamBankRecordSchema를 검토한다. 필요가 생기면 API/MSW/소비자/계약 테스트를 함께 수정한다.

현재 테스트는 QueryObserver/MSW 동작과 static markup을 검증하지만 실제 Router navigation/action/lazy 및 browser focus·학습 이탈은 충분히 다루지 않는다. PIN-22~25에서 createMemoryRouter로 실제 실행과 요청 횟수를 검증하고 PIN-26에서 시각/쿠키/배포 경로를 확인한다. 기존 assertion을 목표 동작에 맞춰 이동할 수 있지만 회귀 의미를 삭제하지 않는다. 합성 데이터만 사용한다.

## 참고 근거

공식 문서와 설치 소스를 2026-09-29 KST에 대조했다. 최신 문서는 변경될 수 있으므로 구현 시 lockfile 버전의 타입/소스/실행 결과를 우선한다.

- [TanStack QueryClient API](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient) — `query`, deprecated API, invalidate/refetch.
- [Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) — Query signal과 공유 요청 수명.
- [React Router Data route object](https://reactrouter.com/start/data/route-object), [revalidation](https://reactrouter.com/how-to/optimize-revalidation) — Data Mode handler/lazy/revalidation.
- [React Router middleware](https://reactrouter.com/how-to/middleware), [race conditions](https://reactrouter.com/explanation/race-conditions) — 접근 검사 순서와 서버 부작용 한계.
- [TkDodo: React Query meets React Router](https://tkdodo.eu/blog/react-query-meets-react-router) — Router가 조회 시점, Query가 캐시를 맡는 통합 원칙만 참고. 과거 API와 무조건 cache-first 예제를 그대로 복사하지 않음.

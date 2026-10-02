# PIN-21 비교 기준선

상태: PIN-21 기준선과 PIN-20 통합 검증의 과거 기록. 일반 구현 작업의 필수 읽기 대상이 아니다. 코드 경로는 `apps/web/`, 명령은 별도 명시가 없으면 저장소 루트 기준이다.

2026-09-29 KST, 소스 `develop@f7f259ca61dc16a2a22206f116b74d490f6b55e6`에서 측정했다. 당시 PIN-21 변경은 문서뿐이었다. 현행 정책은 [아키텍처 기준](./architecture.md)을 따른다. 아래는 현재 성능이나 운영 트래픽/브라우저 성능 측정치가 아니다.

## 환경과 재현

- Linux x64, Node `v24.19.0`. 첫 실행 환경의 pnpm wrapper는 `11.25.0`이었다.
- 이후 저장소 `packageManager`가 지정한 **pnpm 12.6.0**을 `corepack pnpm`으로 확보해 frozen install 및 아래 네 gate를 모두 다시 실행했다. 동일한 48개 테스트가 통과했다. packageManager/lockfile은 변경하지 않았다.
- `pnpm install --frozen-lockfile` 성공. 추적 파일의 설치 변경 없음.
- lockfile 설치 버전: Query/Query Core `5.103.2`, React Router `8.4.0`, React/React DOM `19.3.0`, Vite `8.3.1`.
- production build는 기본 `pnpm build`, 사용자 환경변수 파일 없이 실행. 실제 DB/운영 API에 접속하지 않았다.

```sh
git checkout f7f259ca61dc16a2a22206f116b74d490f6b55e6
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
```

후속 비교는 별도 checkout에서 수행하여 진행 중인 통합 브랜치 변경을 보존한다. 위 명령은 재현 방법이며 통합 브랜치를 되돌리라는 작업 지시가 아니다.

## 실행 결과

| 명령 | 결과 | 범위 |
| --- | --- | --- |
| `pnpm build` | exit 0 | Contracts/API/Web 성공; Web 청크 500 kB 초과 경고 |
| `pnpm typecheck` | exit 0 | Contracts 빌드 + API/Web 타입 검사 |
| `pnpm test` | exit 0 | Web 33/33, API 15/15, 총 48; 실패/skip 0 |
| `pnpm lint` | exit 0 | Web oxlint; 루트 lint는 API lint를 별도로 실행하지 않음 |

### 번들

아래 kB/gzip은 **Vite build reporter의 표시값**이다. 서로 다른 gzip 도구/압축 옵션으로 재압축한 크기를 이 열과 직접 비교하지 않는다.

| 출력 | 원본 bytes | Vite 표시 kB | Vite gzip kB |
| --- | ---: | ---: | ---: |
| `dist/assets/index-BHA64-HU.js` | 595366 | 595.36 | 183.97 |
| `dist/assets/index-S5GBWTob.css` | 37341 | 37.34 | 7.71 |
| `dist/index.html` | 596 | 0.59 | 0.41 |

- 404 modules transformed. 문서 추가 전 소스의 Web build 보고 시간은 첫 실행 7.87초, pinned 재확인 4.90초였다. warm cache 등이 달라 시간 비교나 성능 목표로 사용하지 않는다.
- JS entry SHA-256: `3a4a8887cd2976a51307d145fc765ab911f8d45ccd321a78f856e3f9a6d15dbe`.
- 현재 Router page 정적 import로 production application JS는 단일 entry 청크다. `public/mockServiceWorker.js`도 dist에 복사되지만 production main의 enableMocking은 DEV가 아니면 반환하므로 초기 app JS 합산에 포함하지 않는다.
- 과거 약 595 kB/gzip 184 kB와 유사한 값이 이번 checkout에서 **새로 재현**됐다. 과거 관측 환경과 동일하다고 단정하지 않는다.
- PIN-25/26은 entry 파일 하나만 비교하지 말고 entry의 정적 의존 청크 전체, route별 lazy 청크와 CSS, 직접 진입 `/exam`의 추가 다운로드를 함께 기록한다. 청크 이름 변경 자체는 회귀가 아니다. threshold 상향으로 경고만 없애지 않는다.
- 브라우저 initial transfer, RTT, FCP/LCP, Render cold start는 미측정이다.

추가 관측: 새 설계 문서 2개가 있는 상태에서 재빌드하면 CSS가 38.54 kB/gzip 7.90 kB로 증가하고 entry hash도 달라졌다(JS 표시 크기는 동일). 문서 2개를 source 탐색 범위 밖으로 잠시 옮겨 재빌드하면 위 원래 파일명/크기가 재현됐다. Tailwind의 자동 source 탐색에 문서 문자열도 영향을 줄 수 있음을 보여준다. 기준선 표는 새 문서가 없는 현행 코드의 값이며, PIN-25/26은 문서 후보 클래스의 영향과 실제 코드 분할 효과를 구분하고 필요하면 source 범위를 명시한다. 이번 단계에서는 스타일 설정을 변경하지 않았다.

## 현행 요청·상태 기준

다음은 `test/query-cache.test.mjs`의 MSW + QueryObserver 검증 결과다. 실제 browser navigation 전체의 GET 수를 측정한 것으로 해석하지 않는다.

| 시나리오 | 확인된 기준 |
| --- | --- |
| Exam 첫 QueryObserver | 은행 GET 1 |
| Exam fresh observer 재진입 | 추가 은행 GET 0 |
| stale Exam observer | 재조회 발생, 기존 데이터 사용 가능 |
| 동일 identity me 재검증 | fresh 은행 캐시 유지 |
| auth 만료/id/role/status 전환 | 보호 cache 제거 |
| logout 중 보호 GET, 늦은 me 응답 | 취소되어 이전 결과가 새 cache를 복원하지 않음 |
| logout 후 import 완료 | 보호 cache 복원 방지 |
| 이전 세션 admin mutation 오류 | 새 계정 로그아웃 방지 |
| 거절 POST 성공 후 목록 GET 실패 | 이미 처리한 사용자 재등장하지 않음 |
| 자기 계정 거절 | auth 캐시 즉시 rejected |
| 은행 생성 / 기본 은행 명시 갱신 | cache seed 및 재사용으로 추가 중복 GET 없음 |
| 관리자 목록 | staleTime 0, 승인/거절 후 활성 목록 invalidate |

추가 근거:

- `test/app-shell.test.mjs`: Shell/main/Skeleton/cached error/access error의 static markup. observer fetching은 일부 캐시 상태로 주입한다. 실제 DOM navigation/lazy/focus 검증이 아니다.
- `test/auth-routing.test.mjs`: role/status와 post-auth 경로의 순수 함수.
- `test/auth-mocks.test.mjs`: MSW 인증/승인/거절/Exam 접근·오류 계약.
- `test/api-client.test.mjs`: 오류 request ID 보존.
- `apps/api/test/*`: 메모리 repository 주입 기반 API 인증/상태 전이/오류/logging. 실 PostgreSQL/배포 쿠키 QA가 아니다.

현재 loader/action/lazy가 없으므로 부모·자식 Loader 병렬, Router Action 재검증, 빠른 navigation 취소, concurrent fetcher, 실제 URL 학습 복원/이탈은 기존 테스트의 보장 범위 밖이다.

## 설치 API에 대한 추가 실험

애플리케이션 코드를 바꾸지 않고 설치된 패키지를 import한 Node 실험으로 다음을 확인했다. 임시 실험은 제품 테스트 suite에 추가하지 않았다.

1. `QueryClient.query`는 fresh cache를 재사용한다.
2. invalidate(none) 후 `'static'` query는 기존 값을 사용하지만 `Infinity` query는 재조회한다.
3. staleTime 0 query 완료 후 기본 QueryObserver mount는 추가 queryFn을 실행한다. 따라서 in-flight dedup만으로 Loader → UI의 순차 중복 요청을 해결할 수 없다.
4. 같은 key의 미완료 `query()` 두 호출은 queryFn을 한 번 실행했다.
5. `createMemoryRouter`의 Data Mode middleware에서 context를 설정한 뒤 parent/child Loader가 같은 context를 읽었다. 기록된 순서는 `auth → parent → child → after`였다. parent/child의 완료 순서를 보장한다는 뜻은 아니다.

이 실험은 신규 설계의 핵심 API 선택을 확인한 것이며 완성된 auth coordinator, cancellation integration, Action 흐름을 검증한 것은 아니다.

## PIN-22~26 회귀 매트릭스

| 영역 | 최소 검증 |
| --- | --- |
| Loader/Query | missing/fresh/stale/invalidated, 명시 refresh, query + observer GET 수, shared GET에 하나의 navigation abort |
| Action | 입력 실패, POST 실패, POST 성공+GET 실패, 오래된 GET과 성공 patch 경쟁, 같은 row 중복·다른 row 병렬 |
| session | 모든 role/status, pending admin 예외, in-flight query/mutation/401/403, login/logout 경합, 동일 identity 보존, 권한 전환 즉시 은닉 |
| Exam | bank/view direct link·reload·back/forward, unknown view/없는 bank, import 후 GET 0, 이탈 후 늦은 성공, 학습 timer·snapshot 보존 |
| navigation/lazy | 최초 fallback과 Shell, content boundary 재시도, lazy import 실패, main 1개, 좁은 화면·focus·상태 안내 |
| 통합 | 루트 4개 gate, 잠금 파일/버전 기록, production 청크 전후 비교, 실API cookie/no-store/배포 SPA fallback |

실브라우저와 운영 환경 QA는 이번 설계 단계에서 실행하지 않았다. 후속 결과는 이 기준선을 덮어써서 과거 수치를 잃지 않도록 전후 열 또는 별도 검증 절에 기록한다.

## PIN-20 구현 후 통합 검증 (2026-10-01 KST)

사용자 요청에 따라 신규 `refactor/pin-20-data-flow`를 최신 develop에서 생성하고 PIN-21 설계 커밋을 이어받았다. 최초 main/develop 이력 비교는 main-only 16 / develop-only 1이었지만 `git diff origin/main origin/develop`는 비어 있어 tree는 같았다.

### 동일 소스/설치 기준의 번들 비교

develop `f7f259ca61dc16a2a22206f116b74d490f6b55e6`를 `/private/tmp/pin20-baseline`에 git archive로 추출하고 저장소 lockfile/pnpm 12.6.0으로 다시 빌드했다. 과거 PIN-21의 595.36 kB/gzip 183.97 kB를 이번 측정값으로 재사용하지 않는다. 이번 Vite 출력은 develop 603.58 kB/gzip 186.69 kB였다.

다음 표는 HTML의 module script와 modulepreload JS 파일을 합산한 **초기 dependency 합계**, 모든 production JS의 합계다. gzip은 양쪽 모두 Python gzip.compress(compresslevel=6, mtime=0)로 개별 파일을 동일 방식으로 압축해 합산했다. Vite가 출력한 gzip 추정과 혼합하지 않는다. 단위는 decimal kB다.

| 측정 | develop | PIN-20 |
| --- | ---: | ---: |
| 초기 JS 원본 | 603.58 | 542.74 |
| 초기 JS gzip | 184.54 | 168.03 |
| 전체 JS 원본 (lazy 포함) | 603.58 | 606.5 |
| 전체 JS gzip (lazy 포함) | 184.54 | 191.48 |

초기 JS 원본은 약 10.1%, 동일 gzip은 약 9% 감소했다. 전체 JS는 약 0.5%, 전체 gzip은 약 3.8% 증가했다. 초기 entry만 285.38 kB라고 보고하지 않으며 shared alert 256.76 kB/runtime 0.58 kB도 초기 비용에 포함한다. auth/admin/exam은 각각 독립 lazy 청크이고 최초 홈에서 모두 내려받지 않는다. 전체 코드가 사라진 것으로 해석하지 않는다. warning threshold나 vendor 수동 분할은 변경하지 않았다. 실제 장치 네트워크 latency/성능을 측정한 수치는 아니다.

### 요청·정합성 검증

실제 createMemoryRouter + MSW 테스트에서:

- 최초 Exam 진입은 auth/me 1 + bank GET 1. fresh bank 재진입은 bank GET 0, stale/명시적 invalidate 뒤 revalidation은 bank GET 1이다.
- middleware 접근 확인 이전에 보호 GET이 출발하지 않으며 anonymous/pending/rejected/member/admin 직접 진입을 검증했다.
- Action 성공 후 Router만 후속 조회를 시작한다. 승인 성공+목록 GET 500에서도 확정 항목이 되살아나지 않는다. 실패한 POST는 목록을 제거하지 않는다.
- 같은 ID의 concurrent fetcher는 추가 POST를 차단하고, 서로 다른 ID의 동시 성공 patch는 함께 보존한다.
- 오래된 pending GET이 성공 patch를 덮지 않는다. 이전 세션 GET/POST/오류/늦은 login은 새 세션 cache에 적용되지 않는다.
- navigation abort는 같은 Query를 기다리는 다른 consumer의 GET을 취소하지 않는다. StrictMode 임시 UI 구독 해제도 Loader 요청을 취소하지 않는다.
- multipart import는 응답 cache를 seed하고 새 bank URL로 이동한다. redirect 직후 새 bank GET은 0이다.
- URL canonicalization, view back, missing-bank 오류/재시도를 검증했다.

### 실행한 최종 gate

- `pnpm build` — Contracts/API/Web 성공, route lazy 청크 생성.
- `pnpm typecheck` — 성공.
- `pnpm test` — Web 46 + API 15 = 61개 통과.
- `pnpm lint` — 경고/오류 없음.
- `git diff --check` — 성공.

기존 static Shell 테스트는 handler와 middleware를 제거한 UI 전용 harness로 실행하며 실제 Router 실행은 별도 router-data 테스트가 검증한다. 테스트 수를 줄여 회귀 의미를 없애지 않았다. 모든 fixture/브라우저 데이터는 합성이다.

### 브라우저 QA 및 제한

Codex 브라우저에서 로컬 MSW 모드로 초기 홈, anonymous Exam→login returnTo, 합성 계정 login→Exam, 탭 view URL, 뒤로 가기 복원, 학습 시작과 이탈 확인창 표시, fetcher logout 후 보호 콘텐츠 제거를 확인했다. 초기 StrictMode 요청 취소 문제를 브라우저에서 발견·수정하고 별도 회귀 테스트로 고정했다. 확인창 취소 후 세션 보존은 별도 브라우저 assertion을 수행하지 않았다.

실제 운영 API의 쿠키/DB·다중 탭 경합, 모바일 실기기, 지연된 chunk 다운로드·새 배포 chunk 실패는 검증하지 않았다. 이 PR은 backend/contract/DB 변경이 없으며 기존 서버 인가를 유지한다. 코드 분할로 생긴 전체 gzip 증가와 위 QA 범위를 잔여 제한으로 PR에도 기록한다.

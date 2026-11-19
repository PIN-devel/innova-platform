# 플랫폼 버튼 적용 기준과 기록

상태: PIN-65 구현 및 브라우저 실측 검증 완료(2026-11-19, 경로는 `apps/web/` 기준). 공통 UI 진입점은 [디자인](design.md), 실제 단말기 포함 최종 출시 인수는 [PIN-64](https://linear.app/pin-dev/issue/PIN-64)가 소유한다.

## 작업 이력과 검증 경계

- **1차 구현 (`2026-10-27`)**: 공통 44×44 CSS px 하한, `Button`/`buttonVariants` 통합, 404 `Button render={<Link />}` 제거, MOTIFIN 중복 보완 정리 및 당시 전체 26개 소스 사용처 목록을 반영했다. 당시에는 브라우저 실측과 E2E 테스트를 보류했다.
- **2차 실측 및 결함 마감 (`2026-11-19`, PIN-89 E2E 연계)**: `develop` 최신 코드(`AI Lab`, `MOTIFIN 거래 관리` 포함 전체 28개 소스 파일)를 대상으로 Chromium 헤드리스 브라우저 실측(`320×568`, `390×844`, `1280×800`)과 E2E 회귀 검증을 수행해 남은 결함을 수정하고 완료 조건을 마감했다.
  - 수정 1: `/exam?view=settings`의 320px/390px 가로 넘침(`scrollWidth: 398`) 해소를 위해 `.exam-stack`과 `.exam-panel`에 `grid-template-columns: minmax(0, 1fr); min-width: 0;`, `.exam-panel label`에 `flex-wrap: wrap;`, `.exam-panel select/input`에 `min-width: 0;`과 `.exam-panel input[type="file"] { width: 100%; }` 적용
  - 수정 2: `RequireAiAdmin`(403)과 `RouteErrorBoundary`의 화면 이동 `<Button onClick={() => navigate(...)}>` 4건을 실제 `<Link className={buttonVariants(...)}>`로 통일
  - 수정 3: MOTIFIN `finance-spending-page.tsx`와 `business-panel.tsx`에 남아 있던 중복 `h-auto min-h-11 whitespace-normal` · `min-h-11` 클래스 정리
- **미실행 범위 경계**: 실제 물리 단말기(Android/iOS, 예: 갤럭시 S25 FE) 실기기 터치·시야각 검증은 이번 범위에서 수행하지 않았으며, [PIN-64](https://linear.app/pin-dev/issue/PIN-64)의 후속 실기기 인수 범위로 구분한다.

## 크기와 레이아웃 책임

- `src/styles.css`는 실제 `button`, `a[href]`, `summary` 박스에 최소 44×44 CSS px를 적용한다. 별도 투명 overlay나 pseudo-element로 클릭 영역을 확장하지 않는다. 직접 작성 버튼·닫기·토글·버튼 모양 링크와 일반 탐색 링크도 같은 하한을 사용한다. 숨겨진 skip link는 제외하고 포커스를 받으면 자체 utility로 44px 하한을 적용한다.
- 모바일과 데스크톱을 나누지 않아 터치 가능한 넓은 화면에도 같은 기준을 유지한다. 부모 flex/grid가 실제 공간을 배정해야 하며, `.exam-stack`·`.exam-panel`처럼 `<input type="file">`이 포함된 단일 열 grid는 `minmax(0, 1fr)`와 `min-width: 0`으로 320px 뷰포트 넘침을 차단한다.
- `Button`의 `default`/`sm`/`xs`는 최소 높이 44px, `lg`는 48px이며 내용이 길면 줄바꿈·높이 확장이 가능하다. `icon`/`icon-sm`/`icon-xs`는 44px 정사각, `icon-lg`는 48px 정사각이다. 작은 variant는 글자·아이콘·padding의 밀도 차이를 뜻하며 터치 영역을 줄이지 않는다. 최소 너비는 공통 CSS가 소유한다.
- 공통 Shell 주요 탐색은 줄바꿈을 허용한다. 홈 카드 링크는 `block` 레이아웃을 명시한다. Exam 번호 이동 버튼은 기존 30px 선언보다 공통 44px 하한을 우선하고 `flex-wrap`으로 행을 늘린다.
- MOTIFIN 달력은 440px 이하에서 카드의 좌우 여백·padding과 열 간격을 줄여 7열의 44px 공간을 확보하며, 320×568 뷰포트 실측에서도 가로 넘침과 인접 겹침이 없음을 확인했다. 월별 추이 버튼은 축소 대신 줄바꿈을 허용한다.
- Sonner의 20px 닫기 버튼도 공통 하한을 적용해 44×44px 영역을 유지한다. 닫기 영역을 toast 안쪽 우측 8px에 배치하고 본문 오른쪽 60px과 toast 최소 높이 60px를 확보해 320px/390px/1280px 모두 본문과 8px 간격(비중첩)을 유지한다. 팝업/시트는 실제 박스 안의 `Button`을 사용한다.

## Button과 Link 사용 규칙

설치된 `@base-ui/react` 1.8.0의 `Button`/`useButton` 코드를 기준으로 한다. [Base UI 공식 Button 문서](https://base-ui.com/react/components/button)는 링크에 `Button`의 `render`를 사용하지 않고 링크 자체를 스타일링하도록 안내한다. 이후 패키지 변경 시 설치 코드도 함께 확인한다.

```tsx
// 화면 이동: href와 링크 기본 동작을 Router Link가 소유한다.
import { Link } from "react-router";
import { Button } from "@/shared/ui/button";
import { buttonVariants } from "@/shared/ui/button-variants";

<Link to="/" className={buttonVariants({ variant: "outline" })}>홈으로</Link>
<Button type="button" onClick={retry}>다시 시도</Button>
<Button type="submit" disabled={busy}>저장</Button>
```

- `Button`은 기본 `nativeButton=true`를 유지하며 실제 `button`을 렌더링한다. Base UI 기본 `type`은 `"button"`이므로 폼 제출은 `type="submit"`을 명시한다. 직접 작성한 native `button`의 기존 `type`/폼 제출 동작은 보존한다.
- `nativeButton`은 실제 DOM 태그에 대한 선언이며 호출자가 `render`를 대체할 때 책임진다. `nativeButton={false}`는 비 `button` 요소에 버튼 역할·키보드 동작을 적용하는 용도다. 경고를 숨기기 위해 링크에 설정하는 해결책으로 사용하지 않는다.
- `Dialog.Close render={<Button ... />}`는 실제 `button`을 유지하므로 기본 `nativeButton=true`다. 404(`NotFoundPage`), `RequireAiAdmin`(403), `RouteErrorBoundary`의 화면 이동 요소는 모두 실제 `<Link to="..." className={buttonVariants(...)}>`를 사용한다. 부모 `Button` 안에 링크를 넣지 않는다.
- 링크는 `href`·Enter·수정키/새 탭 동작을 링크/Router에 맡긴다. 버튼용 `disabled`/`type`/`role`/Space 핸들러를 주입하지 않는다. 비활성 상태가 필요한 액션 버튼은 `<button>`의 `disabled` 속성과 시각적 불투명도 규칙으로 차단한다.

## 전체 사용처 적용 목록

2026-11-19 기준 `src/**/*.tsx`의 `Button`/`button`/`Link`/`NavLink`/`a`/`summary` 선언을 전수 확인했다. 아래 숫자는 소스 선언 수이며 `map`·조건부 렌더의 실제 DOM 개수와는 다르다. 공통 `Button`과 `button-variants.ts`는 별도 기준 구현이며 표에서 제외한다. 모든 행은 위 공통 CSS 하한과 포커스·비중첩 규칙을 상속한다.

| 소스 | Button | button | Link/NavLink/a | summary |
| --- | ---: | ---: | ---: | ---: |
| [src/app/motifin-content-layout.tsx](../src/app/motifin-content-layout.tsx) | 0 | 0 | 1 | 0 |
| [src/app/root-layout.tsx](../src/app/root-layout.tsx) | 0 | 0 | 12 | 0 |
| [src/app/route-error-boundary.tsx](../src/app/route-error-boundary.tsx) | 1 | 0 | 2 | 0 |
| [src/features/auth/auth-boundary.tsx](../src/features/auth/auth-boundary.tsx) | 2 | 0 | 2 | 0 |
| [src/features/auth/logout-button.tsx](../src/features/auth/logout-button.tsx) | 0 | 1 | 0 | 0 |
| [src/features/study-curriculum/content.tsx](../src/features/study-curriculum/content.tsx) | 0 | 0 | 1 | 0 |
| [src/features/study-curriculum/quiz.tsx](../src/features/study-curriculum/quiz.tsx) | 0 | 3 | 0 | 0 |
| [src/features/study-curriculum/subject-navigation.tsx](../src/features/study-curriculum/subject-navigation.tsx) | 0 | 0 | 2 | 0 |
| [src/pages/admin-users/index.tsx](../src/pages/admin-users/index.tsx) | 4 | 0 | 0 | 0 |
| [src/pages/ai/ai-page.tsx](../src/pages/ai/ai-page.tsx) | 3 | 0 | 0 | 0 |
| [src/pages/approval-pending/index.tsx](../src/pages/approval-pending/index.tsx) | 1 | 0 | 1 | 0 |
| [src/pages/auth/auth-pages.tsx](../src/pages/auth/auth-pages.tsx) | 2 | 0 | 2 | 0 |
| [src/pages/exam/curriculum-page.tsx](../src/pages/exam/curriculum-page.tsx) | 0 | 2 | 4 | 1 |
| [src/pages/exam/exam-page.tsx](../src/pages/exam/exam-page.tsx) | 3 | 32 | 0 | 0 |
| [src/pages/finance-analysis/finance-analysis-page.tsx](../src/pages/finance-analysis/finance-analysis-page.tsx) | 1 | 4 | 5 | 1 |
| [src/pages/finance-raw/business-panel.tsx](../src/pages/finance-raw/business-panel.tsx) | 2 | 0 | 5 | 0 |
| [src/pages/finance-raw/finance-raw-page.tsx](../src/pages/finance-raw/finance-raw-page.tsx) | 2 | 0 | 3 | 0 |
| [src/pages/finance-review/finance-review-page.tsx](../src/pages/finance-review/finance-review-page.tsx) | 5 | 4 | 10 | 1 |
| [src/pages/finance-schedule/finance-schedule-page.tsx](../src/pages/finance-schedule/finance-schedule-page.tsx) | 3 | 3 | 4 | 1 |
| [src/pages/finance-schedule/schedule-forms.tsx](../src/pages/finance-schedule/schedule-forms.tsx) | 4 | 0 | 1 | 1 |
| [src/pages/finance-security/finance-security-page.tsx](../src/pages/finance-security/finance-security-page.tsx) | 2 | 0 | 4 | 0 |
| [src/pages/finance-spending/classification-forms.tsx](../src/pages/finance-spending/classification-forms.tsx) | 6 | 0 | 0 | 2 |
| [src/pages/finance-spending/finance-spending-page.tsx](../src/pages/finance-spending/finance-spending-page.tsx) | 3 | 1 | 3 | 1 |
| [src/pages/finance-transactions/finance-transactions-page.tsx](../src/pages/finance-transactions/finance-transactions-page.tsx) | 7 | 3 | 2 | 0 |
| [src/pages/home/index.tsx](../src/pages/home/index.tsx) | 0 | 0 | 2 | 0 |
| [src/pages/not-found/not-found-page.tsx](../src/pages/not-found/not-found-page.tsx) | 0 | 0 | 1 | 0 |
| [src/pages/signup-rejected/index.tsx](../src/pages/signup-rejected/index.tsx) | 0 | 0 | 1 | 0 |
| [src/shared/ui/motifin/presentation.tsx](../src/shared/ui/motifin/presentation.tsx) | 1 | 0 | 3 | 0 |

`shared/ui/sonner.tsx`의 라이브러리가 생성하는 닫기·action 버튼에도 공통 하한을 적용한다. 개발 전용 React Query Devtools는 제품 인수 대상이 아니다. 새 도메인이나 라이브러리 컨트롤을 추가하면 이 목록과 고밀도 레이아웃을 함께 검토한다.

## 제품별 보완 정리

MOTIFIN의 공통 `Button` 최소 높이·자동 높이·줄바꿈 중복과 잔여 `min-h-11` 보완은 공통 `Button`/`styles.css` 구현으로 통합했다. 제품의 14px 가로 padding과 헤더별 padding은 디자인 차이여서 유지한다. 46px 달력·주요 링크, 54px 하단 탐색, 65px 거래 링크, 72px 관점·84px 카테고리 등 더 큰 영역은 기존 정보 구조를 유지한다. `<select>`/`<input>` 크기는 이번 공통 버튼 정리와 별개다.

## 검증 및 인수 기록 (2026-11-19)

1. **브라우저 실측 점검 (`Chromium` 헤드리스, `320×568` · `390×844` · `1280×800`)**:
   - **비로그인·오류/권한 화면**: `/`, `/login`, `/signup`, `/non-existent-route-404`, `/ai`(일반 회원 403)
   - **Exam Drill · Curriculum**: `/exam`(홈·유닛·오답·모의·설정 탭), 레슨 개념/플레이어, 모의 10문항 번호 버튼(`.exam-dots`), Curriculum 과목/장 목록·읽기 TOC 열림·Quiz
   - **MOTIFIN (합성 카드 XLSX·암호화 은행 PDF·반복 일정 적재 상태 포함)**: `/motifin/review`(근거 열림·입출금 시트 열림), `/motifin/spending`(가맹점 `<details>` 열림·분류 시트·카테고리 관리), `/motifin/analysis`(세부 열림), `/motifin/schedule`(달력 7열·반복 관리·회차 열림), `/motifin/import`, `/motifin/transactions`(상세 시트), `/motifin/security`
   - **관리·계정 상태 및 Toast**: 관리자 `/`, `/admin/users`, `/ai`, 승인 대기 `/approval-pending`, 가입 거절 `/signup-rejected`, Sonner toast 닫기 버튼(44×44px, 본문과 8px 간격 비중첩)
   - 위 대상 모두에서 유효 크기 ≥ 44×44px(보정 오차 43.5px 이상), 동일 레이어 인접 컨트롤 비중첩, 좌우 잘림/가로 넘침 부재, 접근 가능한 이름 존재, 중첩 인터랙티브 요소 부재, Base UI `nativeButton` 콘솔 경고 및 콘솔 에러 0건을 확인했다.
2. **키보드·수정키·폼·disabled 동작 확인**:
   - 404 `홈으로` 및 `/ai` 403 `Exam Drill 열기` 링크의 `Enter` 이동·중첩 버튼 부재·`href` 보존 확인
   - 404 `홈으로` 링크의 `Meta+Click`/`Control+Click` 새 탭 열기 확인
   - Exam Drill 탭 `Space` 키 전환 및 오답 0건 시 `오답 다시 풀기` 버튼 `disabled` 차단 확인
   - `/ai` 초기 `전송`·`대화 초기화` 버튼 `disabled` 상태, 로그인/MOTIFIN 폼 `type="submit"` 동작 확인
3. **자동 검증 명령**:
   - `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `git diff --check` 및 본 문서 상대 링크 존재 검사 통과
4. **미실행 범위 ([PIN-64](https://linear.app/pin-dev/issue/PIN-64) 인계 경계)**:
   - 실제 물리 단말기(Android/iOS, 갤럭시 S25 FE 등)에서의 실기기 터치·스크롤 확인은 미실행이다.

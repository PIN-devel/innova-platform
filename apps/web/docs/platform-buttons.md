# 플랫폼 버튼 적용 기준과 기록

상태: PIN-65 로컬 구현 기록 및 후속 UI 작업 기준. 2026-10-27, 경로는 `apps/web/` 기준이다. 공통 UI 진입점은 [디자인](design.md), 출시 통합 인수는 [PIN-64](https://linear.app/pin-dev/issue/PIN-64)가 소유한다.

## 작업 시작점과 검증 경계

사용자 요청으로 `feature/pin-54-cash-flow-mvp`의 `bc1d3b3f`에서 `feature/pin-65-platform-buttons`를 분기했다. PIN-54 로컬 커밋을 포함하며 원격 develop 기준으로 재구성하지 않았다. 이 기록은 commit·push·PR·병합·배포 완료를 뜻하지 않는다.

사용자가 토큰 절약을 위해 브라우저 사용과 별도 E2E 테스트 중단을 지시했다. 변경 전 404에서 Base UI의 nativeButton 경고 재현까지만 수행했다. 변경 후 모바일/데스크톱 시각·실측·키보드·수정키/새 탭·터치 검증과 실제 단말 인수는 미실행이다. 아래 적용 목록과 기존 테스트 통과만으로 모든 화면의 겹침·잘림·넘침이나 경고 해소를 실측 확인했다고 판단하지 않는다.

## 크기와 레이아웃 책임

- `src/styles.css`는 실제 `button`, `a[href]`, `summary` 박스에 최소 44×44 CSS px를 적용한다. 별도 투명 overlay나 pseudo-element로 클릭 영역을 확장하지 않는다. 직접 작성 버튼·닫기·토글·버튼 모양 링크와 일반 탐색 링크도 같은 하한을 사용한다. 숨겨진 skip link는 제외하고 포커스를 받으면 자체 utility로 44px 하한을 적용한다.
- 모바일과 데스크톱을 나누지 않아 터치 가능한 넓은 화면에도 같은 기준을 유지한다. 기존 데스크톱의 24–36px 버튼도 커지므로 후속 화면 인수에서 함께 확인한다. 부모 flex/grid가 실제 공간을 배정해야 하며 하한만으로 전체 레이아웃 적합성이 보장되지는 않는다.
- `Button`의 default/sm/xs는 최소 높이 44px, lg는 48px이며 내용이 길면 줄바꿈·높이 확장이 가능하다. icon/icon-sm/icon-xs는 44px 정사각, icon-lg는 48px 정사각이다. 작은 variant는 글자·아이콘·padding의 밀도 차이를 뜻하며 터치 영역을 줄이지 않는다. 최소 너비는 공통 CSS가 소유한다.
- 공통 Shell 주요 탐색은 줄바꿈을 허용한다. 홈 카드 링크는 block 레이아웃을 명시한다. Exam 번호 이동 버튼은 기존 30px 선언보다 공통 44px 하한을 우선하고 기존 flex-wrap으로 행을 늘린다.
- MOTIFIN 달력은 440px 이하에서 카드의 좌우 여백·padding과 열 간격을 줄여 7열의 44px 공간을 확보하도록 구성했다. 320px viewport까지의 CSS 폭 계산 기준이며 브라우저 실측은 미실행이다. 월별 추이 버튼은 축소 대신 줄바꿈을 허용한다.
- Sonner의 20px 닫기 버튼도 공통 하한을 적용한다. 닫기 영역을 toast 안쪽 우측 8px에 배치하고 본문 오른쪽 60px와 toast 최소 높이 60px를 확보한다. 팝업/시트는 실제 박스 안의 Button을 사용한다.

## Button과 Link 사용 규칙

설치된 `@base-ui/react` 1.8.0의 `Button`/`useButton` 코드를 조사했다. [Base UI 공식 Button 문서](https://base-ui.com/react/components/button)는 링크에 Button의 render를 사용하지 않고 링크 자체를 스타일링하도록 안내한다. 문서 사이트는 설치 버전보다 최신일 수 있으므로 이후 패키지 변경 시 설치 코드도 확인한다.

```tsx
// 화면 이동: href와 링크 기본 동작을 Router Link가 소유한다.
import { Link } from "react-router";
import { Button } from "@/shared/ui/button";
import { buttonVariants } from "@/shared/ui/button-variants";

<Link to="/" className={buttonVariants({ variant: "outline" })}>홈으로</Link>
<Button type="button" onClick={retry}>다시 시도</Button>
<Button type="submit" disabled={busy}>저장</Button>
```

- `Button`은 기본 nativeButton=true를 유지하며 실제 button을 렌더링한다. Base UI 기본 type은 button이다. 폼 제출은 `type="submit"`을 명시한다. 직접 작성한 native button의 기존 type/폼 제출 동작은 바꾸지 않았다.
- `nativeButton`은 실제 DOM 태그에 대한 선언이며 호출자가 render를 대체할 때 책임진다. `nativeButton={false}`는 비 button 요소에 버튼 역할·키보드 동작을 적용하는 용도다. 경고를 숨기기 위해 링크에 설정하는 해결책으로 사용하지 않는다.
- `Dialog.Close render={<Button ... />}`는 실제 button을 유지하므로 기본 nativeButton=true다. 404의 유일한 `Button render={<Link ... />}`는 실제 Link에 `buttonVariants()`를 적용하도록 교체했다. 부모 Button 안에 링크를 넣지 않는다.
- 링크는 href·Enter·수정키·새 탭 동작을 링크/Router에 맡긴다. 버튼용 disabled/type/role/Space 핸들러를 주입하지 않는다. 현재 비활성 링크 사용처는 없다. 이후 비활성 탐색이 필요하면 href 제거·설명·탐색 차단 정책을 별도 설계하며 `disabled` 속성만으로 차단된다고 가정하지 않는다.

## 전체 사용처 적용 목록

2026-10-27 `src/**/*.tsx`의 Button/button/Link/NavLink/a/summary 선언을 확인했다. 아래 숫자는 소스 선언 수이며 map·조건부 렌더의 실제 DOM 개수와 다르다. 공통 Button과 `button-variants.ts`는 별도 기준 구현이며 표에서 제외한다. 모든 행은 위 공통 CSS 하한과 포커스 규칙을 상속한다. 기존 클릭·submit·disabled·라우팅 handler는 보존했다.

| 소스 | Button | button | Link/NavLink/a | summary |
| --- | ---: | ---: | ---: | ---: |
| [src/app/motifin-content-layout.tsx](../src/app/motifin-content-layout.tsx) | 0 | 0 | 1 | 0 |
| [src/app/root-layout.tsx](../src/app/root-layout.tsx) | 0 | 0 | 11 | 0 |
| [src/app/route-error-boundary.tsx](../src/app/route-error-boundary.tsx) | 3 | 0 | 0 | 0 |
| [src/features/auth/auth-boundary.tsx](../src/features/auth/auth-boundary.tsx) | 1 | 0 | 0 | 0 |
| [src/features/auth/logout-button.tsx](../src/features/auth/logout-button.tsx) | 0 | 1 | 0 | 0 |
| [src/features/study-curriculum/content.tsx](../src/features/study-curriculum/content.tsx) | 0 | 0 | 1 | 0 |
| [src/features/study-curriculum/quiz.tsx](../src/features/study-curriculum/quiz.tsx) | 0 | 3 | 0 | 0 |
| [src/features/study-curriculum/subject-navigation.tsx](../src/features/study-curriculum/subject-navigation.tsx) | 0 | 0 | 2 | 0 |
| [src/pages/admin-users/index.tsx](../src/pages/admin-users/index.tsx) | 4 | 0 | 0 | 0 |
| [src/pages/approval-pending/index.tsx](../src/pages/approval-pending/index.tsx) | 1 | 0 | 1 | 0 |
| [src/pages/auth/auth-pages.tsx](../src/pages/auth/auth-pages.tsx) | 2 | 0 | 2 | 0 |
| [src/pages/exam/curriculum-page.tsx](../src/pages/exam/curriculum-page.tsx) | 0 | 2 | 4 | 1 |
| [src/pages/exam/exam-page.tsx](../src/pages/exam/exam-page.tsx) | 3 | 32 | 0 | 0 |
| [src/pages/finance-analysis/finance-analysis-page.tsx](../src/pages/finance-analysis/finance-analysis-page.tsx) | 1 | 4 | 5 | 1 |
| [src/pages/finance-raw/business-panel.tsx](../src/pages/finance-raw/business-panel.tsx) | 2 | 0 | 4 | 0 |
| [src/pages/finance-raw/finance-raw-page.tsx](../src/pages/finance-raw/finance-raw-page.tsx) | 2 | 0 | 3 | 0 |
| [src/pages/finance-review/finance-review-page.tsx](../src/pages/finance-review/finance-review-page.tsx) | 5 | 4 | 9 | 1 |
| [src/pages/finance-schedule/finance-schedule-page.tsx](../src/pages/finance-schedule/finance-schedule-page.tsx) | 3 | 3 | 4 | 1 |
| [src/pages/finance-schedule/schedule-forms.tsx](../src/pages/finance-schedule/schedule-forms.tsx) | 4 | 0 | 1 | 1 |
| [src/pages/finance-security/finance-security-page.tsx](../src/pages/finance-security/finance-security-page.tsx) | 2 | 0 | 4 | 0 |
| [src/pages/finance-spending/classification-forms.tsx](../src/pages/finance-spending/classification-forms.tsx) | 6 | 0 | 0 | 2 |
| [src/pages/finance-spending/finance-spending-page.tsx](../src/pages/finance-spending/finance-spending-page.tsx) | 3 | 1 | 2 | 1 |
| [src/pages/home/index.tsx](../src/pages/home/index.tsx) | 0 | 0 | 1 | 0 |
| [src/pages/not-found/not-found-page.tsx](../src/pages/not-found/not-found-page.tsx) | 0 | 0 | 1 | 0 |
| [src/pages/signup-rejected/index.tsx](../src/pages/signup-rejected/index.tsx) | 0 | 0 | 1 | 0 |
| [src/shared/ui/motifin/presentation.tsx](../src/shared/ui/motifin/presentation.tsx) | 1 | 0 | 3 | 0 |

`shared/ui/sonner.tsx`의 라이브러리가 생성하는 닫기·action 버튼에도 공통 하한을 적용한다. 개발 전용 React Query Devtools는 제품 인수 대상이 아니다. 새 도메인이나 라이브러리 컨트롤을 추가하면 이 목록과 고밀도 레이아웃을 함께 검토한다.

## 제품별 보완 정리

MOTIFIN의 공통 Button에 있던 최소 높이·자동 높이·줄바꿈 중복은 공통 구현으로 옮기고, 가져오기·분류 저장·카테고리 변경 버튼의 개별 `min-h-11`도 제거했다. 제품의 14px 가로 padding과 헤더별 padding은 디자인 차이여서 유지한다. 46px 달력·주요 링크, 54px 하단 탐색, 65px 거래 링크, 72px 관점·84px 카테고리 등 더 큰 영역은 기존 정보 구조를 유지한다. select/input 크기는 이번 공통 버튼 정리와 별개다.

## 검증과 다음 인수

최종 코드 기준 실행 결과:

- `pnpm --filter @innova/contracts build` — 통과(앱별 검증 전 기존 계약 빌드 준비).
- `pnpm --filter @innova/web test` — 기존 테스트 77개 통과, 실패/skip 0. 별도 E2E 또는 신규 테스트는 추가하지 않았다.
- `pnpm lint` — Contracts/API/Web 통과, 경고 없음. 스타일 함수를 `shared/ui/button-variants.ts`로 분리해 Fast Refresh의 상수 export 경고를 해소했다.
- `pnpm --filter @innova/web build` — TypeScript 검사와 Vite production build 통과. 이 문서도 Tailwind 탐색 입력에 포함한 상태로 빌드했다.
- `git diff --check`와 이 문서/디자인 문서의 로컬 링크 존재 검사 — 통과.
- React 검토 — 공유 스타일은 shared에 유지, 새 hook/상태/요청·세션 경계 변경 없음, 실제 링크와 native button의 분리 및 기존 handler/disabled/type 보존 확인.

브라우저·별도 E2E·실제 단말 검증은 사용자 요청에 따라 수행하지 않았다. 변경 전 404 경고 재현 이후 변경 후 브라우저 확인은 하지 않았다. 이러한 인수를 재개하려면 다음 작업의 범위에 포함해야 한다.

PIN-64 인수 항목은 320/390/넓은 화면의 공통 Shell·인증·관리·404·Exam 번호/탭·Curriculum 메뉴/Quiz·MOTIFIN 달력/차트/시트/분류 폼·toast 닫기다. 실제 영역의 44px 하한·인접 비중첩·가로 넘침·포커스·클릭/Enter/Space·폼 제출/disabled·링크 수정키/새 탭과 콘솔 경고 부재를 확인한다. 이 작업의 미실행 인수를 기존 PIN-54/64 출시 승인과 혼동하지 않는다.

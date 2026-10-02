# Innova Platform UI 규칙

상태: 현행 UI 기준. 코드·자산 경로는 `apps/web/` 기준이다.

이 문서는 모든 기능에 적용하는 공통 디자인 원칙이다. 토큰의 실제 값과 Tailwind 매핑은 `src/styles.css`, 재사용 가능한 구현은 `src/shared/ui/`가 기준이다.

## 브랜드 마크

- 확정된 Forward N의 SVG 원본은 `public/brand/innova-mark.svg`이며, favicon과 App Shell이 같은 파일을 참조한다.
- 원본의 파란색(`#0750f9`)과 내부 화살표 모양, 투명한 여백을 유지한다. 이 색은 브랜드 자산 자체의 색이며 버튼·링크 등의 UI 색은 아래의 semantic token을 따른다.
- 작은 크기에서 내부 여백이 사라지지 않도록 임의로 잘라내거나 장식·그림자를 추가하지 않는다. 밝은 표면에 사용하는 것을 기본으로 하고, 배경과의 대비를 확인한다.

## 원칙

- 기존의 차분한 blue/slate 계열과 정보 위계를 유지한다. 같은 의미는 같은 semantic token과 상태 표현으로 표시한다.
- 텍스트, 배경, 테두리의 의미가 먼저다. 새 색을 고르기 전에 아래 역할과 기존 컴포넌트를 확인한다.
- 작은 화면에서도 읽기 쉬운 크기와 줄바꿈을 유지하고, 색만으로 상태를 전달하지 않는다.

## 색상과 상태

| 역할 | 사용 기준 |
| --- | --- |
| `background` / `foreground` | 페이지 바탕과 기본 텍스트 |
| `card` / `card-foreground`, `popover` / `popover-foreground` | 구분된 표면과 그 위의 텍스트 |
| `primary` / `primary-foreground` | 주요 동작, 링크, 강조와 그 위의 텍스트 |
| `secondary` / `secondary-foreground` | 보조 동작과 표면 |
| `muted` / `muted-foreground` | 조용한 표면, 설명, 보조 정보 |
| `accent` / `accent-foreground` | 강조 표면 및 해당 표면의 텍스트 |
| `border`, `input`, `ring` | 경계, 입력 필드, 키보드 포커스 |
| `destructive` | 오류·위험 상태와 검증 메시지 |
| `success` / `success-foreground` / `success-border` | 완료·정답 상태와 그 배경·경계 |
| `warning` / `warning-foreground` / `warning-border` | 확인이 필요한 상태 안내와 그 배경·경계 |

기본 상태는 컴포넌트 기본 스타일을 따른다. hover는 의미를 유지하면서 표면이나 경계를 변화시키고, focus-visible은 `ring`으로 식별한다. disabled는 동작을 막고 시각적으로 낮추되 텍스트를 읽을 수 있게 한다. 오류는 `destructive`와 메시지, 필드에는 `aria-invalid`를 함께 사용한다. 경고는 오류와 구별해 `Alert`의 `warning` variant를 사용한다. 로딩은 기존 `LoadingState`·`Skeleton` 및 동작 중 버튼 문구를 활용한다.

## 글꼴, 간격, 모서리

- 기본 글꼴은 Tailwind `font-sans`이다. 별도 제목 글꼴은 없다. 페이지 제목은 크기와 굵기로 본문과 구분하고, `CardTitle`은 카드 안의 제목에 사용한다.
- 본문은 기본 전경색을 쓰고, 설명과 메타 정보에는 `text-muted-foreground`를 쓴다. 링크는 `text-primary`와 hover·focus 상태로 식별한다.
- 간격은 Tailwind 기본 spacing scale의 `gap-*`, `p-*`, `m-*` 등을 사용한다. 별도의 전역 간격 토큰은 만들지 않는다.
- 모서리는 `styles.css`의 `radius` 계열과 Tailwind `rounded-*`를 사용한다. 같은 컴포넌트 안에서는 기존 radius를 유지한다.

## 컴포넌트와 예외

버튼은 `shared/ui/button`, 카드형 표면은 `card`, 입력과 레이블은 `input`·`label`, 상태 메시지는 `alert`를 우선 재사용한다. 페이지에서 변형이 필요하면 기존 variant와 semantic token을 조합한다. 동일한 의미의 색과 상태를 페이지별 팔레트 값으로 다시 만들지 않는다.

기능별 고유 레이아웃과 학습 상태 표현은 허용하되, 색상·텍스트·테두리·포커스의 공통 의미는 semantic token을 따른다. 기능별 상태가 공통 역할에 없는 색을 필요로 하면 해당 의미에 맞는 semantic token을 사용하고, 새 token은 반복되는 공통 역할이 확인될 때만 `styles.css`에 정의한다. 현재는 light theme만 제공하며 테마 전환은 이 문서의 범위 밖이다.

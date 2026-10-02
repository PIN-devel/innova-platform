# 문서 관리 정책

상태: 현행 정책. 적용 범위: 저장소 전체.

## 역할과 위치

| 위치 | 소유 내용 |
| --- | --- |
| 루트 `README.md` | 설치·실행·공통 검증과 문서 진입점 |
| 루트 `AGENTS.md` | AI가 항상 적용할 공통 핵심 지침과 조건별 참조 |
| `apps/<app>/README.md` | 해당 앱의 실행·환경·문서 진입점 |
| `apps/<app>/AGENTS.md` | 해당 앱에만 적용하는 구현·검증 지침 |
| `docs/*.md` | 여러 앱에 공통인 문서·AI·Git·Linear 운영 정책 |
| `apps/<app>/docs/*.md` | 해당 앱의 상세 설계·디자인·측정 기록 |

앱 문서를 루트로 모으거나 같은 규칙을 여러 문서에 복사하지 않는다. 내용이 없는 디렉터리와 목록만 중복하는 README는 만들지 않는다. API는 기존 README/AGENTS로 충분하므로 별도 docs가 없다.

## 파일명과 상태

- 직접 작성하는 일반 문서·디렉터리는 소문자 kebab-case와 `.md`를 사용한다.
- `README.md`, `AGENTS.md`, `LICENSE` 및 도구가 요구하는 파일은 예외다. AGENTS의 적용 위치를 이동하지 않는다.
- 현행 기준은 안정적인 이름을 유지한다. 초안은 파일명에 final/v2/draft를 누적하지 않고 본문 상태로 구분한다.
- 과거 기록은 상태·측정일·기준 커밋·실행 환경·제한을 기록한다. 같은 종류의 기록이 늘면 날짜를 포함한 kebab-case 이름으로 구분한다.
- 소스·테스트·생성 파일의 이름은 루트/앱 AGENTS 규칙을 유지한다. 문서 정리를 이유로 source symbol을 바꾸지 않는다.

## 현재 문서와 이동 결정

| 문서 | 역할·처리 |
| --- | --- |
| 루트·API·Web README | 현재 위치 유지; 실행·문서 탐색 |
| 루트·API·Web AGENTS | 현재 위치 유지; 공통/앱 지침의 적용 경계 |
| `docs/documentation-policy.md` | 이 문서; 위치·명명·참조의 기준 |
| `docs/ai-workflow.md` | 조사·구현·검증·전달과 읽기 범위 |
| `docs/git-workflow.md` | Git 병합·릴리스·정리 기준 |
| `docs/linear-workflow.md` | 이슈 관리와 자동화 경계 |
| `apps/web/docs/architecture.md` | 현행 Web 구조; 앱이 소유 |
| `apps/web/docs/design.md` | 현행 Web UI 기준; 앱이 소유 |
| `apps/web/docs/architecture-baseline.md` | PIN-21 기준선/PIN-20 검증의 과거 기록; 일반 작업에서 읽지 않음 |

PIN-31 이동표(과거 경로 기록):

| 이전 | 현재 |
| --- | --- |
| `apps/web/ARCHITECTURE.md` | `apps/web/docs/architecture.md` |
| `apps/web/DESIGN.md` | `apps/web/docs/design.md` |
| `apps/web/architecture-baseline.md` | `apps/web/docs/architecture-baseline.md` |

## 변경과 검증

문서의 소유 범위부터 결정하고 제목·상태·필요한 절만 작성한다. 정책은 이곳, 작업별 계획/AC/결과는 Linear, 실제 구현은 소스가 소유한다. 초안이 확정되면 원문 링크로 대체하고 이슈에 전문을 계속 복제하지 않는다.

이동 시 Markdown 상대 링크와 앵커, AGENTS의 경로 문자열, README 진입점, 코드·설정의 문서 참조를 함께 갱신한다. 문서 내부 코드·자산 경로의 기준 디렉터리도 명시한다. 외부 Linear의 과거 기록은 변경 이력을 보존하고 최종 경로 안내를 보완한다.

문서만 바뀌면 내부 링크·앵커·오래된 경로·파일명·diff와 원문 보존을 검사한다. 실행 코드/계약/설정/의존성이 같으면 전체 앱 테스트·빌드·브라우저 QA를 반복하지 않는다. 그런 변경이 함께 있으면 해당 AGENTS의 검증을 따른다.

# Git 운영 정책

상태: 현행 정책. 브랜치·PR·릴리스·정리 작업에 적용한다.

## 분기와 병합

| 흐름 | 분기 기준 | 기본 병합 방식 |
| --- | --- | --- |
| `feature/*`, `fix/*`, `refactor/*`, `chore/*` → develop | 최신 origin/develop | Squash and merge |
| develop → main | 검증한 develop | Create a merge commit |
| `release/*` → main | 검증할 develop 커밋 | Create a merge commit |
| `hotfix/*` → main | 최신 origin/main | Create a merge commit |
| main 또는 이력을 연결한 `sync/*` → develop | 최신 develop에 main을 merge | Create a merge commit |

일회성 작업의 커밋 보존이 필요하면 PR에 이유를 기록하고 merge commit을 사용할 수 있다. 장기 브랜치 사이에서는 squash/GitHub rebase merge를 사용하지 않는다. 파일 tree가 같아도 원본 커밋의 조상 관계가 연결된 것은 아니다.

일반 작업 이름은 `<type>/pin-<number>-<description>`, 릴리스는 `release/<yyyy-mm-dd>-<description>`을 권장한다. slash로 구분한 각 부분은 소문자 kebab-case로 작성한다. Linear 생성 이름은 이 규칙에 맞게 선택한다.

## 작업과 PR

1. 기존 diff·upstream을 확인하고 작업을 보존한다. 원격 fetch 후 최신 기준에서 새 브랜치를 만든다.
2. 대상 대비 diff와 관련 AGENTS 검증을 확인한다. PR에 문제·최종 변경·검증·제한을 요약한다.
3. 일반 작업/릴리스는 해당 Linear 이슈를 연결한다. 완결되는 이슈와 부분 기여를 구분하며 [Linear 운영](./linear-workflow.md)을 따른다.
4. 병합 직전 현재 head SHA, 충돌, 대상 브랜치, 필수 체크와 방식을 확인한다. 체크 통과는 현재 head를 기준으로 판단한다.
5. 병합 결과와 원격 반영을 확인하고 종료 기록을 남긴다. 코드·계약·migration·배포가 바뀌지 않는 문서 PR에 운영 배포 검증을 추가하지 않는다.

이미 squash된 작업 브랜치는 재사용하지 않는다. 개인 작업의 rebase와 공동 작업의 merge를 구분하며 main/develop 공개 이력을 rebase·force push로 재작성하지 않는다.

## 릴리스와 역반영

일반 릴리스는 develop → main PR 하나를 merge한다. 후보 동결이 필요할 때만 release 브랜치를 사용한다. main 기반 브랜치에 develop 파일 tree를 복사하는 우회 릴리스는 사용하지 않는다.

main에 릴리스 merge commit만 추가되고 독립 변경이 없으면 역동기화 PR을 매번 만들지 않는다. ahead/behind 수치만으로 충돌이나 동기화 필요성을 판단하지 않는다.

release에서 추가한 수정이나 main 독립 변경은 main → develop 또는 main을 merge한 sync PR로 역반영한다. develop에 반영되었음을 확인한 뒤 해당 작업 브랜치를 종료한다.

Hotfix는 최신 main에서 최소 수정 → main merge → 필요한 운영 결과 확인 → develop 역반영 merge 순으로 완료한다. 충돌은 최신 develop 기반 sync 브랜치에 main을 merge해 해결한다. 반복 cherry-pick·tree 복사로 장기 브랜치 동기화를 대체하지 않는다.

운영 배포·DB migration·환경 설정이 AC에 포함되면 적용 순서와 실제 결과를 확인한다. PR 병합이나 Vercel 체크만으로 운영 적용까지 완료되었다고 기록하지 않는다.

## 보호 설정 확인

2026-10-02 원격 확인 기준:

| 설정 | main | develop |
| --- | --- | --- |
| 허용 방식 | merge | squash, merge |
| 선형 이력 강제 | 없음 | 없음 |
| PR·대화 해결 필수, 삭제/force push 차단 | 적용 | 적용 |
| 필수 체크 | Vercel, GitGuardian Security Checks | GitGuardian Security Checks |
| 필수 승인 수 / 체크의 최신 base 요구 | 0 / 꺼짐 | 0 / 꺼짐 |

[main ruleset](https://github.com/PIN-devel/innova-platform/rules/24040542), [develop ruleset](https://github.com/PIN-devel/innova-platform/rules/24040617)이 실제 설정의 기준이다. 저장소 병합 후 자동 삭제·auto-merge는 꺼져 있다. 정책이 출발 브랜치별 방식을 자동 강제하지 않으며 자체 코드 검증 CI도 아직 없다. 기존 Linear 상태 자동화는 별도로 존재한다.

설정이 변하면 관련 값만 확인하고 문서를 갱신한다. ruleset 일시 해제를 상시 병합 절차로 사용하지 않는다. 설정/CI/자동 삭제를 새로 구현하는 작업은 별도 범위다.

## 브랜치 정리

작업 upstream은 같은 원격 작업 브랜치를 사용한다. fetch/prune 후 기준 브랜치는 fast-forward로 갱신하고, 실패하면 원인을 조사한다. 기존 작업을 reset으로 덮어쓰지 않는다.

main/develop은 유지한다. 병합된 일회성 브랜치는 미반영 후속 작업 확인 뒤 승인된 정리 범위에서 삭제한다. 병합 없이 닫힌 PR은 폐기 의도를 확인한다.

Squash 때문에 `git branch -d`가 거부될 수 있다. PR 병합 결과와 실제 변경 반영을 확인하며, 기준 브랜치가 더 진행되었을 때 전체 tree 일치만을 조건으로 삼지 않는다.

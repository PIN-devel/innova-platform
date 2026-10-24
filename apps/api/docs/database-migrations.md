# DB 스키마 변경과 복구 준비

상태: 현행 지침. API의 DB 스키마·migration 변경과 해당 릴리스에 적용한다. 정책 원문은 이 문서, 변경별 계획·실행 결과는 해당 Linear 이슈가 소유한다.

## 작업 전 연결 대상 사용자 확인

스키마 소스 수정·migration 생성·DB 연결을 시작하기 전에, 사용자가 로컬 `apps/api/.env`의 `DATABASE_URL`이 이번 검증용 Neon dev 브랜치의 Connection string인지 확인해 주어야 한다. dev는 해당 스키마 변경을 검증할 Production 기준으로 준비한다. 이 확인은 문서만 작성하거나 DB에 접근하지 않는 읽기 작업에는 요구하지 않는다.

- 사용자에게 확인할 것은 파일 경로와 검증용 dev 대상이다. Connection string·비밀번호·`.env` 원문을 대화, 로그, PR, Linear에 요청하거나 복제하지 않는다.
- 확인 전에는 `.env`를 임의로 교체하거나 DB 연결·migration·운영 쓰기를 수행하지 않는다. 대상이 불명확하거나 Production이면 dev 준비와 사용자 확인을 기다린다.
- 셸이나 실행 도구의 환경 변수가 `.env`를 덮어쓰는지도 비밀 값 출력 없이 확인한다. 실제 실행 대상이 확인받은 대상과 다르면 중단한다.
- 같은 작업에서 대상이 유지되면 확인을 반복 요청하지 않는다. dev 재생성·Connection string 교체·연결 대상 변경 시 다시 확인받는다.
- Linear에는 확인 일시와 비밀 값이 아닌 project·branch·database 식별 정보, 사용자 확인 사실만 남긴다. dev 확인은 Production 적용 승인이 아니다.

## 변경 준비와 dev 검증

1. Production 기준 commit·migration 적용 이력과 dev 생성 기준·시점을 기록한다. 오래된 dev가 현재 운영 상태를 대표한다고 가정하지 않는다.
2. `src/db/schema.ts` 변경과 Drizzle이 생성한 후속 migration SQL을 함께 검토한다. 이미 적용한 migration은 수정·재생성하지 않는다. 데이터 삭제, 제약조건, 기본값, 잠금과 기존 API에 미치는 영향을 확인한다.
3. 변경별 복구 방법을 아래 기준으로 선택하고 실행 순서·데이터 영향을 준비한다. 되돌릴 수 없는 변경은 보존·복구 수단을 확보하기 전 적용하지 않는다.
4. 확인된 dev에 migration을 적용한다. 적용 전후 schema와 migration 이력을 확인하고 기존 데이터 보존, 새 API 동작, 이전 API와 새 schema의 호환성을 검사한다.
5. dev에서 변경 후 발생할 수 있는 쓰기를 재현한 뒤 선택한 복구 방법을 시험한다. 복구 후 데이터 보존·정상 동작·허용한 손실 범위를 확인한다. 실패·재시도 검증은 확인된 적용 이력과 실제 transaction 동작을 기준으로 한다.
6. 실제 실행한 테스트·결과·미검증 항목을 Linear에 남긴다. PGlite와 합성 fixture는 빠른 회귀 검증에 활용하되 실제 Neon dev 검증과 구분한다.

Production 기반 dev의 실제 데이터는 승인된 Neon 검증 범위에서 취급한다. 비공개 콘텐츠·사용자 데이터를 저장소, 테스트 fixture, PR, Linear로 복제하지 않는다. dev의 접근 권한·유지 기간·비용과 검증 종료 후 정리 담당자·시점을 변경 이슈에 기록한다.

## 변경별 복구 방법

API rollback은 DB rollback이 아니다. DB 변경을 자동으로 반대로 실행하는 공통 절차를 두지 않고, 변경마다 다음 중 적절한 방법을 선택한다.

| 상황 | 준비할 방법 | 확인할 내용 |
| --- | --- | --- |
| 새 schema가 이전 API와 호환됨 | DB는 유지하고 API만 이전 버전으로 복구 | 복구할 commit·배포 artifact와 이전 API의 읽기·쓰기 동작 |
| 제약조건·변환 로직 등에 문제가 있음 | 후속 migration으로 원인 수정 | 수정 SQL, 적용 순서, 변경 후 데이터 보존과 재실행 판단 |
| 삭제·손상 등으로 데이터 복구가 필요함 | 보존 자료나 Neon의 복구 기능을 이용한 복구 | 복구 가능 시점·범위·쓰기 중단·허용할 손실·복구 후 데이터 처리 |

가능하면 추가 → 코드·데이터 전환 → 안정화 → 제거로 배포를 나누어 이전 API와의 호환 기간을 확보한다. 추가한 컬럼이라도 기본값·제약조건·새 쓰기 방식에 따라 호환되지 않을 수 있으므로 실제 동작을 확인한다.

Neon 시점 복구는 schema만 되돌리는 작업이 아니다. 선택한 시점 이후의 쓰기와 같은 branch의 다른 DB에도 영향을 줄 수 있다. 실제 프로젝트의 복구 지원 조건과 이력 보존 기간을 확인하고, 현재 상태 보존·필요한 데이터 재반영·정상화 확인까지 계획한다. 데이터 복구용 SQL이 필요하면 검토·테스트 가능한 파일을 PR에 포함하고 Linear의 복구 계획에서 링크한다. 적용된 migration이나 적용 이력을 임의로 고쳐 복구된 것처럼 처리하지 않는다.

## 운영 적용과 적용 후 확인

1. dev 검증 결과와 복구 계획을 검토하고, 승인된 Production 대상·migration 파일·배포 commit·적용 순서를 확인한다. Render build에 migration이 포함되어 있으면 배포 트리거도 DB 쓰기를 포함하는 실행으로 취급한다.
2. 운영 적용 직전의 migration 이력과 복구 기준 시점, 해당 변경에서 필요한 데이터 보존 수단을 확인한다. dev 생성 후 운영 상태에 관련 변경이 생겼다면 검증 범위를 재평가한다.
3. 승인된 범위에서 migration과 API 배포를 수행한다. 자동 또는 수동 적용 방법은 실제 배포 설정을 기준으로 기록하고 이 문서만으로 설정을 변경하지 않는다. schema migration과 비공개 콘텐츠 import는 별도 실행으로 관리한다.
4. DB 적용 이력·전후 schema·API 배포 버전·핵심 읽기/쓰기를 직접 확인한다. 로컬 테스트 통과, DB 적용, 배포 성공, 사용자 QA는 각각 별도 증거로 기록한다.
5. 실패하면 후속 배포·재시도를 멈추고 먼저 실제 DB 적용 상태와 현재 API 버전을 확인한다. 통신 오류를 미적용으로 단정하지 않는다. 준비한 조건에 따라 API rollback·후속 migration·데이터 복구를 선택하고, 정상화 확인과 남은 영향을 기록한다.

## 변경별 Linear 기록 양식

스키마 변경을 소유한 이슈에 아래 항목을 작성하고 진행에 따라 갱신한다. PR에는 변경·검증 요약과 이 기록의 링크를 남긴다. 실제 SQL·테스트의 원문은 저장소에 두며 비밀 값·실제 데이터는 기록하지 않는다.

```text
대상: Neon project / branch / database, 기준 commit / migration
연결 확인: apps/api/.env의 dev 대상에 대한 사용자 확인 일시
dev 기준: Production에서 dev를 준비한 시점과 적용 이력
변경 영향: 호환성, 데이터 변환·손실, 잠금·쓰기 영향
dev 검증: 실행한 테스트, schema·데이터 확인 결과, 미검증 항목
복구 조건: 중단·복구 판단에 사용할 증상과 기준
복구 방법: API rollback / 후속 migration / 데이터 복구
복구 순서: commit·SQL 링크, 쓰기 중단 여부, 정상화 확인 방법
데이터 영향: 변경 이후 쓰기의 보존·재반영·허용 손실
리허설: dev에서 실행한 복구와 변경 후 데이터 확인 결과
운영 계획: 승인된 대상·순서, 복구 기준 시점·보존 수단
운영 결과: 실제 migration 이력·배포 버전·적용 후 확인·사용자 QA
dev 정리: 접근·비용·유지 기간, 담당자·정리 시점
```

새로운 스키마 변경의 완료 판단은 해당 이슈의 실제 범위를 따른다. 이 지침의 작성 완료만으로 이후 변경의 dev 검증·복구 리허설·운영 적용을 수행했다고 기록하지 않는다.

## 관련 기준과 참고

- [API 변경 지침](../AGENTS.md)
- [문서 관리 정책](../../../docs/documentation-policy.md)
- [Linear 운영 정책](../../../docs/linear-workflow.md)
- [Git 운영 정책](../../../docs/git-workflow.md)
- [Neon branching](https://neon.com/docs/introduction/branching)
- [Neon 시점 복구](https://neon.com/docs/postgres/backup-restore/branch-restore)
- [Render 배포 단계](https://render.com/docs/deploys#deploy-steps)
- [Render rollback](https://render.com/docs/rollbacks)

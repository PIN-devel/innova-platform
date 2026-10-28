# MOTIFIN 출시 검증과 운영 전환

상태: PIN-68/69/70 구현을 포함한 PIN-64/PIN-54 출시 절차. 2026-10-28 사용자가 최소 개발 테스트 후 출시와 운영 기능 테스트 직접 수행을 요청했다. 아래 2026-10-27 보류 기록은 과거 상태이며 현재 결과는 최신 절과 Linear/PR을 따른다. 로컬 구현·합성 검증과 운영 승인은 별도다. 개인정보를 운영에 수집하기 전 아래 미결 조건을 해소한다. 기존 [DB 변경 지침](database-migrations.md), [금융 설계](personal-finance-architecture.md), PIN-48/49의 책임을 유지한다.

## 검증 범위와 출시 판정

2026-10-27 로컬 작업 브랜치는 `feature/pin-54-cash-flow-mvp`다. 사용자 결정에 따라 후속 검증은 합성 PDF/XLSX와 추출 필드만 사용한다. 실제 금융 파일·실제 PDF 암호를 Git/Linear/검증 fixture에 복제하지 않는다.

| 경계 | 검증 / 출시 전 조건 |
| --- | --- |
| 금융 의미 | 은행 현금 이동과 카드 소비/청구/할부를 분리한다. 이후 할부·환불·다른 문서 중복/정정은 근거 없이 합산하지 않고 확인 필요로 보류한다. 카드 자료는 월 전체 coverage를 증명하지 않으므로 관측값으로 표시한다. |
| 월간 여정 | 모바일 크기 Chrome에서 첫 달·두 번째 달 여러 합성 PDF/XLSX 가져오기, 리뷰→소비 분석→자금 일정, 중복 재시도·잘못된 파일·응답 유실·일정 변경/건너뛰기/연결을 검증한다. 실기기와 사용자 인수를 대체하지 않는다. |
| 보정/근거 | 사용자 보정과 분할은 Raw를 변경하지 않는다. 보정 후 재업로드·revision 충돌·월별 재계산·근거 이동은 API/Web 회귀 및 각 slice의 합성 E2E로 확인한다. |
| 승인/소유권 | owner A/B·관리자·expected actor·이전 세션·지연 응답·보호 query 제거를 검증한다. Raw/비즈니스/분류/일정/암호의 쓰기는 승인 사용자 행을 같은 SQL에서 공유 잠금하고 커밋한다. 금융 6개 화면의 안전한 재로그인 복귀 경로와 월 query를 등록한다. 승인 철회가 먼저 완료되면 쓰지 않는다. 쓰기가 먼저 잠금을 얻은 경우 철회가 해당 트랜잭션 뒤에 완료된다. |
| 선택 암호 | 수동 기본 경로, 명시 저장·재사용·변경·삭제, 비암호 PDF/카드 미사용, 다른 탭 삭제 시 지연 reveal 중단, 로그/URL/영구 저장소 부재를 검증한다. [암호 운영](finance-pdf-password.md)의 키/nonce/복원 조건을 적용한다. |
| 기존 도메인 | 전체 API/Web 테스트에 Exam/Curriculum 접근·자료·세션·Shell 회귀를 포함한다. dev QA 정리 전후 기존 테이블의 행 수와 digest를 독립 비교한다. |
| 실제 Android | `adb devices`에 연결 기기가 없어 미실행이다. 실제 파일 선택기·암호 키보드·PDF worker 메모리·다중 파일·회전/백그라운드 복귀·세션 만료·사용자 재무 해석을 기기에서 인수해야 한다. |
| 운영 | Production 대상/환경/배포 버전·키 설정·migration·백업/삭제 정책은 미승인·미검증이다. 로컬 통과로 운영 출시를 승인하지 않는다. |

현재 판정은 **운영 출시 보류**다. 실제 Android 인수, 금융자료 내보내기/삭제 운영 절차, 백업 보존·복원 후 재삭제 정책과 승인된 운영 적용/readback이 남아 있다. PIN-54/64를 Done으로 표시하지 않는다. 공통 작업·검수 전 이력 보호를 위한 로컬 checkpoint 커밋을 기록한다. push·PR·병합은 실행하지 않았다.

## 개인정보 생애주기와 복구 경계

현재 사용자 API/UI는 단건 파일/수기 거래 영구 삭제와 최대 12개월 XLSX 내보내기를 제공한다(PIN-69/70). 파일 전체/계정 탈퇴 UI는 범위 밖이다. PDF 선택 암호 삭제는 별도 제공한다. SQL의 계정 삭제 cascade 테스트는 사용자가 실행할 삭제 기능이나 백업에서의 즉시 소거를 뜻하지 않는다. 출시 전 금융 도메인에서 사용자 요청의 본인 확인, 내보낼 항목/형식, 삭제 범위와 처리 책임을 정하고 PIN-49의 공통 조건으로 검수한다. 이 문서만으로 계정 삭제나 실제 자료 반출을 실행하지 않는다.

Raw 추출 필드·비즈니스·보정/이력·일정/이력은 DB에 보관하며 원파일은 사용자가 보관한다. export에는 PDF 암호/키/세션/다른 사용자의 기록을 넣지 않는다. 복원 시에는 다음을 지킨다.

1. 쓰기를 중단하고 현재 DB·migration·배포 버전과 보존 대상/시점을 확인한다. 데이터 손실 허용량(RPO)과 복구 시간(RTO), 백업 보존일은 사용자와 운영 담당자가 확정한다. 임의 수치를 약속하지 않는다.
2. 전체 운영 DB를 과거로 덮어쓰기 전에 격리 환경에서 복원한다. 금융 owner의 FK·Raw/비즈니스/보정/일정 이력·복호화·계산을 확인하고 다른 도메인의 최신 변경을 보존한다. nonce 예약은 개인 삭제와 별개로 유지한다.
3. 백업 시점 이후의 삭제·권한 변경 목록을 최신 권위 기록과 대조해 재적용한다. 삭제 목록/보존 기간/재삭제 책임이 없으면 사용자 자료 복원을 운영에서 실행하지 않는다. 과거 승인 상태를 복원해 접근 권한을 되살리지 않는다.
4. 암호 선택 저장은 [별도 키 복원 절차](finance-pdf-password.md)를 따른다. 복원한 attempt는 폐기하고, nonce 이력 유실 가능성이 있으면 새 키 버전을 발급한 뒤 쓰기를 재개한다. 구키는 검증된 읽기 전환에 필요한 동안만 보호 보관한다.
5. 독립 readback·다른 owner/기존 도메인 불변·삭제 반영을 확인한 뒤 승인된 절차로 정상화한다. 백업 생성 성공을 복원 성공으로 보고하지 않는다.

`test/finance-recovery.test.ts`는 두 격리 PGlite DB에서 합성 금융 Raw/비즈니스 사본의 FK·복호화/내용 복원, 더 최신인 인증 영역 상태 보존, 삭제 제외 목록 적용·cascade를 리허설한다. 운영용 export/restore 도구나 Neon 시점 복원 리허설은 아니다. 신규 추가 테이블 migration의 되돌리기는 사용자 요청으로 생략했으며, 이것이 운영 개인정보 복구 정책을 면제하지는 않는다.

## 운영 적용 순서

1. 최종 diff/검증 결과를 검토하고 요청된 Git 전달 절차를 진행한다. 원격 기준 및 운영 migration journal을 확인해 **아직 없는 파일만** 적용 대상으로 확정한다. 이 브랜치의 신규 migration은 `0003` Raw, `0004` 비즈니스, `0005` 분류, `0006` 일정, `0007` PDF 선택 암호다. dev에는 `0000`–`0007` 총 8개가 적용돼 있다. 운영 이력은 미확인이다.
2. 대상 Production DB/Render API/Vercel Web과 배포 commit, 쓰기 중단·복구 기준 시점·키 보관 책임을 승인받는다. 실제 Build/Pre-deploy command에 migration이 포함되는지 확인한다. 저장소에는 Render Blueprint/CI 배포 워크플로가 없으므로 자동 적용을 추정하지 않는다.
3. `DATABASE_URL`, `JWT_SECRET`, `FINANCE_RAW_ENCRYPTION_KEY`, 정확한 HTTPS Web origin의 `FINANCE_ALLOWED_ORIGINS`를 대상별로 설정한다. 선택 저장은 별도 `FINANCE_PDF_PASSWORD_KEYRING`/`FINANCE_PDF_PASSWORD_ACTIVE_KEY_VERSION`이 필요하다. 로컬 dev 키를 운영으로 복사하지 않는다. 키 유실 시 Raw/비즈니스/보정/일정 복호화 또는 저장 암호 재사용이 불가능하다.
4. 승인된 대상에 migration을 한 번 실행하고 journal hash/schema/FK를 readback한다. 이어 API를 배포하고 `/health`, `/ready`, 비로그인 거부·승인 사용자 owner 격리·실제 금융 endpoint를 검증한다. `/ready` 성공만으로 금융 키/테이블/API 검증을 대체하지 않는다.
5. Web을 배포한다. `apps/web/vercel.json`은 `/api/*`를 Render API로 전달한다. 실제 HTTPS origin·쿠키·프록시·no-store·PDF worker/CSP·파일 선택과 응답 오류를 배포 주소에서 확인한다. Vercel Preview가 운영 API로 쓰지 않도록 해당 주소의 연결 대상을 먼저 확인한다.
6. 승인된 합성 전용 QA 계정으로 최소 가져오기→readback→리뷰→보정→일정→선택 암호 삭제를 실행하고 QA 자료만 정리한다. 배포 commit·migration hash·실제 Android 결과·잔여 위험을 PIN-64→PIN-54에 기록한다. 실제 금융 파일은 별도 동의 없이 운영 검증에 사용하지 않는다.

실패하면 후속 배포/재시도를 멈추고 적용 여부부터 확인한다. 추가형 schema는 유지하고 호환되는 이전 API/Web artifact로 복구하거나 후속 migration을 적용한다. DB를 삭제하거나 적용된 SQL/journal을 고쳐 rollback으로 취급하지 않는다. 데이터 복구가 필요하면 위 격리 복원 절차를 적용한다. 로그는 route/status/request ID와 지연·오류율로 확인하고 body/암호/키를 추가하지 않는다.

## 검수 전 이력 보호 체크포인트 — 2026-10-27

사용자 요청으로 공통 작업과 추가 검수 전에 현재 작업을 다음 로컬 커밋으로 분리해 보존했다. 기존 `feature/pin-54-cash-flow-mvp` 브랜치와 `3b7bd3f7` 시안 기준의 이력을 유지하며 rebase/amend/squash는 수행하지 않았다.

| 구분 | 보존 범위 |
| --- | --- |
| `1ecdd898` | 금융 설계 초안과 신규 테이블 메타데이터 기준 |
| `ab6745bd` | 금융 Contracts·API·migration·합성 회귀 |
| `b825430d` | 실제 Web 기능·승인 디자인 적용·시안 코드 정리 |
| 이 절을 추가한 docs 커밋 | 출시 판정·운영 전환 순서와 체크포인트 경계 |

이전 작업에서 수행한 Web 테스트 77개, 공용 typecheck/lint/build와 합성 브라우저 검증의 통과 기록을 유지한다. 이번 커밋 단계에서는 소스를 변경하거나 검증을 재실행하지 않고 staged diff·비밀 값/임시 산출물 제외·파일 내용 보존을 검사했다. `.env`·실제 금융 파일·키·임시 QA 산출물은 커밋하지 않는다.

이 체크포인트는 공통 작업/검수의 시작 기준이며 코드 리뷰·사용자 인수·운영 migration/배포의 승인이 아니다. 위 출시 보류 조건과 PIN-54/64의 In Progress 상태를 유지한다. 로컬 Git 이력 보호이며 원격 백업은 아직 수행하지 않았다.

## 출시 전 코드 검수 — 2026-10-28

`feature/pin-65-platform-buttons`의 `12b03571`에서 기존 금융 구현·버튼 커밋을 보존한 `fix/pin-64-release-audit`를 만들고 `origin/develop`의 `af637b5e`를 merge했다. 이번 검수의 수정은 다음과 같다.

- 같은 초에 기록된 은행 거래가 역순으로 인쇄되면 PDF 추출 단계에서 잘못 거부되거나 월간 리뷰에서 잔액 충돌로 표시되던 문제를 수정했다. 잔액으로 검증된 방향을 유지하며 Raw 행 순서·원천 값은 변경하지 않는다. API 계산과 MSW에도 같은 회귀를 추가했다.
- 로그인 직후 PublicOnly의 관찰 경로가 `returnTo`를 무시해 Exam으로 보내던 문제를 수정했다. 화면 가드도 기존 안전 경로 검사와 승인 정책을 사용하며 금융 화면·선택 월로 복귀한다.
- 정상 응답을 캐시에 주입한 월간 리뷰·분석·일정 렌더링 테스트와 은행 PDF.js 추출 텍스트의 순방향/역방향·잔액/합계 오류 테스트를 추가했다. 후자는 합성 텍스트로 parser를 검증하며 실제 PDF 디코딩·Android worker 검증을 대체하지 않는다.

### 반복 가능한 회귀 범위

루트 `pnpm test`가 Contracts를 빌드한 뒤 아래 API/Web 테스트를 함께 실행한다. 핵심 계산은 공유 Contracts 모델을 API 테스트에서 직접 검증하며 MSW/Query command 테스트와 실제 SQL/PGlite 테스트를 구분한다. 새 CI 자동 실행 워크플로를 추가한 것은 아니다.

| 핵심 기능 | 자동 검증의 진입점과 범위 |
| --- | --- |
| 파일 추출·적재 | API `test/finance-raw.test.ts`, Web `test/finance-raw.test.mjs`, `test/finance-bank-parser.test.mjs`: 추출 필드·검산·암호화·owner·중복 재시도·늦은 세션 결과 차단 |
| 비즈니스 반영 | API `test/finance-business-normalize.test.ts`, `test/finance-business.test.ts`: 은행/카드 의미·청구/출금 연결·중복/정정 보류·Raw 추적·원자적 저장 |
| 분류·보정·분할 | API/Web `test/finance-classification.test.*`: 배분 합계·환불 한도·분류 이동·수정 이력·revision/operation 충돌·확정 저장 후 재조회 실패 |
| 월간 리뷰·분석 | API/Web `test/finance-review.test.*`, `test/finance-analysis.test.*`: 잔액 연결·현금/소비 분리·부분 월·결측·0분모·보정 반영·근거·세션 격리 |
| 자금 일정 | API/Web `test/finance-schedule.test.*`: 월말/회차 이동·이후 변경/중단·실제 연결·중복 연결 방지·예정/실제 금액 분리 |
| PDF 선택 암호 | API/Web `test/finance-pdf-password.test.*`: owner/시도/만료·재인증·키/nonce·삭제 경합·카드 worker 암호 미전달·평문 cache 부재 |
| 복구·기존 도메인 | API `test/finance-recovery.test.ts`, Web `test/auth-routing.test.mjs`, `test/router-data.test.mjs`, `test/app-shell.test.mjs` 및 기존 Auth/Exam/Curriculum 테스트 |

### 화면 검수와 남은 조건

합성 전용 MSW 브라우저에서 금융 직접 진입→로그인→선택 월 복귀, 2개월 XLSX와 손상 파일의 다중 가져오기, 동일 파일 재시도·중복 제외, 관측 소비/부분 자료 표시, 카테고리 추가·분할 합계 오류 차단·저장/readback, 반복 계획 등록·2월 말일 제한·회차 건너뛰기를 확인했다. 실제 API/Neon readback을 새로 수행한 결과가 아니다.

달력은 320/390/1280 CSS px에서 문서 가로 넘침이 없고 날짜 버튼 최소 높이 44px·최소 너비 44.28px 이상이었다. 390px 분석 화면과 분류 시트의 버튼·링크에서 44px 미만 대상은 없었다(숨겨진 skip link 제외). 이 결과는 해당 화면/상태의 측정이며 PIN-65의 모든 화면·입력 방식 또는 실제 Android 인수를 완료한 의미가 아니다.

최종 공용 검증 결과는 PIN-64와 전달 PR에 기록한다. 로컬 실행 Node.js는 `24.21.0`이며 원격 develop에서 인수한 `.node-version`의 `24.22.1` 런타임 검증과 구분한다. 이번 검수에서 DB schema/migration·운영 환경·키는 변경하지 않았다. 기존 신규 migration `0003`–`0007`의 운영 적용, 실제 Android/사용자 인수, 금융 export/delete와 백업 보존·복원 후 재삭제 정책이 남아 있어 **운영 출시 보류**를 유지한다.

## PIN-67 확정 정책의 구현·출시 적용 — 2026-10-28

- PIN-68: 독립 암호화 수기 원천/입력·수정, 출처별 월간 수입/소비, 공통 분류/분할·일정, 중복 후보. 은행 원천 잔액을 수기로 보정하지 않는다.
- PIN-69: 서버 삭제 영향→최종 확인→단건 영구 삭제→독립 readback. Raw 해당 행·요약/metadata 사본·연결·과거 snapshot을 정리하고 최소 tombstone과 파일 유일성으로 동일 파일 재처리 비부활을 보장한다. 다른 독립 거래는 연결 해제·재검토하고 보존한다. 은행 잔액 역산 방지를 위해 관련 문서 잔액을 unknown으로 표시한다.
- PIN-70: XLSX 4시트·최대 12개월, 정확한 정수 텍스트·빈 값·출처/일자·현재 분류/합계, 메모 선택·식별자 제외, 문자열 셀만 생성, 서버 파일 비보관. 외부 AI 자동 전송 없음.
- 신규 migration은 `0008_past_whistler.sql`이다. 수기/operation/삭제 기록 3개 테이블을 추가하며 Raw 0행과 비즈니스 원천 행 nullable을 허용한다. 기존 적용 SQL 0000–0007은 바꾸지 않는다.
- 사용자 확인된 dev: innova-db / dev(br-morning-snow-b324jiir) / neondb. 0008 적용 후 migration 9개·public 30개 테이블과 로컬 SQL hash를 readback했다. 실제 CRUD/삭제는 격리 PGlite 합성 테스트이며 이번 dev에서 실제 금융자료를 재적재하지 않았다.
- 운영 사전 조회: innova-db / production(br-damp-darkness-b38ng3p0) / neondb에 migration 3개, 금융 테이블 0개. Render main 빌드가 db:migrate를 실행하므로 배포 시 0003–0008 적용을 journal/schema로 재확인한다. 운영 전용 키는 사용자 확인 후 dev 키와 별개로 생성하고 Render 기존 환경 변수에 병합했다. 키 로컬 보관은 Git 제외·0600이며 별도 암호화 백업 완료를 뜻하지 않는다.
- Neon API의 현재 history_retention_seconds는 21600(6시간)이다. 자체 백업·30일 보존·복원 성공을 보장하지 않는다. 실제 삭제 기록의 외부 보호 보관·복원 후 재삭제·nonce/키 정책은 PIN-48/49가 소유한다. 최신 권위 삭제 기록을 확보·재적용해 검증하기 전 운영 DB 복원은 금지한다.
- 복구는 추가형 schema를 유지하고 호환되는 새 API의 수정 배포를 우선한다. **새 삭제 실행 뒤에는 구 API가 nullable Raw/삭제된 원천을 이해하지 못하므로 이전 금융 artifact로 무조건 되돌리지 않는다.** 필요한 경우 금융 진입을 중지하고 삭제 상태를 보존한 호환 수정본으로 복구한다. 이전 DB 복원으로 삭제를 되살리지 않는다.
- 사용자는 운영 배포 이후 기능 테스트를 직접 수행할 예정이다. 자동 개발 테스트·빌드/타입/lint, migration 적용·배포/health/버전 확인과 사용자 운영 기능 QA를 구분한다. 개발 중 브라우저·별도 E2E·전체 테스트 반복은 수행하지 않는다. 최종 실행 수와 미검증은 PIN-68/69/70 및 릴리스 PR에 기록한다.

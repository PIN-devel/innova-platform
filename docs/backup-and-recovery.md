# 백업·복원 및 도메인별 복구 기준

상태: 현행 정책 (2026-11-15 확정, [PIN-48](https://linear.app/pin-dev/issue/PIN-48)). 플랫폼 전체 DB(`innova-db`), 비공개 에셋(`gs://innova-assets`), 암호화 키·세션 상태 및 신규 개인 데이터 도메인 도입 기준에 적용한다.

## 1. 복구 목표와 비용·보존 경계

| 항목 | 확정 기준 | 제약 및 운영 규칙 |
| --- | --- | --- |
| **백업 수단** | Neon 기본 **6시간 PITR**(`history_retention_seconds = 21600`) 전용 | 별도 외부 DB 덤프·유료 스냅샷 미운영 (추가 월 고정 비용 \$0). `PIN-69`의 "30일 보존" 검토 가정은 비채택 |
| **RPO (허용 손실)** | **6시간 이내** | 6시간 초과 장애·오삭제는 DB 시점 복구 불가. 금융 원파일은 사용자 재업로드, 수기 거래·분류·일정·학습 콘텐츠는 재입력/재적재로 수용 |
| **RTO (복구 시간)** | **24시간 이내** (당일 격리 검증 후 반영) | **핵심 규칙:** 장애 인지 즉시 **6시간 window 만료 전**에 Neon 격리 PITR 브랜치를 먼저 생성해 시점을 고정(pin)하고, 검증·선택 복원은 24시간 내 완료 |
| **브랜치 격리 원칙** | `production` 전체 덮어쓰기(Promote / `reset_from_parent`) 금지 | `innova_auth`, `innova_learning`, `innova_finance` 3개 DB가 단일 `production` 브랜치(`br-damp-darkness-b38ng3p0`)에 공존하므로, 영향 DB·오너만 선택 복원 |

> [!WARNING]
> 단순 내보내기 파일(예: `PIN-70` 최대 12개월 XLSX) 생성 성공을 백업 또는 복원 성공으로 판정하지 않는다. XLSX는 읽기 전용 분석 스냅샷이며 원천 행·암호화 상태·revision·삭제 tombstone을 복원할 수 없다.

---

## 2. 데이터·자산별 권위 원천 및 보존·복구 책임

| 도메인 / 자산 | 저장 위치 (테이블·자산) | 권위 원천 및 재생성 가능성 | 백업·보존 방식 | 접근·복구 책임 | 월 추가 비용 가정 |
| --- | --- | --- | --- | --- | --- |
| **Auth (`services/auth`)** | `innova_auth` (`users` 1개) | **유일 권위 원천** (재생성 불가) | Neon 6시간 PITR | Auth 서비스 전용 접속, 운영 관리자. 타 서비스 DB 직접 접속 금지 | \$0 (Neon 기본) |
| **Learning (`services/learning`)** | `innova_learning` (`exam_*` 13개) | 로컬/관리자 원본(`private-data/` 등) + seed/import 스크립트로 **재생성 가능** | Neon 6시간 PITR + 원본 재적재 | Learning 서비스 전용 접속, 관리자 import | \$0 |
| **Learning 비공개 에셋** | GCS `gs://innova-assets` | 로컬 `private-data/` 오프라인 원본으로 **재업로드 가능** | 추가 GCS Object Versioning 미도입, 로컬 원본 유지 | Learning 서비스 ADC 무키 읽기, 관리자 업로드 | \$0 (기존 GCS 할당 내) |
| **Finance Raw·비즈니스 (`services/finance`)** | `innova_finance` (`finance_raw_*` 3개, `finance_business_*` 3개) | 원파일(PDF/XLSX)은 **사용자 로컬 보관**(서버 비보관). DB 암호화 행·정규화 결과는 재업로드 시 **재생성 가능** | Neon 6시간 PITR (초과 시 사용자 원파일 재업로드) | Finance 서비스 및 인증된 `owner_id`만 접근(관리자도 타인 금융 열람 불가) | \$0 |
| **Finance 사용자 생성·보정·삭제** | `innova_finance` (`finance_manual_transactions`, `finance_classification_*`, `finance_schedule_*`, `finance_transaction_operations`, `finance_deleted_transactions` 7개) | **DB가 유일 저장소** (재생성 불가; 6시간 초과 시 수기 재입력 수용) | Neon 6시간 PITR. `finance_deleted_transactions`는 재업로드/복원 시 비부활 tombstone | Finance 서비스 및 해당 `owner_id`. 삭제 시 분류·일정 revision 이력(`*_revisions`) 즉시 폐기 | \$0 |
| **Finance PDF 선택 암호·nonce** | `innova_finance` (`finance_pdf_secrets`, `finance_pdf_secret_attempts`, `finance_pdf_secret_nonces` 3개) | **DB가 유일 저장소** (유실 시 수동 PDF 암호 입력으로 폴백 가능) | Neon 6시간 PITR. 복원 시 미소비 `attempts` 폐기, `nonces` 되돌림 대비 새 키 버전 전환 필수 | Finance 서비스 전용, `owner_id` + 최근 5분 재인증 + `session_hash` | \$0 |
| **AI (`services/ai`)** | 별도 DB 없음 | 무상태 LLM 프록시 | 백업 대상 아님 | Admin 전용 + 1 RPS 레이트 게이트 | \$0 |
| **암호화 키·시크릿** | `FINANCE_RAW_ENCRYPTION_KEY`, `FINANCE_PDF_PASSWORD_KEYRING`, `JWT_SECRET` | GCP Secret Manager 및 로컬 `.env`(0600, Git 제외) | 추가 이중 보관 의무 미도입. **키 유실 시 해당 암호화 데이터 영구 복호화 불가** | 서비스별 최소 권한 주입 (`FINANCE_*`는 `innova-finance-api` 단독) | \$0 |
| **캐시·락·이벤트** | Upstash Redis REST / Cloud Pub/Sub | 일시적 캐시·분산 락·전달 버퍼 (재생성 가능) | 백업 대상 아님 (`auth:user:*` 등 TTL/무효화로 정합성 회복) | `@innova/auth-kit` | \$0 |

---

## 3. 격리 복구 및 도메인·오너 독립 복원 절차

`production` 브랜치 전체를 과거 시점으로 되돌리면 같은 브랜치에 있는 타 도메인(`innova_auth`, `innova_learning`)과 피해 없는 오너의 최신 변경이 함께 소실된다. 운영 복원은 반드시 아래 4단계 절차를 따른다.

### 1단계: 6시간 내 시점 고정 및 쓰기 중단

1. 장애·오삭제 인지 즉시 **6시간 history window 만료 전**에 Neon 콘솔 또는 MCP/API로 장애 직전 시점 $T$의 격리 브랜치(예: `restore-isolated-<yyyymmdd-hhmm>`)를 생성한다. (이 단계로 시점 $T$를 보존해 24시간 RTO 내 검증 시간을 확보한다.)
2. 복구 대상 서비스(예: `innova-finance-api`)의 쓰기를 일시 중단하거나 점검 모드로 전환하고, 현재 운영 DB의 migration 이력(`drizzle.__drizzle_migrations`)과 배포 커밋을 확인한다.

### 2단계: 현행 운영 DB에서 최신 권위 상태 확보 (중단 게이트 포함)

별도 외부 백업이 없으므로 **현행 운영 `production` 브랜치**를 최신 권위 대조 원천으로 사용한다.

1. `innova_auth.users`에서 복원 대상 `owner_id`의 **최신 `approval_status`·`role`**을 조회한다. 과거 시점에 `approved`였더라도 현재 `rejected`되었거나 계정이 없다면 복원 권한을 되살리지 않는다.
2. `innova_finance.finance_deleted_transactions`에서 해당 `owner_id`의 **최신 삭제 tombstone 목록(`event_id`, `raw_file_id`, `raw_sequence`)**을 추출한다.
3. 현행 `finance_pdf_secrets` 및 `finance_pdf_secret_nonces`에서 **현재 사용 중인 `key_version` 목록**을 확인한다.

> [!CAUTION]
> **복원 중단 게이트:** 만약 `finance_deleted_transactions` 테이블 자체까지 동시에 파괴·유실되어 시점 $T$ 이후의 단건 영구 삭제 내역을 대조할 최신 권위 원천이 없다면, **자동 복원을 즉시 중단하고 삭제 자료 부활 방지를 위해 수동 확인 전까지 운영 반영을 금지**한다.

### 3단계: 격리 브랜치 내 검증·재삭제·키 처리

격리 브랜치(`restore-isolated-*`)에서 다음을 수행하고 결과를 기록한다.

1. **스키마·관계·복호화 검증**: 대상 도메인 테이블의 스키마 일치, FK·제약조건 무결성, `FINANCE_RAW_ENCRYPTION_KEY` 기반 복호화 및 합계/잔액 계산 정상 여부를 확인한다.
2. **`PIN-69` 단건 삭제 재적용**: 2단계에서 확보한 최신 `finance_deleted_transactions` 목록을 격리 브랜치에 대조해, 시점 $T$와 현재 사이에 삭제된 거래가 복원 대상에 남아 있으면 격리 환경에서 **삭제 재적용**을 실행한다.
   - 수기 거래(`finance_manual_transactions`) 및 파일 비즈니스 이벤트(`finance_business_events`)·대응 Raw 행(`finance_raw_rows`) 정리
   - `finance_raw_files`(`row_count`, `metadata_ciphertext`) 및 `finance_business_documents` 상태 갱신
   - `finance_classification_workspaces` / `finance_schedule_workspaces`의 해당 거래 보정·일정 참조 제거 및 **`finance_classification_revisions` / `finance_schedule_revisions` 과거 스냅샷 폐기** (삭제된 원문 잔존 차단)
   - 최신 `finance_deleted_transactions` 및 `finance_transaction_operations` 레코드 보존
3. **PDF 선택 암호 키·attempt 안전 처리**:
   - 복원 대상에 포함된 `finance_pdf_secret_attempts`는 **모두 삭제(폐기)**하여 만료·미소비 재인증 시도의 재사용을 차단한다.
   - DB 시점 복원으로 `finance_pdf_secret_nonces` 예약 이력이 되돌려질 수 있으므로, 복원 후 쓰기를 재개하기 전에 **`FINANCE_PDF_PASSWORD_ACTIVE_KEY_VERSION`을 새 난수 키 버전으로 전환**한다(기존 ciphertext 복호화를 위한 구키는 `FINANCE_PDF_PASSWORD_KEYRING`에 읽기 전용으로 유지).
4. **승인 상태 반영**: `innova_auth.users`에서 현재 `approved`가 아닌 사용자의 금융 데이터는 운영으로 되살리지 않는다.

### 4단계: 선택 복원, 독립 Readback 및 정리

1. 격리 검증이 완료된 **대상 DB(`innova_finance` 등) 또는 특정 `owner_id` 행만** 운영 `production` DB로 선택 복원한다. `innova_auth`, `innova_learning` 및 피해 없는 `owner_id`의 데이터는 건드리지 않는다.
2. 운영 반영 직후 다음을 독립 readback으로 확인한 뒤 쓰기를 재개한다:
   - 타 도메인 DB(`innova_auth`, `innova_learning`)와 타 `owner_id` 행 수·다이제스트 불변
   - 재적용된 삭제 거래의 조회·분석·XLSX 노출 부재
   - 복호화·신규 PDF 암호 시도/저장 정상 동작
3. 검증 완료 후 임시 격리 브랜치(`restore-isolated-*`)를 삭제한다.

---

## 4. 삭제 데이터 잔존·재삭제 사용자 고지 기준

- 제공자(Neon)가 보장하지 않는 백업 내 **"즉시 완전 물리 소거"를 사용자에게 약속하지 않는다.**
- 단건 영구 삭제 시([finance-transactions.ts](../services/finance/src/db/finance-transactions.ts)) 다음 사실이 사용자 안내에 포함되어야 한다:
  - 앱 내 단건 삭제는 즉시 DB의 해당 원천 행·이벤트·보정·과거 revision 스냅샷을 정리하고 `finance_deleted_transactions` tombstone을 남겨 동일 파일 재업로드 시 부활을 막는다.
  - 사용자 장치에 남아 있는 원본 PDF/XLSX 파일 및 이미 다운로드된 XLSX 사본은 앱 삭제로 회수되지 않는다.
  - DB 시점 복구 이력(Neon 6시간 PITR)에서는 삭제 직후 최대 6시간 동안 과거 시점 이력이 잔존할 수 있으며, 복구 시 최신 삭제 기록과 대조해 재삭제를 적용한다.

---

## 5. 신규 '유일 원본' 개인 데이터 도메인 도입 전 게이트

향후 사용자 로컬 원파일 없이 플랫폼 DB나 객체 스토리지에 **유일하게 보관되는(Sole-Custody) 개인 데이터 도메인**(예: Wardrobe & Style, 개인 건강 기록 등)을 출시하기 전에 아래 게이트를 통과해야 한다.

1. **6시간 RPO 수용 여부 판정**: 사용자가 6시간 초과 유실 시 복구 불가를 수용할 수 있는 데이터인가? 수용할 수 없다면 기능 출시 전에 Neon 플랜 상향(장기 PITR·스냅샷) 또는 별도 암호화 외부 백업을 먼저 구축하고 본 문서의 RPO/RTO·비용 표를 갱신한다.
2. **도메인 격리 및 재삭제 계약**: `innova_auth`·기존 도메인 데이터에 영향 없이 해당 도메인/오너만 선택 복원할 수 있는 키(`owner_id` 범위)와, 복원 시 삭제 부활을 막는 최소 tombstone 대조 절차가 정의되어 있는가?
3. **공통 접근·세션·암호화 경계**: [개인 데이터 경계 기준](personal-data-boundaries.md)의 owner 격리, 캐시·로그·오류 보호, 키 회전 및 복구 시 attempt/nonce 처리 기준이 반영되어 있는가?

---

## 6. 합성 복구 리허설 현황과 미검증 범위

| 구분 | 범위 및 실행 위치 | 현재 판정 |
| --- | --- | --- |
| **로컬 PGlite 다중 도메인 합성 리허설** | [finance-recovery.test.ts](../services/finance/test/finance-recovery.test.ts) — `innova_auth`·`innova_learning`·`innova_finance` 격리 DB 모델에서 `innova_finance` 오너 선택 복원 시 타 도메인 최신 변경 비손상, `PIN-69` 단건 삭제(수기/파일 거래·보정·revision 이력 폐기) 재적용, `finance_pdf_secret_attempts` 폐기 및 키 버전 전환, 최신 `rejected` 승인 상태 존중 검증 | `pnpm --filter @innova/finance test`로 자동 실행 |
| **실제 Neon 클라우드 PITR 리허설** | Neon `innova-db` 브랜치 시점 분기 생성 → 실제 `pg_dump`/선택 복원 → 실환경 소요 시간 측정 | **미실행 (제약)**: `PIN-48` 완료 시점 기준 로컬 PGlite 합성 검증까지만 수행했으며, 실제 Neon 브랜치 PITR 소요 시간·네트워크 대역폭·수동 SQL 이관 소요 시간은 미측정 |

---

## 관련 문서

- [DB 스키마 변경과 복구 지침](database-migrations.md)
- [개인 데이터 경계 기준](personal-data-boundaries.md)
- [문서 관리 정책](documentation-policy.md)
- [PDF 암호 선택 저장·복원 조건(Notion)](https://app.notion.com/p/42369ba4b33081a5981df304b5598177)
- [MOTIFIN 출시 검증과 운영 전환(Notion)](https://app.notion.com/p/42369ba4b33081b7ae75d4a7332f53f3)

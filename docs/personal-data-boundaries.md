# 개인 데이터 도메인 공통 접근·세션·보존 경계 기준

상태: 현행 정책 (2026-11-25 확정, [PIN-49](https://linear.app/pin-dev/issue/PIN-49)). 첫 개인 데이터 도메인인 MOTIFIN(`services/finance`, `innova_finance`) 및 향후 도입되는 모든 개인 데이터 도메인에 공통으로 적용한다. 백업·PITR·도메인별 격리 복구 절차는 [백업·복원 및 도메인별 복구 기준](backup-and-recovery.md)이 소유한다.

---

## 1. 적용 범위, 첫 도메인 및 책임 경계

| 영역 | 소유 주체 | 포함하는 책임 | 제외 범위 (비범위) |
| --- | --- | --- | --- |
| **공통 플랫폼 경계** | [PIN-49](https://linear.app/pin-dev/issue/PIN-49) (`@innova/auth-kit`, `services/auth`, `apps/web/src/features/auth`, `apps/api-gateway`) | 서버 인증(`request.authUser.id`) 기반 소유권·관리자 열람 차단 원칙, `X-Expected-User` actor fence, Origin/커스텀 헤더 CSRF, `Cache-Control: no-store` + `Vary: Cookie`, 보호 Query·`safeReturnTo`·세션 epoch/재검증·지연 응답 격리, 로그·오류·URL·외부 전송 허용/거부 기준, 합성 검증 행렬 | 범용 개인 데이터 플랫폼/vault 선행 구축, PostgreSQL RLS 전면 전환, 인증 제공자 교체, 장기 세션·refresh 토큰 도입, 서버측 `jti` 즉시 폐기 구현, `PIN-53` Inbox 후보(비동기 command helper 추출·자동 등록 누락 검사) |
| **첫 개인 도메인 (MOTIFIN)** | `services/finance` (`innova_finance`), `apps/web` `/motifin/*` (`PIN-40`, `PIN-54`~`63`, `PIN-67`~`70`) | 필수 데이터(은행/카드 Raw 암호화 행, 비즈니스 거래, 수기 거래, 분류·일정 workspace/revision, 선택 저장 PDF 암호·attempt/nonce, 삭제 tombstone, idempotency ledger) 모델·AEAD 키 분리·`operationId`/`baseRevision` CAS·단건 영구 삭제·최대 12개월 XLSX 내보내기 | 전체 계정 탈퇴·일괄 삭제 UI, 휴지통·분석 제외 기능, 실물 Android/iOS 단말 및 운영 환경 사용자 QA(`PIN-64`) |
| **후속 개인 도메인** | 각 도메인 기획·구현 이슈 (`PIN-34` 건강, `PIN-41` IT Atlas, `PIN-44` 실행 지원 등) | 해당 도메인의 데이터 모델·계산·보정·원천 연계 계약 | 공통 인증/보호 캐시/복구 원칙 재정의 (본 문서와 `backup-and-recovery.md` §5 온보딩 게이트 준수) |

---

## 2. `PIN-24` 기준선과의 차이 (재개하지 않고 차이만 적용)

기존 [PIN-24](https://linear.app/pin-dev/issue/PIN-24)에서 완료한 Auth·Exam·Curriculum의 인증/권한·보호 Query 캐시 범위는 재개하지 않는다. 개인 데이터 도메인에는 아래 차이만 추가로 적용한다.

| 항목 | `PIN-24` 기준선 (Exam / Curriculum) | 개인 데이터 도메인 추가 기준 (`PIN-49`) |
| --- | --- | --- |
| **접근·소유권** | `approved` 사용자는 공용 문항 은행·커리큘럼을 공유 조회 (`admin`은 대기 사용자 관리) | 모든 조회·변경·내보내기를 **인증된 `request.authUser.id` 소유 객체로 한정**; 요청 `ownerId` 무시, 타인 ID는 `404`, **`admin`도 타인의 개인 데이터 열람·변경 불가** |
| **Actor Fence & CSRF** | HttpOnly/SameSite/Partitioned 쿠키 + `Cache-Control: no-store` | 개인 도메인 요청마다 `X-Expected-User === authUser.id` 검증(불일치 시 `403`), 상태 변경·비밀 반환 요청에 허용 `Origin` + 커스텀 헤더(`X-Finance-Request: 1`) + `application/json` + `sec-fetch-site` 검증 |
| **응답 분리·캐시** | 인증/관리자/학습 API `no-store` | 개인 도메인 전 응답(성공·오류·404·다운로드)에 `Cache-Control: no-store` 및 `Vary: Cookie` 의무 적용 |
| **오류·로그 보호** | `@innova/auth-kit` 민감 헤더·비밀키 redaction | 라우트 전용 `setErrorHandler`로 파서/DB/암호화 예외(`err` 객체·stack·cause·입력값)가 전역 로거와 HTTP 응답에 도달하지 않도록 차단하고, 예기치 않은 오류는 `500 INTERNAL_ERROR` 정적 메시지로 변환 |
| **삭제·반출·복구 연계** | 공용 콘텐츠/승인 관리 중심 (개인 삭제 tombstone 없음) | 단건 영구 삭제 tombstone(`PIN-69`)·과거 revision 폐기, 다운로드 사본 비회수 및 6시간 PITR 잔존·복원 후 재삭제 고지 |

---

## 3. 소유권·세션·복귀·생애주기 경계

### 3.1 서버 소유권과 DB 경계

- 모든 개인 객체의 소유자는 서버가 검증한 `request.authUser.id`로만 부여하며, 요청 본문/쿼리의 `ownerId` 필드는 거부하거나 무시한다([finance-raw.ts](../services/finance/src/routes/finance-raw.ts), [finance-business.ts](../services/finance/src/routes/finance-business.ts), [finance-transactions.ts](../services/finance/src/routes/finance-transactions.ts), [finance-pdf-password.ts](../services/finance/src/routes/finance-pdf-password.ts)).
- Repository 메서드는 항상 `ownerId`를 필수 인자로 받아 `(owner_id, id)` 범위로 조회·갱신·삭제하며, 관련 객체(예: Raw↔Business, Transaction↔Classification/Schedule) 연결도 동일 소유자 여부를 트랜잭션 내에서 검증한다.
- MSA Database-per-Service 원칙에 따라 `services/finance` 등 도메인 서비스는 `innova_auth`에 직접 접속하거나 DB FK/`FOR SHARE` 잠금을 두지 않으며, `auth:user:<id>` 캐시와 Pub/Sub 이벤트로 승인 상태를 동기화한다.

### 3.2 세션 수명·캐시 TTL·즉시 폐기 경계 (현행 확정)

| 구분 | 현행 동작 (구현 기준) | 명시적 잔여 위험 및 운영 경계 |
| --- | --- | --- |
| **JWT 수명** | `15m` stateless JWT (`AUTH_COOKIE_NAME`, `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`; [auth.ts](../packages/auth-kit/src/auth.ts), [auth.ts](../services/auth/src/routes/auth.ts)) | 탈취된 쿠키는 만료(최대 15분) 전까지 서버측 `jti` 블랙리스트로 즉시 폐기되지 않는다. 장기 세션·refresh 토큰은 도입하지 않으며, 고위험 경로(PDF 암호 재사용·저장)는 `auth_time` 기준 **5분 이내 재인증**을 강제한다. |
| **로그아웃** | `POST /api/auth/logout`이 쿠키를 삭제하고, 웹 클라이언트가 `clearSessionCache()`로 보호 Query·Mutation·세션 epoch·메모리 상태·worker를 즉시 폐기 | 서버측 `jti` denylist는 미운영. 향후 즉시 서버 세션 폐기가 필요해지면 `PIN-53` 후속 과제로 분리한다. |
| **승인 상태 캐시** | `createCachedUserLookup`이 `auth:user:<id>`를 Upstash Redis에 **60초 TTL(Fail-Open)** 캐싱하고, `auth.user.status-changed` Pub/Sub push([internal-events.ts](../services/finance/src/routes/internal-events.ts))가 수신 즉시 캐시 삭제 및 `rejected` 시 미소비 PDF 시도(`consumed_at IS NULL`) 폐기 | Redis/Pub/Sub 전달이 지연·장애인 경우 최대 60초까지 이전 승인 캐시가 남을 수 있다(PDF 암호 시도 등 고위험 경로는 Auth 서비스 직접 조회 병행). |

### 3.3 클라이언트 보호 캐시·복귀·BFCache 경계

- 신규 개인 도메인 Query key는 반드시 `clearProtectedQueries`([clear-protected-queries.ts](../apps/web/src/features/auth/clear-protected-queries.ts))의 `isProtectedQueryKey` 및 `removeQueries` 목록에 등록하고, key에 `owner`와 `sessionVersion`(epoch)을 포함한다.
- 인증 만료(`401`), 승인 대기/거절(`403 APPROVAL_PENDING`/`SIGNUP_REJECTED`), 계정 전환, 로그아웃 시:
  - `advanceSessionVersion(queryClient)`로 epoch를 증가시켜 진행 중이던 GET/POST/worker/reveal 응답이 뒤늦게 도착해도 `assertSessionVersion`으로 차단하고 UI·캐시에 반영하지 않는다.
  - 미저장 입력·파일 참조·PDF 평문은 메모리에서 폐기하고, 15분 만료 후 재인증 시 파일 재선택·`operationId` 기반 readback으로만 복구하며 다른 계정으로 자동 재제출하지 않는다.
- 복귀 경로는 `safeReturnTo`([route-session.ts](../apps/web/src/features/auth/route-session.ts))의 명시적 allowlist 경로(`/motifin/import`, `/motifin/review`, `/motifin/spending`, `/motifin/analysis`, `/motifin/schedule`, `/motifin/security`, `/motifin/transactions` 등)만 허용하고 그 외 경로·외부 URL은 `/exam`으로 폴백한다.
- [RootLayout](../apps/web/src/app/root-layout.tsx)의 `attachSessionRevalidationListeners`는 `focus`·`online`·`visibilitychange`(`visibilityState === "visible"`)·`pageshow`(`event.persisted === true` BFCache 복원) 시 `revalidator.revalidate()`를 실행하며, [LiveAccessBoundary](../apps/web/src/features/auth/auth-boundary.tsx)는 `user.id:role:approvalStatus:epoch` 키로 보호 화면을 즉시 격리·제거한다.

### 3.4 도메인 생애주기(중복·유실·충돌·삭제·내보내기) 추적

| 시나리오 | 공통 요구 경계 | MOTIFIN 도메인 구현·AC 소유 (`PIN-40`·`PIN-68`~`70`) |
| --- | --- | --- |
| **중복 제출·응답 유실** | 소유권 범위 `operationId`(+ `itemId`) 유일성 및 요청 digest 대조(동일 키·다른 본문 `409`), 응답 유실 시 `operation` readback으로 확인·새 키 자동 생성 금지 | `finance_transaction_operations` 및 Raw/Business/Classification/Schedule idempotency ledger |
| **정정 충돌** | `baseRevision` / `expectedRevision` 조건부 CAS 갱신(오래된 편집 `409`), 사용자 보정 보존 | `finance_business_scopes`, `finance_classification_workspaces`, `finance_schedule_workspaces`, `finance_pdf_secrets` |
| **삭제 및 내보내기** | 소유자 검증·의도 확인 후 즉시 DB 정리, 복원 후 재삭제용 최소 tombstone 유지, 다운로드 사본 비회수 및 6시간 PITR 잔존 고지 | `PIN-69` 단건 영구 삭제(`finance_deleted_transactions` tombstone·revision 폐기) / `PIN-70` 최대 12개월 메모리 XLSX(`no-store`, 메모 선택 포함, PDF 암호 제외). 계정 탈퇴·일괄 삭제 UI는 미범위 |

---

## 4. 로그·URL·오류·캐시·외부 전송·연결 철회 기준

| 항목 | 허용 (Allow) | 거부 (Deny) |
| --- | --- | --- |
| **애플리케이션 로그** | `request.id`, HTTP method, route template path, statusCode, durationMs, allowlist event/errorCode | 원문 금융 거래명·금액·메모·계좌/카드 번호·원파일 hash·PDF 암호·JWT·내부 시크릿·DB/파서 예외 `err` 원문([logger.ts](../packages/auth-kit/src/logger.ts)) |
| **오류 응답** | 정적 `AppError` 코드·메시지(`400 INVALID_INPUT`, `401`, `403`, `404`, `409`, `500 INTERNAL_ERROR`) 및 `X-Request-Id` | 파서/DB/암호화 예외 메시지·stack·cause·사용자 입력값 echo |
| **URL / Query String** | 고정 화면 경로, `month`(`YYYY-MM`), 무작위 내부 UUID(`event`, `document`), 정렬/포커스 enum | 계좌/카드 식별자, 가맹점명, 메모, 금액, 파일 hash, 암호, 토큰 |
| **캐시 / 저장소** | `Cache-Control: no-store`, `Vary: Cookie`, 요청 `cache: "no-store"`, 메모리 내 TanStack Query(로그아웃·만료 시 즉시 제거) | HTTP/CDN 캐시, Service Worker 캐시, `localStorage`/`sessionStorage`/`IndexedDB` 내 금융 본문·PDF 암호 영구 저장 |
| **외부 전송 / 연결 철회** | 사용자가 명시적으로 요청한 `POST /api/finance/transactions/export` XLSX 다운로드(PDF 암호·원파일·시크릿 제외) | 동의 없는 외부 AI·Google Sheets 자동 전송, session replay/본문 Analytics. 다운로드된 XLSX 사본과 6시간 PITR 이력은 앱 삭제로 즉시 소거되지 않음을 고지 |

---

## 5. 합성 검증 행렬 및 계층별 책임 구분

모든 자동 검증은 합성 데이터만 사용하며, 실제 금융 원파일·개인정보·운영 DB 자격증명을 테스트에 사용하지 않는다.

| 검증 시나리오 | 기대 경계 | 계층 책임 | 현행 자동 검증 위치 |
| --- | --- | --- | --- |
| **사용자 A/B·관리자·`pending`/`rejected`** | 타인/타인 연결 객체 ID 접근 시 `404`, `pending`/`rejected`는 `403`, 관리자도 타인 개인 데이터 `404`/빈 상태 | API + `PIN-49` 검수 | [finance-raw.test.ts](../services/finance/test/finance-raw.test.ts), [finance-business.test.ts](../services/finance/test/finance-business.test.ts), [finance-classification.test.ts](../services/finance/test/finance-classification.test.ts), [finance-schedule.test.ts](../services/finance/test/finance-schedule.test.ts), [finance-transactions.test.ts](../services/finance/test/finance-transactions.test.ts), [finance-pdf-password.test.ts](../services/finance/test/finance-pdf-password.test.ts), [routes-scope.test.ts](../services/finance/test/routes-scope.test.ts) |
| **Actor Fence & CSRF (`X-Expected-User`, `Origin`, `sec-fetch-site`)** | 불일치 `X-Expected-User`·미허용 `Origin`·누락된 `X-Finance-Request` `403` 거부 | API + Web/MSW | 위 API 라우트 테스트 + [finance-request-origin.test.mjs](../apps/web/test/unit/finance-request-origin.test.mjs) |
| **세션 전환·만료·지연 GET/POST/reveal·BFCache** | epoch 불일치 시 늦은 응답·캐시·worker·reveal 결과 폐기, `safeReturnTo` allowlist, `focus`/`online`/`visibilitychange`/`pageshow(persisted)` 재검증 | Web Router/Query/App Shell + MSW | [query-cache.test.mjs](../apps/web/test/unit/query-cache.test.mjs), [router-data.test.mjs](../apps/web/test/unit/router-data.test.mjs), [app-shell.test.mjs](../apps/web/test/unit/app-shell.test.mjs), [auth-routing.test.mjs](../apps/web/test/unit/auth-routing.test.mjs), [finance-raw.test.mjs](../apps/web/test/unit/finance-raw.test.mjs), [finance-business.test.mjs](../apps/web/test/unit/finance-business.test.mjs), [finance-pdf-password.test.mjs](../apps/web/test/unit/finance-pdf-password.test.mjs), [finance-transactions.test.mjs](../apps/web/test/unit/finance-transactions.test.mjs) |
| **오류·로그·헤더 (`no-store`, `Vary: Cookie`, `500 INTERNAL_ERROR`)** | 예기치 않은 예외는 `500 INTERNAL_ERROR`, 원문 오류/암호/키가 로그·응답에 미노출, 전 응답 `no-store` + `Vary: Cookie` | API + `@innova/auth-kit` | [finance-raw.test.ts](../services/finance/test/finance-raw.test.ts), [finance-business.test.ts](../services/finance/test/finance-business.test.ts), [finance-transactions.test.ts](../services/finance/test/finance-transactions.test.ts), [finance-pdf-password.test.ts](../services/finance/test/finance-pdf-password.test.ts) |
| **Pub/Sub 승인 철회·복구 재삭제** | `rejected` 이벤트 수신 시 `auth:user:<id>` 캐시 삭제 및 미소비 PDF attempt 폐기, 복구 시 타 도메인 보존 및 단건 삭제 재적용 | API + `@innova/auth-kit` (`PIN-48`) | [internal-events.test.ts](../services/finance/test/internal-events.test.ts), [finance-recovery.test.ts](../services/finance/test/finance-recovery.test.ts) |
| **기존 Exam/Curriculum 회귀 & 브라우저 E2E** | 공용 학습/관리자 동작 비손상, 합성 브라우저 E2E에서 주요 여정·세션 보호 확인 | 공용 CI (`pnpm test`, `pnpm test:e2e`) | `apps/web/test/e2e/`, `services/learning/test/`, `services/auth/test/` |
| **실물 단말 및 운영 환경 사용자 QA** | 실제 Android/iOS 단말·운영 배포 환경의 금융 자료 수명주기·복구 실측 | 운영/사용자 인수 (`PIN-64`) | 자동 테스트로 대체하지 않음 (`PIN-64` 추적) |

---

## 6. 신규 개인 데이터 도메인 온보딩 체크리스트

[백업·복원 및 도메인별 복구 기준 §5](backup-and-recovery.md#5-신규-유일-원본-개인-데이터-도메인-도입-전-게이트)와 함께 아래 항목을 모두 통과한 뒤 출시한다.

1. **소유권·인가**: 전 API가 `request.authUser.id`로 소유권을 강제하고, `ownerId` 입력을 거부하며, 관리자 열람을 차단하고, `X-Expected-User`·`Origin`·커스텀 헤더 검증을 적용했는가?
2. **세션·캐시 등록**: 신규 Query prefix가 `clearProtectedQueries`에 등록되었고, 라우트 경로가 `safeReturnTo`에 등록되었으며, 모든 API 응답이 `Cache-Control: no-store`와 `Vary: Cookie`를 반환하는가?
3. **오류·로그 비노출**: 라우트 전용 `setErrorHandler`가 예기치 않은 예외를 `500 INTERNAL_ERROR`로 정화하고 민감 본문/식별자를 로그·URL·storage에 남기지 않는가?
4. **생애주기·고지**: idempotency/CAS 충돌, 삭제 tombstone 및 다운로드·PITR 잔존 고지가 도메인 AC에 명시되고 합성 테스트 행렬을 통과했는가?

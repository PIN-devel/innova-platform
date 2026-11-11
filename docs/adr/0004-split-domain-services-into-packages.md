# ADR-0004: 도메인별 마이크로서비스 패키지(`services/*`) 분리, 독립 DB 구축 및 공통 인증 킷(`auth-kit`) 채택

- 상태: 승인됨(Accepted)
- 결정일: 2026-11-09
- 적용 범위: 저장소 공통 (`services/*`, `packages/auth-kit`, `apps/api-gateway`, `apps/api`)
- 관련 이슈: Linear [PIN-71](https://linear.app/pin-dev/issue/PIN-71), [PIN-75](https://linear.app/pin-dev/issue/PIN-75)
- 대체/수정 대상: [ADR-0002](0002-google-cloud-run-msa-and-exit-strategy.md)의 "단일 코드베이스 + `SERVICE_DOMAINS` 라우트 제어" 항목을 도메인별 독립 패키지(`services/*`) 및 전용 DB 분리 구조로 부분 대체

---

## 1. 맥락과 문제 정의 (Context)

- [ADR-0002](0002-google-cloud-run-msa-and-exit-strategy.md)에서는 Fastify 단일 코드베이스(`apps/api`)를 유지하며 `SERVICE_DOMAINS` 환경 변수로 라우트를 선택 마운트하여 Cloud Run 3종에 배포하는 구성을 결정했었다.
- 그러나 실제 첫 번째 도메인 서비스(Auth/Admin)를 분리하는 [PIN-75](https://linear.app/pin-dev/issue/PIN-75) 단계에서 다음 한계와 요구가 확인되었다:
  1. **코드베이스 및 의존성 격리의 불완전성**: 단일 패키지 안에서 환경 변수 플래그로만 라우트를 켜고 끄면, Auth 서비스 컨테이너에도 Exam, Curriculum, Finance(대용량 xlsx/crypto/fflate 등)의 모든 의존성과 코드가 번들링되어 빌드 산출물 크기 및 보안 표면적이 줄어들지 않는다.
  2. **DB 데이터베이스 단위 격리(Database-per-Service) 필요성**: 진정한 MSA 이행을 위해 데이터베이스 역시 단일 `neondb` 인스턴스에 의존하지 않고, 서비스별 독립 데이터베이스(`innova_auth`, 향후 `innova_learning`, `innova_finance`)로 분리하여 영속성 계층의 경계를 엄격히 세워야 한다.
  3. **Strangler Fig 과도기 무중단 롤백 안전장치**: 기존 Render 모놀리스(`apps/api`)의 코드를 임의로 훼손하거나 이동시키지 않고 그대로 보존해야, APISIX Gateway의 라우팅 설정 되돌림 커밋 하나만으로 즉각적인 롤백이 가능하다.
- 이에 따라 `apps/api` 모놀리스는 유지한 채, 도메인별 백엔드 마이크로서비스를 `services/<domain>` 독립 패키지로 점진 추출하고, 서비스 간 공유 코드를 별도 패키지로 명확히 정의하는 아키텍처 재정립이 요구되었다.

---

## 2. 검토한 대안 (Considered Options)

### 대안 1: 기존 ADR-0002대로 `apps/api` 단일 패키지에 `SERVICE_DOMAINS` 조건부 마운트 구현
- **장점**: 새 패키지 디렉토리를 만들지 않아도 되며 단일 `Dockerfile` 유지 가능.
- **단점**: 컨테이너 이미지 크기가 비대해지고, 패키지 단위 의존성 격리가 불가하며, 각 서비스 전용 DB 스키마 분리가 모호해짐.

### 대안 2: `apps/api` 전체를 `services/api`로 디렉토리 이동 후 점진 분리
- **장점**: 모노레포 구조에서 프런트(`apps/`)와 백엔드(`services/`)의 디렉토리 구분이 명확해짐.
- **단점**: 기존 Render BE에 연결된 Git 이력 및 배포 파이프라인의 기준 경로가 흔들리며, 과도기 롤백 시 혼선 발생.

### 대안 3: `apps/api`는 유지하고, 도메인 서비스를 `services/<domain>` 독립 패키지로 신설 + 공통 코드는 `packages/auth-kit`으로 추출 (채택안)
- **장점**:
  - `apps/api`는 건드리지 않고 롤백 타겟으로 온전히 보존.
  - 신규 마이크로서비스(`services/auth`)는 필요한 최소 의존성만 패키징하여 초경량 컨테이너 구현.
  - Neon 내 `innova_auth` 전용 데이터베이스를 생성하여 Database-per-Service 패턴 달성.
  - Zod 계약(`packages/contracts`)과 Fastify 런타임 공유 코드(`packages/auth-kit`)의 관심사가 명확히 분리됨.
- **단점 및 관리 요소**:
  - 모노레포 내 관리할 패키지 수가 증가함.
  - 과도기 동안 신규 가입/승인 데이터가 기존 Render BE의 `neondb.users`에도 반영되도록 이중 쓰기(Dual-Write) 처리가 필요함.

---

## 3. 결정 (Decision)

본 프로젝트는 **대안 3을 최종 채택**하며, 다음과 같은 세부 구조와 운영 원칙을 확정한다.

### 1) 디렉토리 및 패키지 아키텍처
- **`apps/`**: 사용자 접점 애플리케이션 및 엣지 컴포넌트
  - `apps/web`: React + Vite 프런트엔드 (Firebase Hosting)
  - `apps/api-gateway`: Apache APISIX Stand-alone 게이트웨이 (Cloud Run, 현 위치 유지)
  - `apps/api`: 기존 Render Fastify 모놀리스 (전환 완료 및 검증 시까지 롤백 대비용으로 보존)
- **`services/`**: 도메인별 백엔드 마이크로서비스 독립 패키지
  - `services/auth` (`@innova/auth`): 인증 및 회원 관리 전용 서비스 (Cloud Run `innova-auth-api`)
  - `services/learning` (`@innova/learning`): 학습(Exam Drill & Curriculum) 전용 서비스 (Cloud Run `innova-learning-api`, [PIN-76](https://linear.app/pin-dev/issue/PIN-76))
  - `services/finance` (`@innova/finance`): 개인 금융(MOTIFIN) 전용 서비스 (Cloud Run `innova-finance-api`, [PIN-77](https://linear.app/pin-dev/issue/PIN-77))
  - `services/ai` (`@innova/ai`): 어드민 전용 AI(K-EXAONE 2.5 PoC) 서비스 (Cloud Run `innova-ai-api`, [PIN-81](https://linear.app/pin-dev/issue/PIN-81))
- **`packages/`**: 모노레포 내부 공유 패키지
  - `packages/contracts` (`@innova/contracts`): 프런트/백엔드 공유 Zod 스키마, 타입, 인터페이스 계약 (순수 스키마 유지)
  - `packages/auth-kit` (`@innova/auth-kit`): Fastify 전용 공통 인증 가드, 세션 쿠키 설정, JWT 클레임 타입, 오류(`AppError`), 로거(`pino`) 유틸리티

### 2) Database-per-Service 원칙 및 전환기 이중 쓰기 (Dual-Write)
- **엄격한 Database-per-Service 경계**:
  - 각 마이크로서비스(`services/*`)는 자신이 소유한 전용 데이터베이스에만 접속하며, **다른 마이크로서비스의 데이터베이스에 직접 접속(읽기 전용 포함)하거나 테이블·외래키(FK)·SQL 잠금을 공유하는 행위를 엄격히 금지**한다.
  - Neon PostgreSQL 내에 서비스별 독립 Database를 운영한다:
    - Auth 서비스(`@innova/auth`): **`innova_auth`** 데이터베이스 (`users` 테이블 단독 소유).
    - Learning 서비스(`@innova/learning`): **`innova_learning`** 데이터베이스 (`exam_*` 12개 테이블 단독 소유, `users` 테이블·외래키 없음, [PIN-76](https://linear.app/pin-dev/issue/PIN-76)).
    - Finance 서비스(`@innova/finance`): **`innova_finance`** 데이터베이스 (`finance_*` 16개 테이블 단독 소유, `users` 테이블·외래키 없음).
  - **서비스 간 통신 및 정합성 보호**:
    - 타 도메인의 상태 조회·검증이 필요한 경우 반드시 해당 도메인 서비스가 노출하는 **HTTP API**를 호출한다.
    - 여러 마이크로서비스에 걸친 상태 변경이 필요한 경우 소유 서비스의 API를 호출하고 **보상 트랜잭션(Saga / 망취소)** 패턴으로 원자성과 최종 정합성을 보호한다. 단, 서비스 경계를 지키면서 API 조회만으로 단순하게 해결 가능한 경우에는 불필요한 분산 트랜잭션 복잡성을 도입하지 않는다.
- **전환기 이중 쓰기 안전장치**: 기존 Render 모놀리스(`apps/api`)의 모듈이 `neondb.users`를 참조하므로, PIN-78(최종 레거시 정리) 전까지 `services/auth`는 `LEGACY_DATABASE_URL`이 설정되어 있을 때 회원가입/승인/거절 이벤트를 레거시 `neondb.users`에 한시적으로 미러링하여 Strangler Fig 전환기 데이터 정합성을 보장한다.

### 3) 공통 세션 쿠키 명칭 통일 및 양방향 브릿지
- 기존 레거시 명칭인 `exam_drill_auth`를 폐기하고, 플랫폼 공통 쿠키 명칭 **`innova_auth`**로 통일한다.
- `apps/api-gateway` APISIX는 Firebase Hosting 단일 세션 제약에 대응하여:
  - 요청 시: `Cookie: __session` → `innova_auth` 및 `exam_drill_auth` 동시 주입.
  - 응답 시: `Set-Cookie: innova_auth` 또는 `exam_drill_auth` → `__session` 변환.

### 4) 클라우드 탈출 전략(Cloud Exit Strategy) 재정의
- ADR-0002의 단일 모놀리스 `SERVICE_DOMAINS=all` 기동 방식 대신, 향후 모든 도메인 서비스가 분리된 후에는 모노레포 루트의 **`docker-compose.yml`을 통해 개별 서비스 컨테이너들(`auth`, `learning`, `finance`, `gateway`)을 단일 네트워크로 오케스트레이션**하여 타 클라우드, VPS, 홈랩으로 즉시 이전하는 방식을 탈출 전략으로 확정한다.

### 5) Finance 서비스의 사용자 참조 및 서비스 간 API 연동 (PIN-77)
- `innova_finance`는 `users` 테이블을 갖지 않으며 `innova_auth` DB에 직접 접속하지 않는다. `finance_*.owner_id`는 Auth 서비스가 소유한 불투명 사용자 식별자(UUID)이며 DB 외래키·`FOR SHARE` 조인을 두지 않는다.
- 매 요청의 사용자 존재·승인 상태(`approvalStatus`) 확인과 PDF 암호 저장/재사용 시의 계정 비밀번호 재인증(step-up authentication)은 `UserLookup`이 **Auth 마이크로서비스 HTTP API(`AUTH_SERVICE_URL`: `GET /api/auth/me`, `POST /api/auth/login`)**를 호출하여 판정한다.
- 소유자 단위 쓰기 직렬화는 `innova_finance` 내부의 `finance_business_scopes` / `finance_pdf_secrets` revision CAS가 담당한다.
- **수용한 트레이드오프**: 분리 전에는 쓰기 SQL이 승인된 사용자 행을 공유 잠금해 승인 철회와의 경합을 DB가 막았다. 분리 후에는 요청 진입 시점의 Auth API 승인 검사만 적용되며 이미 진입한 쓰기 요청과의 경합은 허용한다. 계정 삭제 시 금융 데이터 정리는 서비스 간 API 연동(후속 과제)으로 다룬다.

### 6) Learning 서비스의 Database-per-Service 및 GCS 무키(Keyless) 서빙 (PIN-76)
- `innova_learning`은 12개 학습 테이블(Exam 3개, Curriculum 9개)을 소유하며 `users` 테이블을 갖지 않는다. 매 요청의 사용자 승인 여부는 `UserLookup`이 **Auth 마이크로서비스 HTTP API(`AUTH_SERVICE_URL`: `GET /api/auth/me`)**를 호출해 `approvalStatus === 'approved'`를 검증한다.
- Curriculum 비공개 에셋(`gs://innova-assets`) 서빙은 외부 서비스 계정 키를 주입하지 않고, Cloud Run의 GCP 메타데이터 서버(`http://metadata.google.internal/...`)에서 단기 OAuth2 Bearer 토큰(ADC)을 동적으로 조회·인메모리 캐싱하여 GCS HTTP API로 직접 읽는다. 장애 발생 시 클라이언트에 내부 자격 증명이나 스토리지 URL을 노출하지 않고 `503 INTERNAL_ERROR` (`Private asset storage is unavailable`)로 마스킹한다.

---

## 4. 결과와 영향 (Consequences)

### 긍정적 영향
- **완벽한 서비스 격리**: 의존성 충돌 위험이 원천 차단되며, 서비스별 빌드/배포 속도가 대폭 향상된다.
- **데이터베이스 격리**: Auth 도메인의 데이터가 타 도메인과 물리적으로 격리되어 보안성과 자율성이 극대화된다.
- **안전한 무중단 롤백**: 문제 발생 시 Gateway 라우팅 설정 하나로 기존 Render 모놀리스로 즉시 회귀할 수 있다.
- **조건부 CI/CD 효율화**: 변경된 패키지만 선택적으로 빌드·배포하여 CI 시간과 클라우드 비용을 최소화한다.

### 트레이드오프 및 관리 사항
- 패키지 수가 증가하므로 루트 워크스페이스 스크립트(`pnpm build`, `pnpm test`) 관리가 요구된다.
- 레거시 Render 백엔드가 완전히 종료될 때까지 `innova_auth`와 `neondb` 간 이중 쓰기 상태를 주시해야 한다.

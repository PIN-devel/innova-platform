# ADR-0005: 서버리스 메모리 저장소(캐시·분산 락) 및 Push 기반 메시지 큐(1:N Fan-out EDA·DLQ) 도입

- 상태: 승인됨(Accepted)
- 결정일: 2026-11-13
- 적용 범위: 저장소 공통 (`packages/contracts`, `packages/auth-kit`, `services/*`, `apps/api-gateway`)
- 관련 이슈: Linear [PIN-82](https://linear.app/pin-dev/issue/PIN-82), [PIN-83](https://linear.app/pin-dev/issue/PIN-83)~[PIN-87](https://linear.app/pin-dev/issue/PIN-87)
- 관련 결정: [ADR-0002](0002-google-cloud-run-msa-and-exit-strategy.md), [ADR-0004](0004-split-domain-services-into-packages.md)

---

## 1. 맥락과 문제 정의 (Context)

- **동기식 크로스 서비스 호출 부하와 코드 중복**:
  - [ADR-0004](0004-split-domain-services-into-packages.md)의 Database-per-Service 원칙에 따라 `learning`, `finance`, `ai` 서비스는 `innova_auth` DB에 직접 접속하지 않고 매 요청마다 `innova-auth-api`의 `GET /api/auth/me`를 호출한다.
  - 동일 사용자가 짧은 시간 안에 다수의 요청(예: 커리큘럼 챕터 본문 + 다수의 이미지 에셋 요청)을 보낼 때 매번 Auth HTTP 왕복 및 Neon DB 쿼리가 발생하며, 3개 서비스에 유사한 `createUserLookup` 구현이 중복되어 있다.
- **단일 프로세스 메모리 기반 동시성 제어의 한계**:
  - `services/ai`의 `ExaoneRateGate`는 프로세스 로컬 변수로 1 RPS 및 단일 스트림 실행을 제어한다. Cloud Run 리비전 교체 중 구/신 컨테이너가 공존하거나 `max-instances > 1`로 확장될 경우 전역 동시성 제어가 깨질 위험이 있다.
- **도메인 간 비동기 상태 전파(Fan-out) 및 후속 정리 부재**:
  - `services/auth`에서 어드민이 사용자를 승인(`approved`)하거나 거절(`rejected`)할 때, 하위 도메인 서비스에 즉시 상태를 전파해 캐시를 무효화하거나 미소비 보안 세션(예: Finance의 미소비 PDF 비밀번호 재인증 시도)을 정리하는 이벤트 파이프라인이 없다.
- **비용 및 런타임 제약 (월 $10 크레딧 · Scale-to-Zero)**:
  - 모든 백엔드 서비스는 서울 리전(`asia-northeast3`) Cloud Run에서 `--min-instances=0`으로 운영되므로, 상시 구동 VM이나 VPC 커넥터, Pull 폴링 워커가 필요한 인프라는 도입할 수 없다.
  - [ADR-0002](0002-google-cloud-run-msa-and-exit-strategy.md)의 클라우드 탈출 전략을 유지하기 위해 외부 인프라 의존성은 Port-Adapter 패턴으로 추상화해야 한다.

---

## 2. 검토한 대안 (Considered Options)

### 2.1 메모리 저장소 (캐시 및 분산 락)

| 대안 | 개요 | 미채택 / 채택 사유 |
| --- | --- | --- |
| 대안 A: **GCP Memorystore (Redis/Valkey)** | Google Cloud 관리형 Redis 인스턴스 + Serverless VPC Access | 상시 구동 비용(월 $35+) 및 VPC 브릿지 비용 발생으로 월 $10 크레딧 한도 초과 → **미채택** |
| 대안 B: **GCE `e2-micro` 자체 Redis VM** | 무료 티어(북미 리전 한정) VM에 Redis 직접 설치 | 서울 리전 유료, 북미 경유 시 네트워크 RTT 지연 및 VM 운영 오버헤드 → **미채택** |
| 대안 C: **Upstash Serverless Redis (HTTPS REST) + `CacheStore`/`DistributedLock` 추상화** | 무상태 HTTPS REST 기반 서버리스 Redis Free Tier + 로컬/테스트용 `InMemory` 폴백 어댑터 | **채택**: 고정 비용 $0(월 50만 커맨드 무료), VPC 불필요, Cloud Run Scale-to-Zero 완벽 호환, `SET NX PX` 및 Lua `EVAL`로 원자적 분산 락 지원 |

### 2.2 메시지 큐 (이벤트 기반 아키텍처 & Fan-out)

| 대안 | 개요 | 미채택 / 채택 사유 |
| --- | --- | --- |
| 대안 A: **BullMQ / Redis Streams (Pull 워커)** | 컨슈머가 큐를 주기적으로 폴링하는 방식 | 컨슈머 컨테이너가 상시 구동되어야(`min-instances >= 1`) 하므로 Scale-to-Zero 위배 → **미채택** |
| 대안 B: **Google Cloud Tasks** | HTTP Push 기반 작업 큐 | 1:1 Point-to-Point 큐 모델로 단일 이벤트의 1:N Fan-out 패턴 구현에 부적합 → **미채택** |
| 대안 C: **GCP Cloud Pub/Sub (Push Subscription + DLQ Topic) + `EventPublisher`/`DeadLetterSink` 추상화** | 1 Topic : N Push Subscriptions 구조 + Cloud Run ADC 메타데이터 토큰 무키 REST 발행 + 로컬/테스트용 `HttpFanout` 어댑터 | **채택**: 고정 비용 $0(월 10GB Always Free), 이벤트 발생 시에만 컨슈머 컨테이너 기동 후 Scale-to-Zero 복귀, 1:N Fan-out 및 지수 백오프 재시도·DLQ 네이티브 지원 |

---

## 3. 결정 (Decision)

1. **공통 추상화 계층 도입 (`@innova/contracts`, `@innova/auth-kit`)**:
   - 도메인 이벤트 계약(`DomainEventEnvelope`, `PubSubPushEnvelope`)은 `@innova/contracts`에 선언한다.
   - 런타임 추상화(`CacheStore`, `DistributedLock`, `EventPublisher`, `DeadLetterSink`, `createPubSubPushRoute`, `createCachedUserLookup`)는 `@innova/auth-kit`에 배치하고, 환경 변수 유무에 따라 `UpstashRest` / `GcpPubSubRest` / `HttpFanout` / `InMemory` 어댑터로 자동 연결한다.
2. **Cache-Aside & Fail-Open 원칙**:
   - `learning`, `finance`, `ai`의 `UserLookup` 및 `learning`의 고빈도 읽기 경로에 Cache-Aside를 적용한다.
   - 캐시 저장소 일시 장애 시 에러를 전파하지 않고 원본 HTTP/DB 조회로 Fail-Open 폴백한다.
3. **소유자 토큰 기반 원자적 분산 락**:
   - `DistributedLock`은 획득 시 무작위 소유자 토큰(`randomUUID()`)을 발급하고, 해제 시 Lua CAS로 토큰 일치 여부를 검증한 뒤 삭제하여 타 인스턴스 락 오해제를 방지한다.
   - `services/ai`의 1-RPS 스트리밍 게이트 및 `services/auth`의 어드민 상태 전이 경합 구간에 적용한다.
4. **Push 기반 1:N Fan-out, 멱등성 가드, 재시도 및 DLQ**:
   - `services/auth`의 사용자 승인/거절 시 `auth.user.status-changed` 이벤트를 1회 발행하여 `learning`, `finance`, `ai` 3개 컨슈머의 `/internal/events/user-status` 웹훅으로 전파한다.
   - 모든 컨슈머 웹훅은 API Gateway(`apps/api-gateway`)에 노출하지 않고 내부 토큰(`X-Internal-Event-Token`) 및 `eventId` 기반 멱등성(`setIfAbsent`)을 검증하며, 최대 시도 횟수 초과 시 DLQ로 격리한다.

---

## 4. 결과와 영향 (Consequences)

### 긍정적 영향
- **고정 비용 $0 및 Scale-to-Zero 유지**: 상시 구동 VM, VPC 커넥터, Pull 워커 없이 서버리스 캐시·락·Fan-out 메시징을 운영한다.
- **중복 제거 및 보안/정합성 강화**: 3개 서비스의 `UserLookup` 중복을 제거하고, 사용자 거절 이벤트 수신 시 하위 서비스 캐시 및 Finance 미소비 재인증 시도를 즉시 무효화한다.
- **클라우드 탈출 보장**: 모든 어댑터가 표준 HTTPS REST 및 인터페이스로 격리되어 있어 `InMemory` 또는 로컬 컨테이너 기반 스택으로 즉시 이전 가능하다.

### 감수할 트레이드오프
- **HTTPS REST 왕복 지연**: Upstash REST 및 Pub/Sub REST 호출은 VPC 내부 TCP 연결 대비 수 ms~수십 ms의 TLS/HTTP 오버헤드를 가지므로, 초고빈도 루프 내 연속 호출을 피하고 요청 단위 가드·락에 집중한다.
- **최종 일관성(Eventual Consistency) 수용**: Cache-Aside TTL(기본 60초) 동안의 상태 반영 지연은 Push Fan-out 이벤트 무효화로 최소화한다.

### 후속 작업
- [PIN-83](https://linear.app/pin-dev/issue/PIN-83): ADR-0005 및 `@innova/contracts`, `@innova/auth-kit` 추상화 구축
- [PIN-84](https://linear.app/pin-dev/issue/PIN-84): 크로스 서비스 `UserLookup` 및 학습 조회 Cache-Aside 적용
- [PIN-85](https://linear.app/pin-dev/issue/PIN-85): 분산 락 기반 AI 1-RPS 제어 및 어드민 상태 전이 보호
- [PIN-86](https://linear.app/pin-dev/issue/PIN-86): Auth 이벤트 발행 및 Learning·Finance·AI Push Fan-out·재시도·DLQ 구현
- [PIN-87](https://linear.app/pin-dev/issue/PIN-87): Cloud Run 배포 워크플로·APISIX 경계 검증 및 문서 통합

# MOTIFIN Raw 파일 적재

상태: PIN-56 로컬 구현, Neon dev 검증 대상. 운영 배포·비즈니스 거래 생성·월 완전성 판정은 포함하지 않는다. 제품 기준은 [MOTIFIN](../../web/docs/motifin-product.md), 신규 테이블 기준은 [메타데이터 기준](../../../docs/database-table-metadata.md)을 따른다. 상세 설계 초안의 전체 기능을 이번에 구현한 것으로 해석하지 않는다.

## 저장 구조와 원천 보존

| 테이블 | 키·책임 |
| --- | --- |
| finance_raw_batches | owner_id + 클라이언트 생성 batch UUID. 최초 반영 시각·소유/작성 주체를 제공한다. |
| finance_raw_files | 서버 생성 UUID, owner/배치 복합 FK. owner + kind + 원파일 바이트 SHA-256 유일성, payload digest, 파서 버전, 행수·최초 반영 시각. 문서 메타는 인증 암호화한다. |
| finance_raw_rows | owner + file + sequence 복합 PK, owner/파일 복합 FK. 암호화한 행 payload에 page/원문 행 번호·종류와 모든 셀을 보존한다. |

은행 거래의 고정 8개 셀은 거래일시·적요·보낸분/받는분·출금액·입금액·잔액·송금메모·거래점이다. 문서의 계좌명·계좌번호·예금주·총 잔액·출금가능금액·총 입금/출금·조회기간 시작/종료·페이지 번호/총 페이지를 분리한다. PDF의 텍스트 조각은 좌표 순서로 보존한다. 조각 구분과 원문 공백은 독립 추출기와 대조할 때 정규화하되 DB 저장/응답의 문자열을 임의 금액/비즈니스 값으로 바꾸지 않는다.

카드는 ZIP/OOXML 단일 worksheet의 A–L 전 열, header/transaction/continuation/summary/blank 행·원문 행 번호·병합 범위를 보존한다. 셀의 물리 주소·원문 string 값·number/text/blank/boolean/error 타입을 저장한다. 존재하지 않는 셀은 null/blank이고 명시적인 빈 문자열과 구별한다. XLS/BIFF·수식·다중 시트·다른 PDF 레이아웃은 조용히 추정하지 않고 거부한다.

원천마다 물리 컬럼을 계속 추가하는 방식과 비교해, 고정된 공유 스키마로 검증하는 구조화 셀 payload를 선택했다. 은행 8개/카드 12개 컬럼의 순서·이름을 검사하고 셀별 주소/타입/값을 독립 재조회할 수 있다. 카드 보조·요약행을 거래 테이블로 강제하지 않으며 null·음수·헤더 없는 F열도 손실시키지 않는다. 파일 바이트·PDF 암호·파일명·문서 전체 텍스트는 저장하지 않는다. 파싱 결과와 원파일의 동일성/금융기관 진위를 보장하는 구조가 아니다.

## 처리와 API

실행: 루트 `pnpm dev` → `http://localhost:5174/motifin/import`. 기존 인증·approved 가드와 단일 Shell/main을 사용한다. API 모드에서 실제 개발 DB를 사용하며 기본 `pnpm dev:web`의 MSW는 메모리 모의 동작이다.

1. 파일 1~10개(개별 20MB 이하)를 선택하고 필요한 PDF 암호를 직접 입력한다. 월·유형을 사전 선택하지 않는다.
2. PDF는 PDF.js 전용 worker에서 복호화·텍스트를 추출하고 브라우저에서 지원 레이아웃·기간·금액 합계·인접 잔액을 검산한다. XLSX는 별도 worker에서 확장 용량·XML/셀/행 구조를 검사한다. worker 시간 제한은 파일별 60초, 페이지 100/행 5,000 제한이다.
3. 파일별 POST에 구조화 Raw만 전송한다. 원파일 바이트와 암호는 전송하지 않는다. 서버 계약·크기·owner·Origin을 검사하고 배치/파일/행을 단일 SQL statement로 반영한다.
4. 결과의 파일 ID로 다시 GET하고 파싱 payload 전체를 비교한다. 저장 응답 유실 시 같은 파일 재시도로 기존 결과를 찾으며, 같은 바이트에서 추출 payload가 달라지면 409로 보류한다. 파일명은 식별키가 아니다.
5. 한 파일의 실패가 나머지 파일의 성공을 취소하지 않는다. 재선택 시 성공 파일은 중복 제외되고 실패 파일만 새로 처리된다. 서로 다른 파일의 동일 거래를 병합하지 않는다.

API prefix는 `/api/finance/raw`다. `GET /files`는 최근 100개 안전한 파일 메타, `GET /files/:id`는 본인 추출 필드, `POST /imports`는 공유 contract를 사용한다. fileHash·payloadDigest는 응답에서 제외한다. 영구 원장 이력의 pagination과 export/삭제는 후속 계약이며 이 화면의 최근 100개 목록을 전체 기록으로 주장하지 않는다.

## 보호와 환경

모든 API에 인증·현재 DB approval·본인 owner·X-Expected-User를 요구한다. 변경 요청은 JSON + X-Finance-Request: 1 + 정확한 허용 Origin으로 제한한다. 응답/오류는 no-store, DB/파서/암호 예외 원문은 전역 logger에 전달하지 않는다. 관리자도 타인의 Raw 조회를 허용하지 않는다.

Raw 메타·행 전체를 독립된 FINANCE_RAW_ENCRYPTION_KEY(32-byte hex)로 AES-256-GCM 암호화한다. nonce는 매번 CSPRNG 96-bit, envelope v1과 tag를 저장하고 owner/file/행 목적을 AAD로 결합한다. key는 DB·bundle·Git에 없고 JWT secret을 재사용하지 않는다. 암호화된 Raw의 읽기는 서버에서 본인 확인 후에만 복호화한다. 운영 key 관리·rotation은 미구현이며 키를 분실/교체하면 기존 Raw를 읽을 수 없다. 이번 로컬 키를 보존하고 운영 출시 전에 별도 절차를 확정해야 한다. DB 밖 키가 있는 DB 단독 유출 방어이며 서버와 키 동시 침해를 막는다고 주장하지 않는다.

환경 예시는 `.env.example`에 있다. FINANCE_ALLOWED_ORIGINS는 정확한 origin 목록이며 wildcard가 없다. FINANCE_RAW_ENCRYPTION_KEY가 없으면 Raw API를 등록하지 않는다. 운영 사용 전 설정·삭제/export/보존/백업 경계를 별도 검증한다.

Web 파일·암호·Raw는 storage에 쓰지 않는다. Query에는 owner/epoch별 안전한 이력만 두고 보호 cache 삭제에 등록한다. worker·POST/GET은 계정 전환·만료·navigation 취소 시 정리하며 이전 응답을 새 계정 UI에 적용하지 않는다. 다른 탭에서 쿠키가 바뀌면 서버 expected-user 검사로 다른 owner 적재를 차단한다. 이미 커밋한 쓰기는 원래 owner 소유이며 취소로 rollback됐다고 표시하지 않는다.

실제 실행 결과·미실행 항목·dev migration과 사용자 지시에 따른 복구 리허설 생략은 [PIN-56](https://linear.app/pin-dev/issue/PIN-56)에 기록한다. 실제 개인 파일·암호·원본 hash와 검증용 사본은 Git/Linear에 복제하지 않는다.

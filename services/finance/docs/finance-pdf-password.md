# PDF 암호 선택 저장·안전한 재사용

상태: PIN-63 로컬 구현. 기본 [수동 PDF 가져오기](finance-raw-ingestion.md)를 유지하고 사용자가 선택한 경우에만 계정에 잠금 해제용 비밀을 저장한다. 생년월일 별도 필드나 범용 금융기관 비밀번호 보관 기능이 아니다. 서버는 원파일을 받지 않고 암호 길이를 6자리로 제한하지 않는다.

## 사용자 흐름과 일시 사용

`/motifin/import`에서 수동 암호로 지원 PDF를 실제 열고 원천 검증을 마쳤을 때만 ‘이번 암호를 계정에 저장·변경’을 실행한다. 암호가 필요 없는 PDF나 카드 XLSX만 선택하면 저장하지 않는다. 서버가 원파일을 검증한 증명은 아니며 실제 화면의 클라이언트 검증이다. 사용자가 자신의 저장값을 직접 지정할 권한과 금융기관 진위 증명을 혼동하지 않는다.

계정에 저장된 값은 다음 가져오기에서 명시적으로 재사용할 수 있다. 화면 mount·상태 조회·prefetch는 존재 여부/변경 시각/사용 가능 여부만 반환한다. 파일 signature가 PDF임을 확인한 실제 실행에서만 짧은 시도를 만들고 POST reveal을 호출한다. 카드 worker에는 PDF 암호를 전달하지 않는다. 틀린 암호는 해당 파일 실패로 알리고 자동 암호 재시도를 하지 않는다. ‘이번만 직접 입력’은 저장값 삭제와 다르다.

설정 `/motifin/security`는 값 자체를 표시하지 않고 저장 상태·명시적 삭제를 제공한다. 변경은 새 PDF를 수동 암호로 열어 성공한 뒤 선택 저장한다. 선택 저장 해제는 삭제이며 기존 Raw/business/사용자 보정을 지우지 않는다. 암호 저장 실패와 파일/거래 저장 결과는 별도로 표시한다.

API 평문은 import command의 일시 지역 변수에서 PDF.js 내부 worker 실행으로 전달하고 Query/Mutation cache·React 장기 상태·URL·Analytics·storage·다운로드에 넣지 않는다. 폼의 암호 입력은 제출/세션 전환 때 정리한다. 실제 동작 중 Request/FormData·fetch·JS 문자열에 일시 값이 필요하며 JS/GC와 브라우저/서버 물리 메모리의 완전 소거를 보장하지 않는다. 실행 종료/취소·세션 변경·시도 만료 때 지역 참조와 worker를 정리한다. 클라이언트는 상대 TTL/절대 만료 중 보수적인 값으로 취소하고 서버가 유효성을 최종 강제한다.

## 재인증·시도·세션

로그인 JWT에 서버의 실제 비밀번호 인증 시각과 임의 jti를 넣는다. 승인/역할은 여전히 매 요청 DB에서 확인한다. 최근 로그인 또는 실제 계정 비밀번호 재확인 5분 안에서만 저장/반환/변경/삭제/재암호화를 허용한다. 재사용 요청으로 이 시간을 연장하지 않으며 이전의 실제 인증 시각을 그대로 승계한다. 이전 JWT도 로그인은 유지하되 인증 시각이 없으면 계정 비밀번호를 다시 확인한다.

`POST /api/finance/pdf-password/attempts`는 owner·현재 쿠키의 SHA-256 session fingerprint·scope·목적(save/use/delete/rotate)·기대 credential revision에 묶인 시도를 발급한다. 원파일/파일명/금융값을 시도에 저장하지 않는다. 시도는 최대 10분, 평문 반환은 1회다. owner의 DB rate counter를 원자적으로 조정해 재인증 요청은 5분에 최대 5회로 제한한다. 실패 요청도 포함하며 Argon2 검사 전에 제한한다. 다중 인스턴스/동시 요청에서도 같은 counter를 사용한다. 만료된 시도는 다음 발급 때 정리하고 계정 삭제 때 cascade한다. 10분은 사용 유효기간이지 비활성 계정의 메타데이터가 반드시 즉시 물리 삭제된다는 뜻은 아니다.

모든 요청은 approved·owner·현재 expected actor·Origin/JSON·no-store/Vary Cookie를 검증한다. 관리자도 다른 owner의 상태·시도·암호를 볼 수 없다. 같은 owner라도 다른 로그인 쿠키에서는 이전 시도를 사용할 수 없다. 재확인 비밀번호는 해시를 검증하는 동안만 사용하며 시도 행/로그에 저장하지 않는다.

## 암호화와 키

별도 `FINANCE_PDF_PASSWORD_KEYRING` JSON map과 `FINANCE_PDF_PASSWORD_ACTIVE_KEY_VERSION`을 사용한다. 키는 각각 독립 CSPRNG 256-bit 값이며 Raw/JWT 키 재사용이나 여러 version의 같은 키 material을 거부한다. 로컬 dev 키는 Git 제외 `.env`(0600)에만 주입한다. Production의 관리형 secret 공급/운영 접근 권한은 출시 전에 별도 승인·검증해야 하며 이번 로컬 환경 설정이 운영 보안 검증을 뜻하지 않는다.

Node crypto AES-256-GCM, CSPRNG 96-bit nonce, 128-bit tag를 사용한다. AAD는 모호하지 않은 배열로 purpose/version/owner/credential ID/기관·용도/revision을 결합한다. tag 검증이 끝나기 전 평문을 반환하지 않고 가능한 Buffer를 정리한다. unknown envelope/key version·누락 키·tag/AAD/nonce 교환·형식 오류는 안전한 실패다. 기존 ciphertext를 자동 삭제하거나 새 값으로 덮지 않고 수동 입력 경로를 제공한다.

- `finance_pdf_secrets`: owner PK/FK, 불변 credential ID, revision, 암호화 envelope·key version/nonce, 생성/마지막 비밀 변경 시각, 내부 rate window/counter. 유일한 작성/수정 주체는 인증 owner이며 rate 변경은 비밀 revision/갱신 시각을 변경하지 않는다. 삭제 뒤 null ciphertext의 tombstone/revision은 늦은 실행을 차단한다.
- `finance_pdf_secret_attempts`: owner/attempt PK·owner FK, 목적·현재 session fingerprint·기대 revision, 생성/만료·실제 재인증 시각·사용/결과 revision. 평문·단순 비밀번호 hash를 저장하지 않는다. 저장 재시도는 같은 시도/내용일 때만 현재 결과를 반환하고 다른 내용은 409다. reveal은 재시도해도 평문을 다시 반환하지 않는다.
- `finance_pdf_secret_nonces`: (key version, nonce) PK와 생성 시각의 보안 예약 기록이다. 개인 업무 객체가 아니어서 owner FK를 두지 않는다. 계정 삭제 후에도 키 version을 퇴역시킬 때까지 예약을 남겨 동일 키 nonce 재사용을 막는다. 충돌은 새 nonce로 제한 재시도하고 부분 비밀 변경을 남기지 않는다. 개인정보 삭제 때 이 예약을 임의로 지우지 않는다.

키 회전은 새 난수 version 추가 → 구키 읽기 유지/새 version 쓰기 활성화 → 최근 재인증한 rotate 시도로 재암호화/revision 증가·readback → 미변환/백업 범위 확인 → 구키 퇴역 순서다. 키 값 자체를 DB/Git/브라우저 번들에 넣지 않는다. version 이름에 다른 material을 덮어써서 기존 ciphertext를 잃지 않는다. DB 시점 복구는 nonce 예약 이력도 되돌릴 수 있으므로 복구 후 쓰기를 재개하기 전에 새 key version으로 전환하고 필요한 구키 읽기를 보존해야 한다. 실제 운영 회전/복구는 미실행이다.

보안 기준: [Node crypto AEAD](https://nodejs.org/api/crypto.html), [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html). 이 기능은 DB 읽기 유출에서 암호를 보호하는 경계이며 DB 쓰기로 인증계를 조작한 공격·서버와 키 동시 침해·XSS·이미 탈취한 재인증 세션·사용자 장치 전체 침해를 해결한다고 주장하지 않는다.

## 삭제·변경·가져오기 경합

비밀 행/시도/현재 승인 상태를 잠가 저장·반환·삭제를 직렬화하고 expected revision을 검증한다. 저장은 nonce 예약·ciphertext 갱신·시도 사용을 한 SQL statement로 commit한다. 삭제는 멱등이며 빈 값으로 원본 데이터가 부활하지 않는다. 이미 반환한 평문이나 네트워크 응답을 물리적으로 회수할 수는 없다. 반환 권한 판정의 직렬화 시점과 실제 브라우저 수신 시각을 혼동하지 않는다.

재사용한 PDF의 Raw POST는 시도 ID/revision만 보내고 평문을 보내지 않는다. 같은 인증 쿠키·사용된 시도·만료·현재 credential revision/존재·현재 승인 상태를 DB에서 확인하고 비밀/시도/사용자 행을 공유 잠금한 뒤 파일 전체를 commit한다. 삭제/변경이 먼저 완료되면 이전 시도 적재는 409이고, Raw commit이 먼저라면 그 적재는 당시 승인된 결과로 유지한다. 이미 commit한 Raw를 클라이언트 abort가 되돌리지는 않는다.

같은 브라우저 탭 간 변경 알림에는 비밀/owner 데이터 없이 changed 신호만 보내 진행 중 재사용을 취소한다. 다른 장치·닫힌 탭·잃은 알림을 이 신호만으로 보장하지 않고 DB gate가 최종 쓰기를 제한한다. 취소/실패 뒤 수동 입력 또는 새 시도와 같은 파일 idempotency로 복구하며 이전 사용자 결과를 새 사용자 cache에 넣지 않는다.

## 검증·출시 경계

단위 crypto·PGlite SQL·API·MSW/세션과 합성 암호화 PDF의 실제 dev/브라우저 결과는 [PIN-63](https://linear.app/pin-dev/issue/PIN-63)에 기록한다. 실제 금융 PDF 추가 전송은 사용자 결정으로 제외한다. Production 키 주입·HTTPS 배포·운영 회전/백업·실제 Android 사용자 인수는 별도 출시 게이트이며 로컬 테스트 통과로 대신하지 않는다.

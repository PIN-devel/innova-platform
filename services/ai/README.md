# @innova/ai

K-EXAONE 2.5 API 기반 어드민 전용 실시간 스트리밍 채팅 PoC 마이크로서비스입니다.

## 기능

- `POST /api/ai/chat/stream`: SSE 기반 K-EXAONE 2.5 실시간 스트리밍 채팅 프록시
- HttpOnly 쿠키(`innova_auth`) 기반 어드민 인가(`role === 'admin'`)
- 1 RPS 동시성 제어 및 즉시 429 차단
- 추론(`reasoning_content`) 및 답변(`content`) 분리 및 첫 단어 앞단 공백 제거
- 클라이언트 연결 중단 시 업스트림 스트림 즉시 취소

## 실행

```sh
pnpm --filter @innova/ai dev
pnpm --filter @innova/ai test
pnpm --filter @innova/ai typecheck
pnpm --filter @innova/ai lint
```

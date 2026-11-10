# AI 에이전트 @innova/ai 지침

이 파일은 `services/ai/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다.

- Fastify 앱 구성은 `src/app.ts`, 라우트는 `src/routes/`, LLM 프로바이더 및 스트리밍은 `src/providers/`, 사용자 조달은 `src/users.ts`의 분리를 따른다. 라우트 테스트는 `buildApp`에 테스트용 `userLookup`과 `fetchImpl`을 주입해 외부 통신 없이 실행한다.
- 요청과 응답의 타입 및 스키마는 `@innova/contracts`를 기준으로 하며, 공통 오류·로거·쿠키/JWT 가드는 `@innova/auth-kit`을 사용한다.
- 이 서비스는 **Database-per-Service 원칙**에 따라 별도 DB를 소유하지 않으며, 어드민 권한(`role === 'admin'`) 검증은 매 요청 `users.ts`를 통해 Auth 마이크로서비스 HTTP API(`AUTH_SERVICE_URL`: `GET /api/auth/me`)로 판정한다.
- K-EXAONE 2.5 API 연동 시 `model: "k-exaone_v2.5"`, `stream: true`, `temperature: 1.0`, `top_p: 0.95`, `chat_template_kwargs: {"preserve_thinking": false}`를 적용하며 `reasoning_effort`를 전달한다.
- 스트리밍 청크의 `choices[0].delta.reasoning_content`와 `choices[0].delta.content`를 분리해 SSE 이벤트(`reasoning`, `content`)로 전달하고, 첫 답변 토큰의 앞머리 줄바꿈(`"\n\n"`)은 `.replace(/^\s+/, "")`로 제거한다.
- 초당 요청 제한(1 RPS) 준수를 위해 스트리밍 진행 중이거나 1초 이내 요청은 대기열에 쌓지 않고 즉시 `429 RATE_LIMITED`(`retry-after-ms` 헤더 포함)로 응답한다.
- 클라이언트 연결 중단 시 업스트림 스트림을 즉시 abort하여 과금 시간을 방어한다.
- API 키(`EXAONE_API_KEY`) 및 JWT 시크릿은 `.env`와 배포 환경 변수에만 둔다.
- `services/ai` 변경 후 루트에서 `pnpm --filter @innova/ai typecheck`, `pnpm --filter @innova/ai test`, `pnpm --filter @innova/ai lint`를 실행한다.

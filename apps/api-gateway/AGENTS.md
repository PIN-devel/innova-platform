# AI 에이전트 @innova/api-gateway 지침

이 파일은 `apps/api-gateway/` 작업에 적용되며 루트 `AGENTS.md`를 함께 따른다.

- **엔진 및 런타임**: Apache APISIX 3.19.x 기반이며, 분산 저장소(`etcd`) 없는 **Stand-alone 모드**로 동작한다. Node.js/pnpm 패키지가 아니므로 `package.json`이나 `node_modules`를 두지 않고 순수 Docker 및 선언적 설정 파일로 관리한다.
- **GitOps 및 라우팅 선언**:
  - 모든 라우트, 업스트림 및 플러그인은 `conf/apisix.yaml.template`에서 선언적으로 관리한다.
  - Stand-alone 모드의 ID 참조 실패 및 스키마 드롭을 방지하기 위해 라우트 내부에 인라인 `upstream:`을 선언하고, `timeout`(`connect`, `send`, `read`)은 문자열이 아닌 초 단위 숫자(예: `60`, `120`)로 지정한다.
  - 파일 끝에는 APISIX 핫리로드 파서의 무결성 검증을 위해 반드시 `#END` 마커를 유지한다.
  - APISIX 3.19.x의 보안 지원은 최신 마이너 버전 중심이므로, 마이너 릴리스 주기(약 1.5~2.5개월)와 호환성 영향 변경(Breaking Changes)을 주기적으로 확인한다.
- **공개 저장소 보안 원칙**:
  - `conf/apisix.yaml.template` 및 CI 워크플로에 실제 운영 백엔드 URL(Cloud Run FQDN 등)이나 저장소 이름을 하드코딩하지 않는다.
  - 기동 시 `docker-entrypoint.sh`가 `UPSTREAM_AUTH_URL`, `UPSTREAM_LEARNING_URL`, `UPSTREAM_FINANCE_URL`, `UPSTREAM_AI_URL`을 파싱하여 `${UPSTREAM_AUTH_*}`, `${UPSTREAM_LEARNING_*}`, `${UPSTREAM_FINANCE_*}`, `${UPSTREAM_AI_*}`를 `envsubst`로 치환하며, 실제 값은 GitHub Actions Variables/Secrets 및 Cloud Run 환경 변수로 주입한다.
- **도메인 라우팅**: `/api/auth/*`·`/api/admin/*`는 Auth, `/api/exam/*`·`/api/curriculum/*`는 Learning, `/api/finance/*`는 Finance, `/api/ai/*`는 AI 서비스로 라우팅한다. 레거시 Render 폴백 라우팅은 제거되었으며 모든 트래픽은 4대 Cloud Run 마이크로서비스로 직접 프록시된다.
- **Firebase Hosting 쿠키 브릿지**:
  - Firebase Hosting이 전달하는 단일 세션 쿠키(`__session`)와 백엔드 세션 쿠키(`innova_auth`, 레거시 `exam_drill_auth`) 간의 양방향 변환을 유지한다.
  - 요청 단계(`serverless-pre-function`): `Cookie: __session=<TOKEN>`을 추출하여 업스트림 전달 시 `Cookie: innova_auth=<TOKEN>; exam_drill_auth=<TOKEN>`으로 변환한다.
  - 응답 단계(`serverless-post-function`): 업스트림의 `Set-Cookie: innova_auth=<TOKEN>` 또는 `Set-Cookie: exam_drill_auth=<TOKEN>`을 감지하여 `Set-Cookie: __session=<TOKEN>; Path=/; SameSite=Lax; Secure; HttpOnly`로 클라이언트에 전달한다.
- **시스템 및 컨테이너 설정 (`conf/config.yaml`, `Dockerfile`)**:
  - 컨테이너 보안을 위해 최소 권한 원칙(Least Privilege)과 SonarLint `docker:S6504`를 준수한다. 설정 템플릿과 스크립트는 `root:root` 소유 읽기 전용(`755`/`644`)으로 복사하고, 런타임 출력 경로(`/usr/local/apisix/conf`, `/usr/local/apisix/logs`)에만 `apisix:0` 쓰기 권한을 부여한 뒤 비루트 사용자(`USER apisix`)로 실행한다.
  - Cloud Run 표준 포트 바인딩(`node_listen: 8080`)을 유지하며, `dns_resolver`(`8.8.8.8`, `1.1.1.1`, `127.0.0.11`)는 반드시 `config.yaml`의 최상위 루트 레벨에 선언한다.
  - Admin API 및 Control Plane은 비활성화(`enable_admin: false`)하여 공격 표면을 최소화한다.
- **검증 절차**:
  - 설정 변경 시 `scripts/validate-config.sh`를 실행하여 YAML 문법 및 `#END` 마커 누락 여부를 확인한다.
  - 컨테이너 변경 시 `docker build` 및 `scripts/test-cookie-bridge.sh`로 로컬 mock 또는 httpbin 대상 쿠키 변환 및 프록시 동작을 검증한다.

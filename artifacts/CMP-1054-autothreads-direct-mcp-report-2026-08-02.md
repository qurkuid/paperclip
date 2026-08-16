# CMP-1054 — autoTHREADS 원본 MCP 직접 연결 조사·무수정 dry-run

## 배경

공개 원본 `eisenjimmy/autoTHREADS`를 고정 버전으로 검증했다. 원본은 Electron
IPC 앱이며 native MCP 서버가 아니다. 실계정·비밀·게시·유료 API·외부 네트워크
호출 없이, 저장소 밖 sidecar가 원본 draft 모듈만 불러오는 최소 dry-run을
재실행했다.

## 실행

- 고정 commit: `3dd347e506040fbf614cd5af0dd739cbc77b8b2b`
- Git tree: `2f6fee3811c95ec4628ad6639f264c4aec108712`
- 원본 경로: `artifacts/CMP-1049-autothreads-upstream`
- tracked-file index 증거 SHA-256:
  `3594ad31012ad9e926397fe01d5c0973d3504a885479e06e870b9c13185889a1`
- 무수정 증거: 실행 전후 `git status --porcelain --untracked-files=no`가 빈 값이고
  `git diff --exit-code`, `git diff --cached --exit-code`가 모두 0으로 종료됐다.
- 실행 명령:

```sh
AUTOTHREADS_SOURCE_DIR="$PWD/artifacts/CMP-1049-autothreads-upstream" \
AUTOTHREADS_DATA_DIR="<run-owned-dir>/autothreads-cmp-1054-data" \
node tools/autothreads-mcp-sidecar/smoke.cjs
```

원본 파일은 쓰지 않았다. 생성 초안은 run-owned 전용 데이터 디렉터리에만
기록했다. 초안 파일은 160바이트였고 SHA-256은
`0ec231f3cc88d7e1a0f40db23544cd8865b4fffa8e04b4da13d390da0f5800cf`다.

## 결과

- MCP `initialize`: 성공, protocol `2024-11-05`
- `tools/list`: 3개
- 원본 integrity: commit/tree 일치, `clean: true`
- draft 생성/조회: 1건, `status=draft`, `publishable=false`
- 비밀 전달: 0
- 외부 호출: 0
- 비용: 0
- publish/schedule/account/secret 도구 노출: 0

원시 로그: `CMP-1054-autothreads-mcp-smoke.ndjson`

## 3안 비교와 결정

| 안 | 원본 무수정 | 비용·위험 | 판단 |
| --- | --- | --- | --- |
| native MCP | 불가. MCP SDK, JSON-RPC 서버, stdio/HTTP transport가 없음 | 연결 자체 불가 | 폐기 |
| 저장소 밖 stdio sidecar | 가능. 원본 `dist-electron/drafts.js`의 draft 함수만 호출 | 작은 wrapper 유지, 고정 SHA 갱신 필요 | **최소 구성으로 채택** |
| remote gateway | 기술적으로 가능하나 별도 호스팅·인증·네트워크 노출 필요 | 가장 큼 | 현 단계 보류 |

추천 구성은 **draft-only local stdio sidecar**다. 원본 Electron UI, scheduler,
Threads/OAuth, LLM, news, images, pipeline, autopilot 모듈은 로드하지 않는다.

## MCP 도구 계약

| 도구 | 입력 → 출력 | 권한 | 실패 | 롤백 |
| --- | --- | --- | --- | --- |
| `autothreads_source_integrity` | `{}` → repository/commit/tree/clean | read | SHA/tree/상태 불일치 시 시작 실패 | 고정 checkout 복원 |
| `autothreads_list_drafts` | `{}` → local drafts | read | 손상 JSON은 원본 로직이 `.corrupt` 격리 | 전용 데이터 백업 복원 |
| `autothreads_create_draft` | text 1–500자, optional id → draft/count/publishable=false | local write, ask-first 권장 | 입력 오류는 `isError`, 저장 실패는 RPC failure | 전용 데이터 디렉터리 삭제/복원 |

`publish`, `schedule`, account, secret, OAuth 도구는 없다. 연결 해제는 MCP
connection 비활성화 → sidecar 종료 → 전용 `AUTOTHREADS_DATA_DIR`만 제거하는
순서다. 원본 checkout은 건드리지 않는다.

필수 설정 키는 값이 아닌 이름만 사용한다.

- `AUTOTHREADS_SOURCE_DIR`
- `AUTOTHREADS_DATA_DIR`

실게시를 별도 승인할 때만 필요한 후보 키는 `THREADS_ACCESS_TOKEN`, Threads
user ID, 선택한 LLM provider key다. 소유자는 CEO/보드이며 Paperclip secret
reference로만 주입해야 한다. 이번 실행은 어떤 secret도 조회하지 않았다.

## 라이선스·공급망·권한 검토

- 라이선스: MIT. substantial source를 복사할 경우 원 저작권/허가 고지를 유지한다.
- 공급망: `package-lock.json`은 있으나 이번 실행에서 설치하지 않았다.
- 네트워크: sidecar는 source integrity와 로컬 draft 저장만 수행했다.
- 쓰기 범위: run-owned `AUTOTHREADS_DATA_DIR` 한 곳뿐이다.
- 원본 전체 실행 위험: Threads Graph/OAuth, 외부 LLM, news/image/RSS 경로가 있어
  승인 없는 실행 대상에서 제외했다.
- 게시 실패: 원격 성공 여부가 불명확하면 자동 재게시하면 안 된다. 게시 기능은
  이 sidecar에 추가하지 않고 별도 승인형 connection으로 분리해야 한다.

## CMP-826 판단

| 항목 | 결정 | 전환 비용·위험 |
| --- | --- | --- |
| GitHub URL 정규화·고정 SHA snapshot·승인 경계 | 유지 | 낮음, 다른 저장소에도 재사용 가능 |
| 기존 Paperclip review-gated autoTHREADS plugin | 유지 | 낮음, 현재 안전한 게시 준비 경로 |
| 원본 native MCP 직접 연결 가정 | 폐기 | 잘못된 전제 제거 |
| draft-only sidecar | 대체/추가 채택 | 낮음~중간, wrapper와 upstream SHA 갱신 필요 |
| remote gateway | 보류 | 높음, 호스팅·인증·공급망·네트워크 표면 증가 |

## 판단

**채택안: 원본 고정 SHA + 저장소 밖 draft-only stdio sidecar.**

native MCP는 불가능하고 remote gateway는 과하다. 현재 증거로는 sidecar만
원본 무수정, 비밀 0, 네트워크 0, 게시 0 조건을 동시에 만족한다. 실제 채택
전 독립 QA가 같은 SHA, clean 상태, 3개 tool discovery, draft 생성, publish
비노출을 재현해야 한다.

## 다음 연결

독립 QA 자식 이슈에서 위 5개 항목과 Paperclip 관리형 catalog/test-call 경로를
검증한다. 실계정 게시 전환은 이 이슈 범위가 아니며 별도 보드 승인·secret
grant·reviewer/approver 지정·매 호출 ask-first가 필요하다.

## 추가 업데이트 (재개 실행)

- `CMP-1055` 독립 QA가 동일 절차로 재현했고 결과는 **부분 PASS, 관리형 경로 검증 미실시로 최종 채택 보류**.
- Paperclip API 서버(`127.0.0.1:3100`)가 응답하지 않아 `issues/{id}/comments`, `interactions`,
  `attachments` 업로드 경로를 호출할 수 없었다. 따라서 이 이슈 최종 상태 업데이트는
  운영 API 재기동 후 보드에서 반영해야 한다.
- `native MCP` 불가 근거: 원본 코드베이스는 Electron 앱이며 MCP JSON-RPC stdio/HTTP
  서버 진입점이 없다(실행 스캔 근거는 `server.cjs` 부재 + `scripts/start.js`에서
  electron 실행만 확인).
- sidecar 실행 근거: `tools/autothreads-mcp-sidecar/server.cjs`는 고정 커밋/트리 확인,
  `source` 무수정 체크, `autothreads_source_integrity`/`list_drafts`/`create_draft`
  3개 도구만 노출하며 `publish`/`schedule`/`account`/`secret`는 노출하지 않는다.
- 실험 로그는 `artifacts/CMP-1054-autothreads-mcp-smoke.ndjson`, QA 로그는
  `artifacts/CMP-1055-independent-qa-autothreads-sidecar-2026-08-02.md`로 공유.

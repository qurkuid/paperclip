# CMP-1049 — autoTHREADS 원본 기반 안전한 MCP 운용 증명

## 배경

원본 `eisenjimmy/autoTHREADS` 고정 버전은 Electron IPC 애플리케이션이며
MCP 서버, JSON-RPC 처리기, stdio/HTTP MCP transport가 없다. 따라서 native
MCP 직접 연결은 불가능하다. 이번 구현은 native MCP를 주장하지 않고,
원본 draft 저장 모듈을 수정 없이 호출하는 외부 stdio MCP sidecar를 가장
작은 실사용 경로로 선택했다.

- Upstream commit: `3dd347e506040fbf614cd5af0dd739cbc77b8b2b`
- Git tree: `2f6fee3811c95ec4628ad6639f264c4aec108712`
- Retained clean checkout: `artifacts/CMP-1049-autothreads-upstream`
- External wrapper: `tools/autothreads-mcp-sidecar`
- Upstream files changed: 0 (`git status --porcelain --untracked-files=no` empty)

## 실행

Sidecar는 시작 시 commit, tree, clean status를 모두 확인하고 하나라도
다르면 즉시 종료한다. 이후 원본의 빌드 산출물
`dist-electron/drafts.js`에서 `allDrafts`와 `upsertDraft`를 직접 호출한다.
원본 `localdb.js`가 사용하는 `electron.app.getPath('userData')`만 외부
shim이 전용 dry-run 데이터 경로로 연결한다.

로드하지 않는 원본 모듈:

- `scheduler`, `threadsApi`, `threadsOAuth`
- `llm`, `news`, `images`, `pipeline`, `autopilot`

필수 설정 키(값 제외):

- `AUTOTHREADS_SOURCE_DIR`
- `AUTOTHREADS_DATA_DIR`

복사 실행:

```sh
git clone https://github.com/eisenjimmy/autoTHREADS.git /opt/autothreads-upstream
git -C /opt/autothreads-upstream checkout --detach 3dd347e506040fbf614cd5af0dd739cbc77b8b2b
mkdir -p /var/lib/paperclip/autothreads-dry-run
AUTOTHREADS_SOURCE_DIR=/opt/autothreads-upstream \
AUTOTHREADS_DATA_DIR=/var/lib/paperclip/autothreads-dry-run \
node tools/autothreads-mcp-sidecar/smoke.cjs
```

직접 Codex 연결:

```toml
[mcp_servers.autothreads_drafts]
command = "node"
args = ["/absolute/path/to/paperclip/tools/autothreads-mcp-sidecar/server.cjs"]

[mcp_servers.autothreads_drafts.env]
AUTOTHREADS_SOURCE_DIR = "/opt/autothreads-upstream"
AUTOTHREADS_DATA_DIR = "/var/lib/paperclip/autothreads-dry-run"
```

Paperclip 관리형 연결 순서:

1. Apps → Tools & Access에서 `local_stdio` approved template를 생성한다.
2. command는 `node`, args는 `server.cjs` 절대경로 1개만 넣는다.
3. 허용 env key는 위 두 개만 등록한다. Threads/LLM secret key는 넣지 않는다.
4. 아래 세 도구 descriptor로 disabled connection을 만들고 catalog refresh한다.
5. source/list는 read 허용, create는 write/ask-first인 default-deny profile을 issue/agent에 bind한다.
6. connection을 enable하고 test call로 integrity → create → list 순서로 확인한다.

현재 에이전트의 관리형 template 등록 요청은 `Board access required`로
거부됐다. 이는 우회하지 않았으며, 관리형 gateway 등록·호출은 독립
Paperclip 개발/QA 자식 이슈에서 권한 있는 경로 또는 내부 test harness로
검증한다.

## 결과

실제 MCP stdio 교환 로그:

- `initialize`: protocol `2024-11-05`, server
  `autothreads-pinned-draft-sidecar@0.1.0`
- `tools/list`: 3개 discovery 성공
- `autothreads_source_integrity`: 고정 commit/tree, `clean: true`
- `autothreads_create_draft`: draft id `cmp-1049-dry-run-1`, status `draft`
- `autothreads_list_drafts`: 1건
- 안전 수치: secret key 전달 0, 외부 호출 0, 비용 0, publish tool 0

원시 증거는 `artifacts/CMP-1049-autothreads-mcp-smoke.ndjson`에 있다.
생성된 로컬 draft는
`artifacts/CMP-1049-autothreads-dry-run-data/autothreads-db/drafts.json`에
있으며 원본의 JSON 저장 형식이다.

### 도구 계약

| 도구 | 입력 → 출력 | 권한 | 오류 | 롤백 |
| --- | --- | --- | --- | --- |
| `autothreads_source_integrity` | `{}` → repository/commit/tree/clean | read | commit/tree/status 불일치 시 sidecar 시작 실패 | source를 고정 checkout으로 복구 |
| `autothreads_list_drafts` | `{}` → local drafts | read | 손상 JSON은 원본 로직이 `.corrupt`로 격리 | 데이터 디렉터리 백업본 복원 |
| `autothreads_create_draft` | text 1–500자, optional id → draft/count/publishable=false | write, ask-first 권장 | 잘못된 입력은 `isError`; 저장 실패는 RPC failure | 전용 `AUTOTHREADS_DATA_DIR` 제거/복원 |

`publish`, `schedule`, account, secret, OAuth 도구는 등록되지 않는다. 게시
모듈 자체도 로드되지 않는다.

## 판단

추천은 이 sidecar를 **draft-only local_stdio**로 운용하는 것이다. 원본의
draft sanitize/cache/atomic JSON save 동작을 그대로 재사용하면서 Electron
UI 전체, 계정 연결, 네트워크, 비밀, 게시 비용을 제거한다. 유지비는
작은 wrapper와 upstream 고정 버전 검증뿐이다.

대안:

- Remote gateway: 호스팅·인증·외부 노출이 추가되어 현 단계에는 과하다.
- 승인형 Threads Graph API plugin: 실계정 게시에는 적합하지만 원본 draft
  함수를 재사용하지 않으며 secret/비가역 게시 경계가 생긴다.
- Electron private IPC bridge: upstream 내부 IPC 변화에 취약하고 Electron
  전체 실행이 필요해 가장 위험하다.

## 다음 연결

실계정 전환은 이 sidecar를 조용히 확장하는 작업이 아니다. 사용자/보드가
한 번 해야 할 선택은 **“draft-only를 유지” 또는 “별도 승인형 publish
connection을 개설”**이다. 후자를 선택하면 소유자는 공간보감 CEO/보드이며,
Paperclip secret reference로 Threads access token과 user ID를 설정하고,
reviewer/approver를 지정하고, 각 publish call을 ask-first로 승인해야 한다.
게시 성공은 되돌릴 수 있다고 가정하지 않으며 불명확한 결과는 자동
재게시하지 않는다.

독립 QA는 별도 자식 이슈에서 source integrity, tool discovery, draft 생성,
publish 비노출, Paperclip 관리형 catalog/test-call 경로를 재검증한다.

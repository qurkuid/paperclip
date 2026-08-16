# CMP-1055 — autoTHREADS sidecar independent QA

## 결과

**부분 PASS / 최종 채택 검수 FAIL(관리형 연결 미검증).**

원본을 바꾸지 않는 draft-only stdio sidecar의 직접 재현은 통과했다. 다만
Paperclip API (`127.0.0.1:3100`)가 응답하지 않아 관리형 MCP 연결의 등록,
권한 정책, 실제 호출과 이슈 첨부를 검증할 수 없었다. 이 기록만으로
최종 채택을 승인해서는 안 된다.

## 목적과 범위

- CMP-1054 구현자와 독립적으로 고정 원본과 sidecar를 재현 검수한다.
- 실제 계정, 비밀값, 게시, 외부 호출, 설치, 비용 발생은 하지 않는다.

## 재현 전제와 원본 확인

검사 대상은 `artifacts/CMP-1049-autothreads-upstream`의 별도 보관 checkout이다.

```sh
git -C artifacts/CMP-1049-autothreads-upstream rev-parse HEAD
# 3dd347e506040fbf614cd5af0dd739cbc77b8b2b
git -C artifacts/CMP-1049-autothreads-upstream rev-parse 'HEAD^{tree}'
# 2f6fee3811c95ec4628ad6639f264c4aec108712
git -C artifacts/CMP-1049-autothreads-upstream status --porcelain --untracked-files=no
# (empty)
```

원본 저장소 자체에는 MCP 서버 정의가 없었다. sidecar는 원본의
`dist-electron/drafts.js`만 읽고, 원본 파일은 수정하지 않는다.

## 독립 재현 로그

새 run-owned 데이터 폴더에서 다음을 실행했다.

```sh
AUTOTHREADS_SOURCE_DIR="$PWD/artifacts/CMP-1049-autothreads-upstream" \
AUTOTHREADS_DATA_DIR="$PAPERCLIP_RUN_SCRATCH_DIR/autothreads-cmp-1055-data" \
node tools/autothreads-mcp-sidecar/smoke.cjs
```

관찰 결과:

| 단계 | 결과 |
| --- | --- |
| initialize | `autothreads-pinned-draft-sidecar` / MCP 2024-11-05 |
| tools/list | 정확히 3개: source integrity, list drafts, create draft |
| integrity | 고정 commit/tree 및 `clean: true` |
| create | `draft` 상태의 로컬 초안 1개, `publishable: false` |
| list | 초안 1개 |
| 파일 범위 | run-owned 폴더의 `autothreads-db/drafts.json` 1개 |
| rollback | 해당 run-owned 데이터 폴더 제거 후 부재 확인 |

`publish`, `schedule`, `account`, `secret` 이름의 도구는 목록에 없었다.
sidecar 코드에서 HTTP URL이나 `fetch` 호출도 발견되지 않았다. smoke 로그는
`secretKeysPassed: []`, `externalCalls: 0`, `costsIncurred: 0`을 기록했다.

## 입력·출력·권한·실패·되돌리기 계약

| 항목 | 독립 검수 결과 |
| --- | --- |
| 입력 | 생성은 text 1–500자와 선택 id 1–200자만 허용 |
| 출력 | 성공 시 local draft/count와 `publishable: false`; 오류 시 `isError: true` |
| 권한 | 코드상 두 환경 키만 필요: source 경로, 전용 data 경로. 계정·비밀값 키 없음 |
| 실패 | 빈 text → `invalid_text`; 빈 id → `invalid_id`; `autothreads_publish` → `tool_not_found` |
| 되돌리기 | 연결 비활성화/sidecar 종료 후 전용 data 폴더만 제거. 원본 checkout은 그대로 유지 |

## 비교 판단

- **native MCP:** 원본은 Electron 앱이며 MCP 서버를 제공하지 않으므로 불가.
- **remote gateway:** 초안 로컬 저장만 필요한 현재 범위에는 불필요하게 넓고 운영 위험이 크다.
- **sidecar:** 고정 원본의 draft 모듈만 호출하는 가장 작은 현재 선택지다.
- **CMP-826:** 기존 Paperclip review-gated autoTHREADS plugin은 유지한다. sidecar는
  게시 기능의 대체가 아니라, 별도 승인형 draft-only 연결 후보로만 추가 검토한다.

## 미검증 항목과 다음 연결

Paperclip API가 `curl http://127.0.0.1:3100`에서 연결 거부되어 관리형 연결
템플릿 등록, 기본 거부 권한(읽기 2개 허용/초안 생성 ask-first), catalog refresh,
test-call, 이슈 work product 업로드를 수행하지 못했다. 서버는 다른 작업자에게
영향을 줄 수 있어 재시작하지 않았다.

CEO/운영 담당자는 정상 Paperclip 서비스에서 위 관리형 경로를 한 번 검증한 뒤에만
최종 채택을 승인해야 한다. 서비스 재시작이 필요하면 복구 후 다른 에이전트 작업도
재개하도록 CEO가 조치해야 한다.

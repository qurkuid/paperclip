# CMP-1050 독립 QA 보고서

## 결론

**부분 통과, 관리형 Paperclip 경로는 검증 불가로 보류.**

sidecar 자체는 고정 원본만 읽고 로컬 초안 생성까지만 수행했다. 그러나 이 실행 환경의 Paperclip API가 `127.0.0.1:3100`에서 연결되지 않아, 승인된 템플릿 등록 → 목록 반영 → 실제 호출의 관리형 경로와 이슈 첨부를 수행할 수 없었다. 서버를 임의로 재시작하지 않았다.

## 목적·재현 범위

- 대상: `artifacts/CMP-1049-autothreads-upstream`, `tools/autothreads-mcp-sidecar`
- 제외: 실제 Threads 계정, 비밀값, 게시·예약·외부 통신·비용 발생
- 새 데이터 폴더만 사용했고 원본 저장소에는 쓰지 않았다.

## 재현 결과

재검증 시각: 2026-08-02 14:30 UTC. 새 실행 데이터 폴더에서 아래 결과를 다시 확인했다.

1. 원본 검증
   - HEAD: `3dd347e506040fbf614cd5af0dd739cbc77b8b2b`
   - tree: `2f6fee3811c95ec4628ad6639f264c4aec108712`
   - `git status --porcelain=v1 --untracked-files=all`: 출력 없음(깨끗함).

2. sidecar 직접 실행
   - 명령:

     ```sh
     env -i PATH="$PATH" \
       AUTOTHREADS_SOURCE_DIR="$PWD/artifacts/CMP-1049-autothreads-upstream" \
       AUTOTHREADS_DATA_DIR="$QA_DATA_DIR" \
       node tools/autothreads-mcp-sidecar/smoke.cjs
     ```

   - `initialize`: 성공.
   - `tools/list`: 정확히 3개 노출:
     `autothreads_source_integrity`, `autothreads_list_drafts`, `autothreads_create_draft`.
   - integrity: 위 commit/tree 및 `clean: true` 반환.
   - create: `cmp-1049-dry-run-1` 초안 1건 생성, `status: draft`, `publishable: false`.
   - list: 초안 1건 반환.
   - 생성 파일: 새 데이터 폴더의 `autothreads-db/drafts.json` 한 개.

3. 안전성
   - publish/schedule/account/secret 이름의 도구: 0개.
   - smoke 자체 기록: secret 전달 키 0개, 외부 호출 0회, 비용 0, publish 노출 없음.
   - `env -i`로 실행해 두 필수 경로 변수와 PATH 외 환경을 전달하지 않았다.
   - sidecar 코드의 환경 접근은 shim 경로 및 두 필수 데이터 경로뿐이며 HTTP/네트워크 호출 코드는 없다.

## 관리형 경로 검증

- 기존 서버 테스트에는 승인 템플릿 등록·목록 및 generic local stdio 호출 검사가 있다.
- 이 환경에서 다음 최소 테스트를 실행했으나 embedded DB 지원이 비활성화되어 전체 117개가 skip되었다.

  ```sh
  pnpm exec vitest run server/src/__tests__/tool-access-service.test.ts \
    -t 'requires tools:admin to create, list, and disable stdio command templates|launches local stdio slots only through active admin-defined templates' \
    --reporter=dot
  ```

- 현재 API에도 `curl: (7) Failed to connect to 127.0.0.1 port 3100`가 발생했다.
- 14:29 UTC 재시도에서도 `/api/health`는 `HTTP 000`(연결 거부)였고, 대상 서버 테스트는 실행 환경의 embedded DB 미지원으로 117개 전체 skip됐다.
- 14:30 UTC 최종 재시도에서도 `/api/health`와 이슈 API는 모두 `HTTP 000`(연결 거부)였다. 이 때문에 이 보고서의 첨부, 결재 요청, 이슈 상태 변경도 전송할 수 없었다.
- 따라서 **권한 있는 관리형 template → catalog → test-call은 이 실행에서 증명하지 못했다.**

## 남은 위험과 가장 작은 다음 조치

- Paperclip API와 test DB가 정상인 승인된 환경에서만, sidecar 절대 경로·두 env 키만 가진 템플릿을 생성하고, 기본 거부 정책에서 read 2개 허용 / draft 생성 ask-first를 적용한 뒤 test-call을 실행한다.
- 그 결과와 이 보고서를 이슈에 첨부한 뒤, 성공 시 [CMP-1049](/CMP/issues/CMP-1049)에 링크한다.

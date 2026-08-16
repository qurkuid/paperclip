# /af 퍼널 배포 후 5분 스모크

목적: `/af` 경로에서 발생하는 빈 화면·무한 로딩을 배포 직후 빠르게 찾는다.

## 전제 조건

- 대상 주소: `https://intm.kr`
- `curl` 점검은 공개로 가능하다. 브라우저 퍼널 점검과 퍼널 API는 **INTM 로그인 세션**이 필요하다.
- `/af/*`는 인증 프록시를 지난다. 비인증 `302 → /login?redirect=...`은 장애가 아니라 인증 게이트가 동작한 결과다.
- 인증 세션을 만들 수 없으면 운영 배포 호스트에서, `/af` 접두어를 제거해 `127.0.0.1:3100`으로 전달하는 기존 프록시 재현으로만 화면을 확인한다. 임의로 인증을 우회하지 않는다.

## 5분 절차

### 1. 공개 건강 확인

```sh
curl -si https://intm.kr/api/health
```

PASS: `200`, JSON의 `status: ok`.

### 2. 로그인 후 자산 확인

로그인된 브라우저 또는 같은 세션의 요청으로 아래 두 URL을 연다.

```text
https://intm.kr/af/@vite/client
https://intm.kr/af/src/main.tsx
```

PASS: 둘 다 `200`, `Content-Type`이 `text/javascript` 또는 JavaScript MIME. HTML 로그인 페이지·`404`·`500`이면 실패다.

### 3. 로그인 후 7·28·90일 API 확인

브라우저 개발자 도구의 Network에서 아래 요청 세 개를 확인한다. `COMPANY_ID`는 CMP 회사의 실제 UUID다.

```text
/af/api/companies/COMPANY_ID/analytics/spacebogam-funnel?rangeDays=7
/af/api/companies/COMPANY_ID/analytics/spacebogam-funnel?rangeDays=28
/af/api/companies/COMPANY_ID/analytics/spacebogam-funnel?rangeDays=90
```

PASS: 각 요청 `200` JSON, 응답의 `rangeDays`가 요청값과 같다. `401/403/404/5xx`, JSON 외 응답, 값 불일치는 실패다.

### 4. 실제 화면 확인

정확한 주소를 새 탭에서 연다.

```text
https://intm.kr/af/CMP/analytics/funnel
```

- 최초 28일 로딩이 끝난 뒤 7일, 90일을 각각 한 번 누른다.
- 각 기간에서 실제 지표가 보이고 `불러오는 중`, `다시 시도`, 오류 카드, 콘솔 오류, 실패·반복 API 요청이 없어야 한다.
- 화면 캡처 1장과 Network의 7·28·90일 응답 요약을 남긴다.

## 판정

| 결과 | 처리 |
| --- | --- |
| 건강·자산·API·화면 모두 PASS | 배포 스모크 PASS로 기록 |
| 비인증 `/af` 요청만 302 | 인증 게이트 정상. 로그인 세션으로 2~4를 계속 |
| 품질 경고만 표시 | 화면 장애가 아니다. 별도 데이터 이슈로 연결 |
| 나머지 실패 | 아래 형식으로 구현 소유자에게 즉시 반환 |

## 실패 반환 형식

```md
## /af 퍼널 스모크 FAIL

- 배포 SHA / 확인 시각:
- 로그인 상태: 로그인 세션 있음 | 프록시 재현
- 실패 URL:
- HTTP 상태 / Content-Type:
- 요청 rangeDays / 응답 rangeDays:
- 화면 증거: 캡처 첨부
- 콘솔·네트워크: 오류 1줄 또는 없음
- 재검증 조건: 수정 배포 후 1~4를 다시 실행해 해당 URL이 200이고 화면 로딩·지표가 정상일 것
```

## 자동 반복

이 문서는 수동 점검용이다. 자동 routine은 아직 등록하지 않는다. 반복 주기·예산이 필요한 경우 Growth Operations PM이 주기와 비용을 승인한 뒤, 이 절차의 1~4와 같은 PASS 기준으로 별도 routine을 만든다.

## 이번 확인

2026-07-31 공개 점검: `/api/health`는 `200 application/json`; 비인증 `/af/@vite/client`, `/af/src/main.tsx`, `/af/CMP/analytics/funnel`은 모두 로그인 URL로 `302`였다. 이는 전제 조건의 인증 게이트와 일치한다. 로그인 세션이 필요한 실제 퍼널 PASS 근거는 [CMP-490](/CMP/issues/CMP-490)에 기록되어 있다.

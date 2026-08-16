# 공간보감 퍼널 계약 모니터링

이 문서는 공간보감 퍼널의 7·28·90일 비식별 집계 계약이 이후 배포에서 다시
깨지는지 확인하는 읽기 전용 운영 절차다. 모니터는 배포, 롤백, 원천 데이터
수정, 상담 행 조회를 수행하지 않는다.

## 검사 범위

각 실행은 `spacebogam` 회사 범위의 `intm_internal_spacebogam_funnel` 도구를
7일, 28일, 90일로 한 번씩 호출한다. 다음 조건이 모두 맞으면 PASS다.

- `quality.isMonotonic`이 `true`
- `quality.leadReconciliation.funnelLeads`와 `sourceLeads`가 같고
  `missingInFunnel`이 0
- `counts.submittedLeads`와 `funnelLeads`가 같아 테스트 제외 규칙을 거친
  원천 lead와 퍼널 lead가 같은 집합으로 정렬됨
- `form_start` 단계의 `previousCount`, `conversionFromPrevious`,
  `dropOffCount`, `dropOffRate`가 모두 `null`
- 제출이 0인 일별·캠페인 행의 `visitToLeadRate`가 `null`

실패 기록에는 기간(`rangeDays`), 실패 필드(`field`), 배포 Git SHA
(`deploymentSha`)만 남긴다. 캠페인명, 원천 상담 행, 연락처, 자유기재 내용,
비밀, 실제 필드 값은 기록하지 않는다.

## 반복 실행

- 권장 주기: 매주 월요일 09:30 Asia/Seoul
- 동시 실행: 앞선 실행이 열려 있으면 합치기(`coalesce_if_active`)
- 누락 실행: 서버 중단 중 놓친 회차는 건너뛰기(`skip_missed`)
- 실패 알림 소유자: 공간보감 전략·성과 책임자
- 실행 담당: Spacebogam 웹 전환 엔지니어

반복 실행 이슈는 이 문서의 검사 범위를 그대로 따르고, 성공 시 PASS와
실행 시각만 기록한다. 실패 시 위의 최소 실패 레코드와 함께 공간보감
전략·성과 책임자를 구조화된 멘션으로 호출한다. 자동 배포·자동 롤백·운영
데이터 쓰기는 금지한다.

## 로컬 회귀 검증

```sh
pnpm exec vitest run packages/shared/src/spacebogam-funnel-monitor.test.ts
```

정상 7·28·90일 입력은 PASS하고, 단조성·lead 정렬·독립 진입점·0 제출 비율을
깨뜨린 합성 입력은 FAIL해야 한다. 검사기 결과는
`packages/shared/src/spacebogam-funnel-monitor.ts`에서 정의한다.

## 중지와 롤백

모니터를 즉시 중지하려면 Paperclip의 해당 routine을 `paused`로 바꾼다.
이 작업은 예약 실행만 중지하고 과거 실행 이슈와 증거는 보존한다. 코드
롤백이 필요하면 검사기 파일과 테스트를 직전 승인 커밋으로 되돌린 뒤 표적
테스트를 다시 실행한다.

모니터 중지나 코드 롤백은 퍼널 수집기, 상담 폼, 운영 데이터에 영향을 주지
않는다. routine을 다시 켤 때는 독립 QA 통과와 공간보감 전략·성과 책임자의
운영 승인을 먼저 확인한다.

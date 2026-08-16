# CMP-543 운영 HEAD 보존 퍼널 릴리스 후보

## 1. 배경

기존 승인 후보 `c5748b9fde37e06cbe6f4dd02fd4edcc5a16d0e9`와 현재 운영
HEAD `e967cf50d6985f8b531782b8ce106139f74dfab4`가 공통 기준
`015b7c91e2c79b44b4daecf35f5d4942eea86078` 이후 분기되어 있었다.
기존 승인 후보를 운영에 그대로 적용하면 CMP-399의 Instagram carousel 복구 변경
7개 파일이 역행하므로, 운영 HEAD를 보존하는 새 후보가 필요했다.

## 2. 실행

- 후보 브랜치: `paperclip/cmp-543-funnel-release-candidate`
- 새 후보 SHA: `10135fc60e49dad4dbf5d47bd7899692008f6a9d`
- 첫 부모·운영 기준 SHA: `e967cf50d6985f8b531782b8ce106139f74dfab4`
- 둘째 부모·검증된 퍼널 후보 SHA: `c5748b9fde37e06cbe6f4dd02fd4edcc5a16d0e9`
- 공통 기준 SHA: `015b7c91e2c79b44b4daecf35f5d4942eea86078`
- 방식: 운영 SHA를 첫 부모로 두고 검증된 퍼널 후보를 병합했다.
- 운영 배포, DB 변경, 원천 상담 데이터 변경은 수행하지 않았다.

## 3. 결과

### 운영 기준 대비 변경

```text
9 files changed, 238 insertions(+), 59 deletions(-)
```

변경 파일은 아래 퍼널 코드·회귀 테스트 9개뿐이다.

```text
src/lib/spacebogam-funnel/analytics.ts
src/lib/spacebogam-funnel/leadReconciliation.ts
src/lib/spacebogam-funnel/repository-report-inputs.ts
src/lib/spacebogam-funnel/repository.ts
src/lib/spacebogam-funnel/tenantScope.ts
tests/spacebogam-consultation-tracking.spec.ts
tests/spacebogam-funnel-analytics.spec.ts
tests/spacebogam-funnel-repository.spec.ts
tests/spacebogam-funnel-service.spec.ts
```

운영 기준 대비 후보 패치와 공통 기준 대비 기존 승인 후보 패치의 SHA-256은
모두 아래 값으로 동일했다. 즉, 새 후보는 운영 변경을 보존하면서 기존 퍼널
계약의 전체 순변경만 추가한다.

```text
bcf25493615d17f590022203e17f96921faebf0a5358d35c89c05efd418a9adf
```

### CMP-399 7개 보호 파일

아래 7개 파일은 운영 SHA와 새 후보의 Git blob SHA가 모두 동일했다.

```text
PASS .github/workflows/deploy.yml bccb71aaf33eabdfb82c65fb1509b5d6e7ca09c0
PASS docs/instagram-publishing-formats.md 4a23061250a88af2d208bab083c4a36d22665f10
PASS migrations/20260730_01_approved_content_carousel_children.rollback.sql 5e80b911786d27cf258d691bf212a76b11f41aee
PASS migrations/20260730_01_approved_content_carousel_children.sql 75cd6395e3e5bbe8333dec5a6376af72494a7922
PASS scripts/cmp399-carousel-schema-state.sql 9a7588577e1d16b09d3f1ff46aa5327103f7a76e
PASS src/lib/paperclip-intm-mcp/__tests__/approved-content-carousel.test.ts 40adec4f886f3e312ad2051c3779119e9dad4c45
PASS src/lib/paperclip-intm-mcp/approved-content-publishing.ts 872607cf72bc2118583c8274b486d62003871051
```

### 회귀 검증

실행 명령:

```sh
node --import tsx --test \
  tests/spacebogam-funnel-analytics.spec.ts \
  tests/spacebogam-funnel-repository.spec.ts \
  tests/spacebogam-funnel-service.spec.ts \
  tests/spacebogam-funnel-tenant-scope.spec.ts \
  tests/spacebogam-consultation-tracking.spec.ts
```

결과:

```text
tests 57
pass 57
fail 0
duration_ms 304.844292
```

`CMP-512: 7, 28, and 90 day reports keep parallel entries monotonic and
reconciled` 단언도 통과했다.

## 4. 판단

추천안은 이 후보를 독립 QA에 넘기고, QA 통과 후 공간보감 전략·성과 책임자가
운영 반영 여부를 다시 결재하는 것이다. 현재 확인된 남은 위험은 실제 운영 DB
데이터를 읽는 독립 대조와 운영 반영 시점의 HEAD 재확인이다.

## 5. 다음 연결

1. QA·버그 트리아지 엔지니어가 후보 SHA, 7개 보호 파일, 7·28·90일 회귀를 독립 검증한다.
2. QA 통과 후 공간보감 전략·성과 책임자가 운영 영향과 롤백 가능성을 확인하고 재결재한다.
3. 결재 직전 원격 `main` SHA가 여전히 기준 SHA인지 확인한다. 달라졌다면 다시 후보를 재구성한다.

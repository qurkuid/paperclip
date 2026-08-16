import { useQueryClient } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type {
  IssueDocument,
  RequestItemVerdictsInteraction,
} from "@paperclipai/shared";
import { IssueThreadInteractionCard } from "@/components/IssueThreadInteractionCard";
import { RequestItemVerdictReviewDocument } from "@/components/RequestItemVerdictReviewDocument";
import { queryKeys } from "@/lib/queryKeys";

const issueId = "42a13614-ed5d-44a7-bee3-b78f8dd56049";
const revisionId = "11111111-1111-4111-8111-111111111111";

const interaction: RequestItemVerdictsInteraction = {
  id: "interaction-content-review",
  companyId: "company-storybook",
  issueId,
  kind: "request_item_verdicts",
  title: "첫 주 SNS 콘텐츠 1차 검수",
  summary: "5 items to verdict",
  status: "pending",
  continuationPolicy: "wake_assignee",
  createdByAgentId: "agent-codex",
  createdByUserId: null,
  resolvedByAgentId: null,
  resolvedByUserId: null,
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  updatedAt: new Date("2026-07-25T00:00:00.000Z"),
  resolvedAt: null,
  payload: {
    version: 1,
    prompt: "각 항목을 승인·반려·보류 중 하나로 판정해 주세요.",
    detailsMarkdown: "문안과 이미지 구성을 확인한 뒤 항목별로 결정하세요.",
    items: [
      {
        id: "day-1",
        label: "Day 1 수납 동선 캐러셀",
        description: "정확한 정규화 해시 후보가 있는 저장 유도 초안.",
      },
      {
        id: "day-3",
        label: "Day 3 실측·설비·동선 릴스",
        description: "공개 승인 B-roll·시설별 확인이 없어 보류.",
      },
      {
        id: "day-4",
        label: "Day 4 상담 전 우선순위 캐러셀",
        description: "DM 유도 문구와 텍스트 톤이 초안.",
      },
    ],
    verdicts: ["approve", "reject", "defer"],
    requireReasonOn: ["reject"],
    target: {
      type: "issue_document",
      issueId,
      key: "content-review-package",
      revisionId,
      revisionNumber: 1,
    },
  },
  result: null,
};

const document: IssueDocument = {
  id: "document-content-review",
  companyId: "company-storybook",
  issueId,
  key: "content-review-package",
  title: "첫 주 SNS 콘텐츠 검수 패키지",
  format: "markdown",
  body: [
    "# Day 1 수납 동선 캐러셀",
    "",
    "### 1장",
    "예쁜 수납보다 먼저 정해야 하는 건 **집 안에서 물건이 움직이는 길**입니다.",
    "",
    "### 2장",
    "현관에는 외출 물품, 주방 입구에는 장보기 물품, 세탁실 앞에는 세탁 대기 물품을 둡니다.",
    "",
    "> 저장해 두고 입주 전 수납 계획에 체크하세요.",
    "",
    "# Day 3 실측·설비·동선 릴스",
    "",
    "실측 장면 → 설비 위치 확인 → 생활 동선 표시 순서의 15초 릴스 초안입니다.",
    "",
    "# Day 4 상담 전 우선순위 캐러셀",
    "",
    "상담 전에 예산, 일정, 꼭 지킬 공간 세 가지를 먼저 적어 두도록 안내합니다.",
  ].join("\n"),
  latestRevisionId: revisionId,
  latestRevisionNumber: 1,
  createdByAgentId: "agent-codex",
  createdByUserId: null,
  updatedByAgentId: "agent-codex",
  updatedByUserId: null,
  lockedAt: null,
  lockedByAgentId: null,
  lockedByUserId: null,
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  updatedAt: new Date("2026-07-25T00:00:00.000Z"),
};

function ReviewSurface() {
  const queryClient = useQueryClient();
  queryClient.setQueryData(
    queryKeys.issues.document(issueId, document.key),
    document,
  );

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <RequestItemVerdictReviewDocument
          issueId={issueId}
          interaction={interaction}
        />
        <IssueThreadInteractionCard interaction={interaction} />
      </div>
    </main>
  );
}

const meta = {
  title: "Interactions/Item Verdict Content Review",
  component: ReviewSurface,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ReviewSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

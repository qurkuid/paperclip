import { describe, expect, it } from "vitest";
import type { AttentionItem } from "@paperclipai/shared";
import {
  getInboxReviewRequestIssueId,
  matchesInboxReviewRequestSearch,
  selectInboxReviewRequests,
} from "./inbox-review-requests";

function makeAttentionItem(
  overrides: Partial<AttentionItem> & Pick<AttentionItem, "id" | "sourceKind">,
): AttentionItem {
  const issueId = "issue-1";
  const { id, sourceKind, ...rest } = overrides;
  return {
    id,
    companyId: "company-1",
    sourceKind,
    subject: {
      kind: sourceKind === "review" ? "issue" : "interaction",
      id,
      companyId: "company-1",
      title: "대표 검수 요청",
      identifier: null,
      status: "pending",
      href: `/CMP/issues/CMP-10#interaction-${id}`,
      metadata: { issueId },
    },
    whyNow: "대표 검토가 필요합니다.",
    decisionVerbs: [],
    inlineResolvable: sourceKind === "issue_thread_interaction",
    entryRule: "pending",
    exitRule: "resolved",
    dedupKey: id,
    dismissalKey: `attention:${id}`,
    dismissal: null,
    severity: "medium",
    rank: 10,
    activityAt: "2026-07-24T14:42:13.730Z",
    createdAt: "2026-07-24T14:42:13.730Z",
    updatedAt: "2026-07-24T14:42:13.730Z",
    relatedIssue: {
      kind: "issue",
      id: issueId,
      companyId: "company-1",
      title: "OpenCrab 인스타그램 피드 이미지 제작",
      identifier: "CMP-10",
      status: "in_review",
      href: "/CMP/issues/CMP-10",
    },
    project: null,
    workspace: null,
    detail: null,
    trainingExampleId: null,
    ...rest,
  };
}

describe("inbox review requests", () => {
  it("keeps only actionable review sources and prefers a pending interaction for the same issue", () => {
    const genericReview = makeAttentionItem({ id: "review-1", sourceKind: "review" });
    const interaction = makeAttentionItem({
      id: "interaction-1",
      sourceKind: "issue_thread_interaction",
    });
    const approval = makeAttentionItem({ id: "approval-1", sourceKind: "approval" });

    expect(selectInboxReviewRequests([genericReview, approval, interaction])).toEqual([interaction]);
  });

  it("resolves the related issue and searches both issue and request copy", () => {
    const item = makeAttentionItem({
      id: "interaction-1",
      sourceKind: "issue_thread_interaction",
    });

    expect(getInboxReviewRequestIssueId(item)).toBe("issue-1");
    expect(matchesInboxReviewRequestSearch(item, "cmp-10")).toBe(true);
    expect(matchesInboxReviewRequestSearch(item, "대표 검수")).toBe(true);
    expect(matchesInboxReviewRequestSearch(item, "무관한 검색")).toBe(false);
  });
});

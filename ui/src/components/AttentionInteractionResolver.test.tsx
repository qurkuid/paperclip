// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  IssueDocument,
  RequestItemVerdictsInteraction,
} from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { AttentionInteractionResolver } from "./AttentionInteractionResolver";
import { normalizeReviewMarkdownHeadings } from "./RequestItemVerdictReviewDocument";

vi.mock("@/lib/router", () => ({
  Link: ({
    children,
    to,
  }: {
    children: ReactNode;
    to: string;
  }) => <a href={to}>{children}</a>,
}));

vi.mock("../api/issues", () => ({
  issuesApi: {
    listInteractions: vi.fn(),
    getDocument: vi.fn(),
    acceptInteraction: vi.fn(),
    rejectInteraction: vi.fn(),
    respondToInteraction: vi.fn(),
    cancelInteraction: vi.fn(),
    submitInteractionVerdicts: vi.fn(),
  },
}));

vi.mock("./IssueThreadInteractionCard", () => ({
  IssueThreadInteractionCard: () => <div>Verdict controls</div>,
}));

vi.mock("./MarkdownBody", () => ({
  MarkdownBody: ({ children }: { children: string }) => <div>{children}</div>,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const issueId = "42a13614-ed5d-44a7-bee3-b78f8dd56049";
const revisionId = "11111111-1111-4111-8111-111111111111";

const interaction: RequestItemVerdictsInteraction = {
  id: "interaction-verdicts",
  companyId: "company-1",
  issueId,
  kind: "request_item_verdicts",
  title: "첫 주 SNS 콘텐츠 1차 검수",
  summary: "5 items to verdict",
  status: "pending",
  continuationPolicy: "wake_assignee",
  createdByAgentId: "agent-1",
  createdByUserId: null,
  resolvedByAgentId: null,
  resolvedByUserId: null,
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  updatedAt: new Date("2026-07-25T00:00:00.000Z"),
  resolvedAt: null,
  payload: {
    version: 1,
    prompt: "각 항목을 승인·반려·보류 중 하나로 판정해 주세요.",
    items: [
      {
        id: "day-1",
        label: "Day 1 수납 동선 캐러셀",
        description: "저장 유도 초안",
      },
    ],
    verdicts: ["approve", "reject", "defer"],
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

const reviewDocument: IssueDocument = {
  id: "document-1",
  companyId: "company-1",
  issueId,
  key: "content-review-package",
  title: "첫 주 SNS 콘텐츠 검수 패키지",
  format: "markdown",
  body: [
    "# Day 1 수납 동선 캐러셀",
    "",
    "슬라이드 1: 현관에서 주방까지 자주 쓰는 물건의 자리를 먼저 정하세요.",
    "",
    "CTA: 저장해 두고 입주 전에 체크하세요.",
  ].join("\n"),
  latestRevisionId: revisionId,
  latestRevisionNumber: 1,
  createdByAgentId: "agent-1",
  createdByUserId: null,
  updatedByAgentId: "agent-1",
  updatedByUserId: null,
  lockedAt: null,
  lockedByAgentId: null,
  lockedByUserId: null,
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  updatedAt: new Date("2026-07-25T00:00:00.000Z"),
};

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.clearAllMocks();
});

async function renderResolver() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <AttentionInteractionResolver
          companyId="company-1"
          issueId={issueId}
          interactionId={interaction.id}
        />
      </QueryClientProvider>,
    );
  });

  return host;
}

describe("AttentionInteractionResolver", () => {
  it("nests review-document headings without skipping levels", () => {
    const markdown = [
      "# Day 1",
      "### 1장",
      "```md",
      "# 코드 예시",
      "```",
      "# Day 3",
    ].join("\n");

    expect(normalizeReviewMarkdownHeadings(markdown)).toBe([
      "#### Day 1",
      "##### 1장",
      "```md",
      "# 코드 예시",
      "```",
      "#### Day 3",
    ].join("\n"));
  });

  it("shows the targeted review document above the verdict controls", async () => {
    vi.mocked(issuesApi.listInteractions).mockResolvedValue([interaction]);
    vi.mocked(issuesApi.getDocument).mockResolvedValue(reviewDocument);

    const element = await renderResolver();

    await act(async () => {
      await vi.waitFor(() => {
        expect(issuesApi.getDocument).toHaveBeenCalledWith(
          issueId,
          "content-review-package",
        );
        expect(element.textContent).toContain("Content to review");
        expect(element.textContent).toContain("Day 1 수납 동선 캐러셀");
        expect(element.textContent).toContain("슬라이드 1");
        expect(element.textContent).toContain("Verdict controls");
      });
    });
  });
});

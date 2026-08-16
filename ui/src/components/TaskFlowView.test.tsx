// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { act, type AnchorHTMLAttributes } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskFlowView } from "./TaskFlowView";

const mockIssuesApi = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
}));

vi.mock("../api/issues", () => ({
  issuesApi: mockIssuesApi,
}));

vi.mock("@/lib/router", () => ({
  Link: ({
    children,
    to,
    state: _state,
    issuePrefetch: _issuePrefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    state?: unknown;
    issuePrefetch?: unknown;
  }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function createIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "CMP-1",
    companyId: "company-1",
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Task",
    description: null,
    status: "todo",
    workMode: "standard",
    priority: "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    responsibleUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    issueNumber: 1,
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("TaskFlowView", () => {
  beforeEach(() => {
    mockIssuesApi.get.mockReset();
    mockIssuesApi.list.mockReset();
    mockIssuesApi.list.mockResolvedValue([]);
  });

  it("focuses the user's instruction and reveals a completed child's result", async () => {
    const otherRoot = createIssue({
      id: "other-root",
      identifier: "CMP-1",
      title: "Someone else's task",
    });
    const myInstruction = createIssue({
      id: "my-root",
      identifier: "CMP-2",
      title: "Build the campaign report",
      createdByUserId: "user-1",
    });
    const completedChild = createIssue({
      id: "completed-child",
      identifier: "CMP-3",
      parentId: "my-root",
      title: "Verify production numbers",
      status: "done",
      completedAt: new Date("2026-07-30T01:00:00.000Z"),
    });
    mockIssuesApi.get.mockImplementation(async (id: string) => {
      if (id === "completed-child") {
        return {
          ...completedChild,
          workProducts: [{
            id: "work-product-1",
            companyId: "company-1",
            projectId: null,
            issueId: "completed-child",
            executionWorkspaceId: null,
            runtimeServiceId: null,
            type: "preview_url",
            provider: "custom",
            externalId: null,
            title: "Production report",
            url: "https://example.com/report",
            status: "ready_for_review",
            reviewState: "needs_board_review",
            isPrimary: true,
            healthStatus: "healthy",
            summary: "Numbers verified",
            metadata: null,
            createdByRunId: null,
            createdAt: new Date("2026-07-30T01:00:00.000Z"),
            updatedAt: new Date("2026-07-30T01:00:00.000Z"),
          }],
        };
      }
      return myInstruction;
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      flushSync(() => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <TaskFlowView
              issues={[otherRoot, myInstruction, completedChild]}
              agents={[]}
              currentUserId="user-1"
              liveIssueIds={new Set()}
            />
          </QueryClientProvider>,
        );
      });
    });
    await flush();

    expect((container.querySelector("[aria-label='지시 작업 선택']") as HTMLSelectElement).value)
      .toBe("my-root");
    expect(mockIssuesApi.list).toHaveBeenCalledWith("company-1", {
      descendantOf: "my-root",
      includeBlockedBy: true,
      limit: 200,
    });
    const nodeText = Array.from(container.querySelectorAll("[data-task-flow-node]"))
      .map((node) => node.textContent)
      .join(" ");
    expect(nodeText).toContain("Build the campaign report");
    expect(nodeText).toContain("Verify production numbers");
    expect(nodeText).not.toContain("Someone else's task");
    expect(container.querySelectorAll("[data-edge-kind='parent']")).toHaveLength(1);

    const resultNode = container.querySelector("[aria-label='CMP-3 Verify production numbers']");
    act(() => {
      flushSync(() => {
        resultNode?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    });
    await flush();

    expect(mockIssuesApi.get).toHaveBeenCalledWith("completed-child");
    expect(container.textContent).toContain("Production report");
    expect(container.textContent).toContain("Numbers verified");

    act(() => {
      flushSync(() => root.unmount());
    });
    container.remove();
  });
});

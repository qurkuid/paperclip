import type { Issue } from "@paperclipai/shared";
import { describe, expect, it } from "vitest";
import { buildTaskFlowModel, findTaskFlowRoots } from "./issue-flow";

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

describe("findTaskFlowRoots", () => {
  it("prioritizes the current user's instructions before other visible roots", () => {
    const otherRoot = createIssue({
      id: "other-root",
      identifier: "CMP-1",
      updatedAt: new Date("2026-07-30T03:00:00.000Z"),
    });
    const myInstruction = createIssue({
      id: "my-instruction",
      identifier: "CMP-2",
      createdByUserId: "user-1",
      updatedAt: new Date("2026-07-30T02:00:00.000Z"),
    });

    expect(findTaskFlowRoots([otherRoot, myInstruction], "user-1").map((issue) => issue.id))
      .toEqual(["my-instruction", "other-root"]);
  });
});

describe("buildTaskFlowModel", () => {
  it("builds only the selected instruction subtree with hierarchy and blocker edges", () => {
    const root = createIssue({ id: "root", identifier: "CMP-10" });
    const firstChild = createIssue({
      id: "child-a",
      identifier: "CMP-11",
      parentId: "root",
      requestDepth: 1,
    });
    const secondChild = createIssue({
      id: "child-b",
      identifier: "CMP-12",
      parentId: "root",
      requestDepth: 1,
      status: "blocked",
      blockedBy: [{
        id: "child-a",
        identifier: "CMP-11",
        title: "First child",
        status: "todo",
        priority: "medium",
        assigneeAgentId: null,
        assigneeUserId: null,
      }],
    });
    const grandchild = createIssue({
      id: "grandchild",
      identifier: "CMP-13",
      parentId: "child-a",
      requestDepth: 2,
      status: "done",
    });
    const unrelated = createIssue({ id: "unrelated", identifier: "CMP-99" });

    const model = buildTaskFlowModel(
      [root, firstChild, secondChild, grandchild, unrelated],
      "root",
    );

    expect(model.nodes.map((node) => [node.issue.id, node.depth, node.row])).toEqual([
      ["root", 0, 0],
      ["child-a", 1, 0],
      ["child-b", 1, 1],
      ["grandchild", 2, 0],
    ]);
    expect(model.edges.map((edge) => [edge.fromId, edge.toId, edge.kind])).toEqual([
      ["root", "child-a", "parent"],
      ["root", "child-b", "parent"],
      ["child-a", "grandchild", "parent"],
      ["child-a", "child-b", "blocker"],
    ]);
    expect(model.summary).toEqual({
      delegatedCount: 3,
      completedCount: 1,
      blockedCount: 1,
    });
  });
});

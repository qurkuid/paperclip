import type { Issue } from "@paperclipai/shared";

export const TASK_FLOW_NODE_WIDTH = 248;
export const TASK_FLOW_NODE_HEIGHT = 96;
export const TASK_FLOW_COLUMN_GAP = 72;
export const TASK_FLOW_ROW_GAP = 28;
export const TASK_FLOW_CANVAS_PADDING = 28;

export type TaskFlowEdgeKind = "parent" | "blocker";

export interface TaskFlowNode {
  issue: Issue;
  depth: number;
  row: number;
  x: number;
  y: number;
}

export interface TaskFlowEdge {
  id: string;
  fromId: string;
  toId: string;
  kind: TaskFlowEdgeKind;
}

export interface TaskFlowModel {
  root: Issue | null;
  nodes: TaskFlowNode[];
  edges: TaskFlowEdge[];
  canvasWidth: number;
  canvasHeight: number;
  summary: {
    delegatedCount: number;
    completedCount: number;
    blockedCount: number;
  };
}

export function taskFlowEdgePath(from: TaskFlowNode, to: TaskFlowNode, blocker: boolean): string {
  if (blocker && to.x <= from.x) {
    const startX = from.x + TASK_FLOW_NODE_WIDTH / 2;
    const startY = from.y + TASK_FLOW_NODE_HEIGHT;
    const endX = to.x + TASK_FLOW_NODE_WIDTH / 2;
    const endY = to.y;
    const middleY = startY + (endY - startY) / 2;
    return `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`;
  }
  const startX = from.x + TASK_FLOW_NODE_WIDTH;
  const startY = from.y + TASK_FLOW_NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + TASK_FLOW_NODE_HEIGHT / 2;
  const middleX = startX + (endX - startX) / 2;
  return `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`;
}

function compareUpdatedDesc(left: Issue, right: Issue): number {
  return right.updatedAt.getTime() - left.updatedAt.getTime();
}

export function findTaskFlowRoots(issues: Issue[], currentUserId: string | null): Issue[] {
  const issueIds = new Set(issues.map((issue) => issue.id));
  const visibleRoots = issues.filter((issue) => !issue.parentId || !issueIds.has(issue.parentId));
  const myInstructions = currentUserId
    ? issues.filter((issue) => issue.createdByUserId === currentUserId)
    : [];
  const orderedCandidates = [
    ...myInstructions.sort(compareUpdatedDesc),
    ...visibleRoots.sort(compareUpdatedDesc),
  ];
  const seen = new Set<string>();

  return orderedCandidates.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
}

function emptyTaskFlowModel(): TaskFlowModel {
  return {
    root: null,
    nodes: [],
    edges: [],
    canvasWidth: 0,
    canvasHeight: 0,
    summary: {
      delegatedCount: 0,
      completedCount: 0,
      blockedCount: 0,
    },
  };
}

export function buildTaskFlowModel(issues: Issue[], rootId: string): TaskFlowModel {
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const root = issueById.get(rootId);
  if (!root) return emptyTaskFlowModel();

  const childrenByParentId = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (!issue.parentId || !issueById.has(issue.parentId)) continue;
    const children = childrenByParentId.get(issue.parentId) ?? [];
    children.push(issue);
    childrenByParentId.set(issue.parentId, children);
  }

  const nodes: TaskFlowNode[] = [];
  const edges: TaskFlowEdge[] = [];
  const seen = new Set<string>([root.id]);
  let frontier: Array<{ issue: Issue; depth: number }> = [{ issue: root, depth: 0 }];
  let maxDepth = 0;
  let maxRows = 1;

  while (frontier.length > 0) {
    const nextFrontier: Array<{ issue: Issue; depth: number }> = [];
    const rowByDepth = new Map<number, number>();

    for (const entry of frontier) {
      const row = rowByDepth.get(entry.depth) ?? nodes.filter((node) => node.depth === entry.depth).length;
      rowByDepth.set(entry.depth, row + 1);
      nodes.push({
        issue: entry.issue,
        depth: entry.depth,
        row,
        x: TASK_FLOW_CANVAS_PADDING + entry.depth * (TASK_FLOW_NODE_WIDTH + TASK_FLOW_COLUMN_GAP),
        y: TASK_FLOW_CANVAS_PADDING + row * (TASK_FLOW_NODE_HEIGHT + TASK_FLOW_ROW_GAP),
      });
      maxDepth = Math.max(maxDepth, entry.depth);
      maxRows = Math.max(maxRows, row + 1);

      for (const child of childrenByParentId.get(entry.issue.id) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        edges.push({
          id: `parent:${entry.issue.id}:${child.id}`,
          fromId: entry.issue.id,
          toId: child.id,
          kind: "parent",
        });
        nextFrontier.push({ issue: child, depth: entry.depth + 1 });
      }
    }

    frontier = nextFrontier;
  }

  const visibleIssueIds = new Set(nodes.map((node) => node.issue.id));
  for (const node of nodes) {
    for (const blocker of node.issue.blockedBy ?? []) {
      if (!visibleIssueIds.has(blocker.id) || blocker.id === node.issue.id) continue;
      edges.push({
        id: `blocker:${blocker.id}:${node.issue.id}`,
        fromId: blocker.id,
        toId: node.issue.id,
        kind: "blocker",
      });
    }
  }

  return {
    root,
    nodes,
    edges,
    canvasWidth:
      TASK_FLOW_CANVAS_PADDING * 2
      + (maxDepth + 1) * TASK_FLOW_NODE_WIDTH
      + maxDepth * TASK_FLOW_COLUMN_GAP,
    canvasHeight:
      TASK_FLOW_CANVAS_PADDING * 2
      + maxRows * TASK_FLOW_NODE_HEIGHT
      + (maxRows - 1) * TASK_FLOW_ROW_GAP,
    summary: {
      delegatedCount: Math.max(0, nodes.length - 1),
      completedCount: nodes.filter((node) => node.issue.status === "done").length,
      blockedCount: nodes.filter((node) => node.issue.status === "blocked").length,
    },
  };
}

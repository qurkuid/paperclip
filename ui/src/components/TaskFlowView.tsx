import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { GitBranch, Radio, Route } from "lucide-react";
import { issuesApi } from "../api/issues";
import {
  buildTaskFlowModel,
  findTaskFlowRoots,
  TASK_FLOW_NODE_HEIGHT,
  TASK_FLOW_NODE_WIDTH,
  taskFlowEdgePath,
} from "../lib/issue-flow";
import { queryKeys } from "../lib/queryKeys";
import { statusBadge } from "../lib/status-colors";
import { cn } from "../lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatusIcon } from "./StatusIcon";
import { TaskFlowDetailPanel } from "./TaskFlowDetailPanel";

interface TaskFlowAgent {
  id: string;
  name: string;
}

interface TaskFlowViewProps {
  issues: Issue[];
  agents: TaskFlowAgent[];
  currentUserId: string | null;
  liveIssueIds: Set<string>;
  issueLinkState?: unknown;
}

const statusLabels: Record<Issue["status"], string> = {
  backlog: "대기",
  todo: "할 일",
  in_progress: "진행 중",
  in_review: "검토 중",
  done: "완료",
  blocked: "차단",
  cancelled: "취소",
};

function taskStage(issue: Issue, rootId: string, isLive: boolean): string {
  if (issue.id === rootId) return "지시";
  if (issue.status === "done" || issue.status === "cancelled") return "결과";
  if (issue.status === "in_review") return "검토";
  if (issue.status === "in_progress" || isLive) return "실행";
  return "위임";
}

export function TaskFlowView({
  issues,
  agents,
  currentUserId,
  liveIssueIds,
  issueLinkState,
}: TaskFlowViewProps) {
  const roots = useMemo(() => findTaskFlowRoots(issues, currentUserId), [currentUserId, issues]);
  const [selectedRootId, setSelectedRootId] = useState("");
  const effectiveRootId = roots.some((issue) => issue.id === selectedRootId)
    ? selectedRootId
    : roots[0]?.id ?? "";
  const rootIssue = issues.find((issue) => issue.id === effectiveRootId) ?? null;
  const descendantsQuery = useQuery({
    queryKey: [
      ...queryKeys.issues.listByDescendantRoot(rootIssue?.companyId ?? "__none__", effectiveRootId),
      "task-flow-with-blockers",
    ],
    queryFn: () => issuesApi.list(rootIssue?.companyId ?? "", {
      descendantOf: effectiveRootId,
      includeBlockedBy: true,
      limit: 200,
    }),
    enabled: Boolean(rootIssue),
  });
  const flowIssues = useMemo(() => {
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    for (const issue of descendantsQuery.data ?? []) issueById.set(issue.id, issue);
    return Array.from(issueById.values());
  }, [descendantsQuery.data, issues]);
  const model = useMemo(
    () => buildTaskFlowModel(flowIssues, effectiveRootId),
    [effectiveRootId, flowIssues],
  );
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const selectedNode = model.nodes.find((node) => node.issue.id === selectedIssueId)
    ?? model.nodes[0]
    ?? null;
  const selectedIssue = selectedNode?.issue ?? null;
  const selectedDetailQuery = useQuery({
    queryKey: queryKeys.issues.detail(selectedIssue?.id ?? "__none__"),
    queryFn: () => issuesApi.get(selectedIssue?.id ?? ""),
    enabled: Boolean(selectedIssue),
  });
  const selectedDetail = selectedDetailQuery.data ?? selectedIssue;
  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );
  const nodeById = useMemo(
    () => new Map(model.nodes.map((node) => [node.issue.id, node])),
    [model.nodes],
  );

  if (roots.length === 0) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-center">
        <GitBranch className="mb-3 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">흐름으로 표시할 작업이 없습니다.</p>
        <p className="mt-1 text-xs text-muted-foreground">필터나 검색 조건을 조정해 주세요.</p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <header className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
            <Route className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">지시 작업 흐름</p>
            <select
              aria-label="지시 작업 선택"
              value={effectiveRootId}
              onChange={(event) => {
                setSelectedRootId(event.target.value);
                setSelectedIssueId(event.target.value);
              }}
              className="mt-0.5 h-8 max-w-full rounded-md border border-input bg-background px-2 text-sm font-medium outline-none focus:border-ring"
            >
              {roots.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  {issue.identifier ?? issue.id.slice(0, 8)} · {issue.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-background text-center">
          <div className="px-4 py-1.5">
            <div className="text-base font-semibold">{model.summary.delegatedCount}</div>
            <div className="text-[10px] text-muted-foreground">위임</div>
          </div>
          <div className="px-4 py-1.5">
            <div className="text-base font-semibold text-green-700 dark:text-green-300">{model.summary.completedCount}</div>
            <div className="text-[10px] text-muted-foreground">완료</div>
          </div>
          <div className="px-4 py-1.5">
            <div className="text-base font-semibold text-red-700 dark:text-red-300">{model.summary.blockedCount}</div>
            <div className="text-[10px] text-muted-foreground">차단</div>
          </div>
        </div>
      </header>

      <div className="grid min-h-[430px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-auto bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] bg-[size:20px_20px]">
          <div
            className="relative min-h-[430px] min-w-full"
            style={{ width: Math.max(model.canvasWidth, 720), height: Math.max(model.canvasHeight, 430) }}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <defs>
                <marker id="task-flow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" className="fill-border" />
                </marker>
                <marker id="task-flow-blocker-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" className="fill-red-400" />
                </marker>
              </defs>
              {model.edges.map((edge) => {
                const from = nodeById.get(edge.fromId);
                const to = nodeById.get(edge.toId);
                if (!from || !to) return null;
                const blocker = edge.kind === "blocker";
                return (
                  <path
                    key={edge.id}
                    data-edge-kind={edge.kind}
                    d={taskFlowEdgePath(from, to, blocker)}
                    fill="none"
                    className={cn(blocker ? "stroke-red-400/80" : "stroke-border", blocker && "[stroke-dasharray:5_4]")}
                    strokeWidth={blocker ? 1.5 : 2}
                    markerEnd={blocker ? "url(#task-flow-blocker-arrow)" : "url(#task-flow-arrow)"}
                  />
                );
              })}
            </svg>
            {model.nodes.map((node) => {
              const issue = node.issue;
              const isLive = liveIssueIds.has(issue.id);
              const assigneeName = issue.assigneeAgentId
                ? agentNameById.get(issue.assigneeAgentId) ?? "알 수 없는 에이전트"
                : issue.assigneeUserId
                  ? "사용자"
                  : "미배정";
              return (
                <button
                  key={issue.id}
                  type="button"
                  data-task-flow-node
                  aria-label={`${issue.identifier ?? issue.id.slice(0, 8)} ${issue.title}`}
                  onClick={() => setSelectedIssueId(issue.id)}
                  className={cn(
                    "absolute flex flex-col rounded-lg border bg-background p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedIssue?.id === issue.id ? "border-foreground/50 ring-1 ring-foreground/10" : "border-border",
                  )}
                  style={{ left: node.x, top: node.y, width: TASK_FLOW_NODE_WIDTH, height: TASK_FLOW_NODE_HEIGHT }}
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {issue.identifier ?? issue.id.slice(0, 8)}
                    </span>
                    <Badge className={cn("h-4 px-1.5 text-[9px] font-medium", statusBadge[issue.status])}>
                      {taskStage(issue, effectiveRootId, isLive)}
                    </Badge>
                    {isLive ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-medium text-blue-600 dark:text-blue-300">
                        <Radio className="h-2.5 w-2.5 animate-pulse" /> LIVE
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-1.5 line-clamp-2 text-xs font-medium leading-4">{issue.title}</span>
                  <div className="mt-auto flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="truncate">{assigneeName}</span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <StatusIcon status={issue.status} size="sm" />
                      {statusLabels[issue.status]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <TaskFlowDetailPanel
          issue={selectedDetail}
          isFetching={selectedDetailQuery.isFetching}
          stage={selectedDetail
            ? taskStage(selectedDetail, effectiveRootId, liveIssueIds.has(selectedDetail.id))
            : ""}
          statusLabel={selectedDetail ? statusLabels[selectedDetail.status] : ""}
          issueLinkState={issueLinkState}
        />
      </div>
    </section>
  );
}

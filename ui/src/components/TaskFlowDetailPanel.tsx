import type { Issue } from "@paperclipai/shared";
import { ExternalLink, Loader2 } from "lucide-react";
import { createIssueDetailPath } from "../lib/issueDetailBreadcrumb";
import { formatDateTime } from "../lib/utils";
import { Link } from "@/lib/router";

interface TaskFlowDetailPanelProps {
  issue: Issue | null;
  isFetching: boolean;
  stage: string;
  statusLabel: string;
  issueLinkState?: unknown;
}

export function TaskFlowDetailPanel({
  issue,
  isFetching,
  stage,
  statusLabel,
  issueLinkState,
}: TaskFlowDetailPanelProps) {
  return (
    <aside className="border-t border-border bg-muted/10 p-4 xl:border-l xl:border-t-0">
      {issue ? (
        <div data-testid="task-flow-detail" className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {issue.identifier ?? issue.id.slice(0, 8)}
              </span>
              {isFetching ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
            </div>
            <h3 className="mt-1 text-sm font-semibold leading-5">{issue.title}</h3>
            {issue.description ? (
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                {issue.description}
              </p>
            ) : null}
          </div>

          <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 border-y border-border py-3 text-xs">
            <dt className="text-muted-foreground">단계</dt>
            <dd>{stage}</dd>
            <dt className="text-muted-foreground">상태</dt>
            <dd>{statusLabel}</dd>
            <dt className="text-muted-foreground">수정</dt>
            <dd>{formatDateTime(issue.updatedAt)}</dd>
            {issue.completedAt ? (
              <>
                <dt className="text-muted-foreground">완료</dt>
                <dd>{formatDateTime(issue.completedAt)}</dd>
              </>
            ) : null}
          </dl>

          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold">결과물</h4>
              <span className="text-[10px] text-muted-foreground">{issue.workProducts?.length ?? 0}개</span>
            </div>
            <div className="mt-2 space-y-2">
              {issue.workProducts?.map((product) => (
                product.url ? (
                  <a
                    key={product.id}
                    href={product.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md border border-border bg-background p-2.5 hover:border-foreground/30"
                  >
                    <span className="flex items-center justify-between gap-2 text-xs font-medium">
                      <span className="truncate">{product.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </span>
                    {product.summary ? (
                      <span className="mt-1 block text-[10px] text-muted-foreground">{product.summary}</span>
                    ) : null}
                  </a>
                ) : (
                  <div key={product.id} className="rounded-md border border-border bg-background p-2.5 text-xs">
                    {product.title}
                  </div>
                )
              ))}
              {!issue.workProducts?.length ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  {issue.status === "done"
                    ? "등록된 결과 링크가 없습니다."
                    : "완료된 결과물이 여기에 표시됩니다."}
                </p>
              ) : null}
            </div>
          </div>

          <Link
            to={createIssueDetailPath(issue.identifier ?? issue.id)}
            state={issueLinkState}
            issuePrefetch={issue}
            className="inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
          >
            작업 상세 열기 <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ) : null}
    </aside>
  );
}

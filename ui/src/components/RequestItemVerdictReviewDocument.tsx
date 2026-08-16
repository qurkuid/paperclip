import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import type { RequestItemVerdictsInteraction } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { getRequestConfirmationTargetHref } from "../lib/issue-thread-interactions";
import { queryKeys } from "../lib/queryKeys";
import { Link } from "@/lib/router";
import { MarkdownBody } from "./MarkdownBody";

interface RequestItemVerdictReviewDocumentProps {
  issueId: string;
  interaction: RequestItemVerdictsInteraction;
}

export function normalizeReviewMarkdownHeadings(markdown: string): string {
  let fenceMarker: "`" | "~" | null = null;
  let previousSourceLevel = 0;
  let previousRenderedLevel = 3;

  return markdown
    .split("\n")
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        const marker = fence[1]?.[0];
        if (marker === "`" || marker === "~") {
          fenceMarker = fenceMarker === marker ? null : marker;
        }
        return line;
      }
      if (fenceMarker) return line;

      const heading = line.match(/^(\s{0,3})(#{1,6})([ \t]+.*)$/);
      if (!heading) return line;

      const sourceLevel = heading[2]?.length ?? 1;
      const renderedLevel = previousSourceLevel === 0
        ? 4
        : sourceLevel > previousSourceLevel
          ? Math.min(6, previousRenderedLevel + 1)
          : sourceLevel < previousSourceLevel
            ? Math.max(4, previousRenderedLevel - (previousSourceLevel - sourceLevel))
            : previousRenderedLevel;

      previousSourceLevel = sourceLevel;
      previousRenderedLevel = renderedLevel;
      return `${heading[1] ?? ""}${"#".repeat(renderedLevel)}${heading[3] ?? ""}`;
    })
    .join("\n");
}

export function RequestItemVerdictReviewDocument({
  issueId,
  interaction,
}: RequestItemVerdictReviewDocumentProps) {
  const target = interaction.payload.target;
  const documentTarget = target?.type === "issue_document" ? target : null;
  const targetIssueId = documentTarget?.issueId ?? issueId;
  const targetKey = documentTarget?.key ?? "";

  const {
    data: document,
    error,
    isLoading,
  } = useQuery({
    queryKey: queryKeys.issues.document(targetIssueId, targetKey),
    queryFn: () => issuesApi.getDocument(targetIssueId, targetKey),
    enabled: documentTarget !== null,
  });

  if (!documentTarget) return null;

  const sourceHref = getRequestConfirmationTargetHref({
    issueId,
    target: documentTarget,
  });
  const title = document?.title?.trim() || documentTarget.label?.trim() || documentTarget.key;
  const revisionMatches = !document || document.latestRevisionId === documentTarget.revisionId;

  return (
    <section
      className="overflow-hidden rounded-sm border border-sky-500/45 bg-sky-500/5"
      aria-labelledby={`${interaction.id}-review-content-title`}
      data-testid="item-verdict-review-content"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-500/25 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-sky-700 dark:text-sky-300">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Content to review
          </div>
          <h3
            id={`${interaction.id}-review-content-title`}
            className="mt-1 truncate text-sm font-semibold text-foreground"
          >
            {title}
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Read the actual content here, then decide each item below.
          </p>
        </div>
        {sourceHref ? (
          <Link
            to={sourceHref}
            className="shrink-0 text-xs font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-300"
          >
            Open source
          </Link>
        ) : null}
      </div>

      {!revisionMatches ? (
        <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs leading-5 text-amber-900 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          This content changed after the decision request. Refresh before deciding.
        </div>
      ) : null}

      <div
        className="max-h-(--sz-60vh) overflow-y-auto px-4 py-4"
        role="region"
        aria-label={`${title} review content`}
        aria-live="polite"
        tabIndex={0}
      >
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
            Loading review content…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            The review content could not be loaded. Open the source before deciding.
          </div>
        ) : document?.body.trim() ? (
          <MarkdownBody>{normalizeReviewMarkdownHeadings(document.body)}</MarkdownBody>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">
            This review document is empty.
          </p>
        )}
      </div>
    </section>
  );
}

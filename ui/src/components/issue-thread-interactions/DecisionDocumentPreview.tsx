import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { issuesApi } from "@/api/issues";
import { MarkdownBody, type MarkdownExternalReferenceMap } from "@/components/MarkdownBody";

interface DecisionDocumentPreviewProps {
  fallbackIssueId: string;
  target: {
    issueId?: string | null;
    key: string;
    revisionId: string;
    revisionNumber?: number | null;
  };
  externalReferences?: MarkdownExternalReferenceMap;
}

export function DecisionDocumentPreview({
  fallbackIssueId,
  target,
  externalReferences,
}: DecisionDocumentPreviewProps) {
  const issueId = target.issueId ?? fallbackIssueId;
  const revisionQuery = useQuery({
    queryKey: ["decision-document-preview", issueId, target.key, target.revisionId],
    queryFn: async () => {
      const revisions = await issuesApi.listDocumentRevisions(issueId, target.key);
      const revision = revisions.find((candidate) => candidate.id === target.revisionId);
      if (!revision) {
        throw new Error("The referenced document revision is unavailable.");
      }
      return revision;
    },
    staleTime: 60_000,
  });

  if (revisionQuery.isPending) {
    return (
      <div
        className="flex items-center gap-2 rounded-sm border border-border/70 bg-muted/20 px-3 py-4 text-sm text-muted-foreground"
        role="status"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading the plan being reviewed…
      </div>
    );
  }

  if (revisionQuery.isError || !revisionQuery.data) {
    return (
      <div
        className="flex items-start gap-2 rounded-sm border border-amber-500/50 bg-amber-500/10 px-3 py-3 text-sm text-amber-900 dark:text-amber-100"
        role="alert"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>The exact plan revision could not be loaded. Open the plan before deciding.</span>
      </div>
    );
  }

  const revision = revisionQuery.data;
  return (
    <section
      data-testid="decision-document-preview"
      className="overflow-hidden rounded-sm border border-border bg-card"
      aria-label={`Plan revision ${revision.revisionNumber}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h4 className="truncate text-sm font-semibold text-foreground">
            {revision.title?.trim() || "Plan"}
          </h4>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          Revision {revision.revisionNumber}
        </span>
      </header>
      <div className="max-h-96 overflow-auto p-4 text-sm leading-6">
        <MarkdownBody externalReferences={externalReferences} softBreaks={false}>
          {revision.body}
        </MarkdownBody>
      </div>
    </section>
  );
}

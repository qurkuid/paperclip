import type { AttentionItem, AttentionSourceKind, Issue } from "@paperclipai/shared";

const REVIEW_REQUEST_SOURCE_KINDS: ReadonlySet<AttentionSourceKind> = new Set([
  "issue_thread_interaction",
  "review",
]);

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getInboxReviewRequestIssueId(item: AttentionItem): string | null {
  const metadataIssueId = nonEmptyText(item.subject.metadata?.issueId);
  if (metadataIssueId) return metadataIssueId;
  if (item.relatedIssue) return item.relatedIssue.id;
  return item.subject.kind === "issue" ? item.subject.id : null;
}

function reviewRequestPriority(item: AttentionItem): number {
  return item.sourceKind === "issue_thread_interaction" ? 0 : 1;
}

export function selectInboxReviewRequests(items: readonly AttentionItem[]): AttentionItem[] {
  const selectedByIssue = new Map<string, AttentionItem>();

  for (const item of items) {
    if (!REVIEW_REQUEST_SOURCE_KINDS.has(item.sourceKind)) continue;
    const issueId = getInboxReviewRequestIssueId(item);
    const key = issueId ? `issue:${issueId}` : `attention:${item.id}`;
    const existing = selectedByIssue.get(key);
    if (!existing || reviewRequestPriority(item) < reviewRequestPriority(existing)) {
      selectedByIssue.set(key, item);
    }
  }

  return [...selectedByIssue.values()].sort((left, right) => {
    const rankDifference = left.rank - right.rank;
    if (rankDifference !== 0) return rankDifference;
    return Date.parse(right.activityAt) - Date.parse(left.activityAt);
  });
}

export function withoutDuplicateReviewIssues(
  issues: readonly Issue[],
  reviewRequests: readonly AttentionItem[],
): Issue[] {
  const reviewIssueIds = new Set(
    reviewRequests
      .map(getInboxReviewRequestIssueId)
      .filter((issueId): issueId is string => issueId !== null),
  );
  return issues.filter((issue) => !reviewIssueIds.has(issue.id));
}

export function matchesInboxReviewRequestSearch(
  item: AttentionItem,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const searchableValues = [
    item.subject.title,
    item.subject.identifier,
    item.whyNow,
    item.relatedIssue?.title,
    item.relatedIssue?.identifier,
  ];
  return searchableValues.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

export function inboxReviewRequestHref(item: AttentionItem): string | null {
  return item.subject.href ?? item.relatedIssue?.href ?? null;
}

import type { AttentionItem } from "@paperclipai/shared";
import { MessageSquareQuote, X } from "lucide-react";
import { Link } from "@/lib/router";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";
import { inboxReviewRequestHref } from "@/lib/inbox-review-requests";

type UnreadState = "visible" | "fading" | "hidden" | null;

function reviewRequestLabel(item: AttentionItem): string {
  return item.sourceKind === "issue_thread_interaction" ? "확인 요청" : "검수 대기";
}

function reviewIssueTitle(item: AttentionItem): string {
  const issue = item.relatedIssue ?? (item.subject.kind === "issue" ? item.subject : null);
  const identifier = issue?.identifier?.trim();
  const title = issue?.title?.trim() ?? item.subject.title?.trim() ?? "검수 요청";
  return identifier ? `${identifier} · ${title}` : title;
}

export function ReviewRequestInboxRow({
  item,
  unreadState = null,
  onMarkRead,
  onArchive,
  archiveDisabled = false,
  selected = false,
  className,
}: {
  item: AttentionItem;
  unreadState?: UnreadState;
  onMarkRead?: () => void;
  onArchive?: () => void;
  archiveDisabled?: boolean;
  selected?: boolean;
  className?: string;
}) {
  const href = inboxReviewRequestHref(item);
  const showUnreadSlot = unreadState !== null;
  const showUnreadDot = unreadState === "visible" || unreadState === "fading";
  const content = (
    <>
      <span className="mt-0.5 shrink-0 rounded-md bg-sky-500/15 p-1.5 sm:mt-0">
        <MessageSquareQuote className="h-4 w-4 text-sky-600 dark:text-sky-400" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium sm:truncate sm:line-clamp-none">
          {reviewIssueTitle(item)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-sky-700 dark:text-sky-300">
            {reviewRequestLabel(item)}
          </span>
          {item.subject.title ? <span className="truncate">{item.subject.title}</span> : null}
          <span>{timeAgo(item.activityAt)}</span>
        </span>
      </span>
      <span className="hidden shrink-0 text-xs font-medium text-foreground sm:inline">
        검토 및 답변
      </span>
    </>
  );

  return (
    <div
      data-testid="inbox-review-request-row"
      className={cn(
        "group border-b border-border px-2 py-2.5 last:border-b-0 sm:px-1 sm:pr-3 sm:py-2",
        className,
      )}
    >
      <div className="flex items-start gap-2 sm:items-center">
        {showUnreadSlot ? (
          <span className="hidden h-4 w-4 shrink-0 items-center justify-center self-center sm:inline-flex">
            {showUnreadDot ? (
              <button
                type="button"
                onClick={onMarkRead}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-blue-500/20"
                aria-label="읽음으로 표시"
              >
                <span
                  className={cn(
                    "block h-2 w-2 rounded-full bg-blue-600 transition-opacity duration-300 dark:bg-blue-400",
                    unreadState === "fading" ? "opacity-0" : "opacity-100",
                  )}
                />
              </button>
            ) : onArchive ? (
              <button
                type="button"
                onClick={onArchive}
                disabled={archiveDisabled}
                className="inline-flex h-4 w-4 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
                aria-label="받은 편지함에서 보관"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="inline-flex h-4 w-4" aria-hidden="true" />
            )}
          </span>
        ) : null}
        {href ? (
          <Link
            to={href}
            className={cn(
              "flex min-w-0 flex-1 items-start gap-2 no-underline text-inherit transition-colors",
              selected ? "hover:bg-transparent" : "hover:bg-accent/50",
            )}
          >
            {!showUnreadSlot ? <span className="hidden h-2 w-2 shrink-0 sm:inline-flex" /> : null}
            <span className="hidden h-3.5 w-3.5 shrink-0 sm:inline-flex" />
            {content}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {content}
          </div>
        )}
      </div>
    </div>
  );
}

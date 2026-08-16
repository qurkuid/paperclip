import { useState } from "react";
import type { IssueBlockerAttention } from "@paperclipai/shared";
import { cn } from "../lib/utils";
import { StatusGlyph, type StatusGlyphSize } from "./StatusGlyph";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { koMenu } from "../i18n/korean-menu";

const allStatuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];
const statusLabels: Record<string, string> = {
  backlog: koMenu("Backlog"),
  todo: koMenu("Todo"),
  in_progress: koMenu("In Progress"),
  in_review: koMenu("In Review"),
  done: koMenu("Done"),
  cancelled: koMenu("Cancelled"),
  blocked: koMenu("Blocked"),
};

function statusLabel(status: string): string {
  return statusLabels[status] ?? status.replace(/_/g, " ");
}

interface StatusIconProps {
  status: string;
  blockerAttention?: IssueBlockerAttention | null;
  onChange?: (status: string) => void;
  className?: string;
  showLabel?: boolean;
  /** Glyph size (PAP-243a). Default `md` (16px); lists/detail/mentions use `lg` (20px). */
  size?: StatusGlyphSize;
}

function blockedAttentionLabel(blockerAttention: IssueBlockerAttention | null | undefined) {
  if (!blockerAttention || blockerAttention.state === "none") return "Blocked";

  if (blockerAttention.reason === "active_child") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return `차단됨 · 진행 중인 하위 작업 ${blockerAttention.sampleBlockerIdentifier}을(를) 기다리는 중`;
    }
    if (count === 1) return "차단됨 · 진행 중인 하위 작업 1개를 기다리는 중";
    return `차단됨 · 진행 중인 하위 작업 ${count}개를 기다리는 중`;
  }

  if (blockerAttention.reason === "active_dependency") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return `차단됨 · 진행 중인 선행 작업 ${blockerAttention.sampleBlockerIdentifier}이(가) 처리 중`;
    }
    if (count === 1) return "차단됨 · 진행 중인 선행 작업 1개가 처리 중";
    return `차단됨 · 진행 중인 선행 작업 ${count}개가 처리 중`;
  }

  if (blockerAttention.reason === "stalled_review") {
    const count = blockerAttention.stalledBlockerCount;
    const leaf = blockerAttention.sampleStalledBlockerIdentifier ?? blockerAttention.sampleBlockerIdentifier;
    if (count === 1 && leaf) return `차단됨 · ${leaf} 검토가 멈춰 있음`;
    if (count === 1) return "차단됨 · 다음 단계가 확인되지 않아 검토가 멈춰 있음";
    return `차단됨 · 다음 단계가 확인되지 않아 검토 ${count}건이 멈춰 있음`;
  }

  if (blockerAttention.reason === "attention_required") {
    const count = blockerAttention.attentionBlockerCount || blockerAttention.unresolvedBlockerCount;
    const attentionCopy = count > 0
      ? `선행 작업 ${count}개 확인 필요`
      : "확인할 선행 작업 정보를 불러올 수 없음";
    const coveredCount = blockerAttention.coveredBlockerCount;
    if (coveredCount > 0) {
      return `차단됨 · ${attentionCopy}; 진행 중인 작업 ${coveredCount}개가 처리 중`;
    }
    return `차단됨 · ${attentionCopy}`;
  }

  return "Blocked";
}

/**
 * Task/issue status indicator — renders the unified, color-blind-safe
 * {@link StatusGlyph} (one distinct shape per status). With `onChange` it also
 * acts as a status picker (popover). This one component drives every standalone
 * status surface: list, kanban, detail header, properties row + picker flyout,
 * sub-task / blocked-by pills, blocked inbox, quicklook, sibling nav, filters,
 * search, columns, dashboard.
 *
 * A "covered" blocked task (waiting on active work) maps to the `in_queue`
 * glyph — the blocked shape recoloured blue — while the full blocked reason
 * still rides on the accessible label.
 */
export function StatusIcon({ status, blockerAttention, onChange, className, showLabel, size = "md" }: StatusIconProps) {
  const [open, setOpen] = useState(false);
  const isCoveredBlocked = status === "blocked" && blockerAttention?.state === "covered";
  const ariaLabel = status === "blocked" ? blockedAttentionLabel(blockerAttention) : statusLabel(status);
  const glyphStatus = isCoveredBlocked ? "in_queue" : status;

  const glyph = (
    <StatusGlyph
      status={glyphStatus}
      size={size}
      className={cn(onChange && !showLabel && "cursor-pointer", className)}
      title={ariaLabel}
    />
  );

  if (!onChange) {
    return showLabel ? (
      <span className="inline-flex items-center gap-1.5">
        {glyph}
        <span className="text-sm">{statusLabel(status)}</span>
      </span>
    ) : (
      glyph
    );
  }

  const trigger = showLabel ? (
    <button className="inline-flex min-h-5 items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors">
      {glyph}
      <span className="text-sm">{statusLabel(status)}</span>
    </button>
  ) : (
    glyph
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {allStatuses.map((s) => (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2 text-xs", s === status && "bg-accent")}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
          >
            <StatusIcon status={s} size="lg" />
            {statusLabel(s)}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          onClick={() => {
            window.dispatchEvent(new Event("paperclip:start-debug-request"));
            setOpen(false);
          }}
        >
          디버그 요청하기
        </Button>
      </PopoverContent>
    </Popover>
  );
}

import type {
  IssueThreadInteraction,
  RequestConfirmationDecisionContext,
} from "@paperclipai/shared";
import type {
  TelegramDecisionPackage,
  TelegramDecisionPackageIssue,
} from "./telegram-decision-package-types.js";

const MAX_EVIDENCE_EXCERPT_LENGTH = 1200;
const MAX_DECISION_REASON_LENGTH = 1000;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function redactDecisionText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(
      /\b(api[_\s-]?key|access[_\s-]?token|refresh[_\s-]?token|token|secret|password|private[_\s-]?key)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(
      /\b(lead|contact|customer)[_\s-]?id\b\s*[:=]\s*[^\s,;]+/gi,
      "$1Id=[redacted]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/(?<!\d)(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/g, "[redacted-phone]");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function getCompanyPrefix(identifier: string | null): string | null {
  const separatorIndex = identifier?.indexOf("-") ?? -1;
  if (!identifier || separatorIndex <= 0) return null;
  return identifier.slice(0, separatorIndex).toUpperCase();
}

function buildIssuePath(issue: TelegramDecisionPackageIssue): string {
  const issueReference = encodeURIComponent(issue.identifier ?? issue.id);
  const companyPrefix = getCompanyPrefix(issue.identifier);
  return companyPrefix
    ? `/${encodeURIComponent(companyPrefix)}/issues/${issueReference}`
    : `/issues/${issueReference}`;
}

function joinPublicUrl(publicUrl: string | null | undefined, path: string): string {
  const base = publicUrl?.trim().replace(/\/+$/, "") ?? "";
  return `${base}${path}`;
}

function getDecisionContext(
  interaction: IssueThreadInteraction,
): RequestConfirmationDecisionContext | null {
  const context = interaction.kind === "request_confirmation"
    ? interaction.payload.decisionContext ?? null
    : null;
  if (!context) return null;
  return {
    kpis: context.kpis.map((kpi) => ({
      label: redactDecisionText(kpi.label),
      value: redactDecisionText(kpi.value),
    })),
    sample: {
      observed: context.sample.observed,
      required: context.sample.required,
    },
    freshness: {
      recordUpdatedAt: context.freshness.recordUpdatedAt,
      funnelGeneratedAt: context.freshness.funnelGeneratedAt,
      funnelDataThrough: context.freshness.funnelDataThrough,
      quality: context.freshness.quality === null
        ? null
        : redactDecisionText(context.freshness.quality),
    },
    asOf: context.asOf,
    expiresAt: context.expiresAt,
  };
}

function getDetailsMarkdown(interaction: IssueThreadInteraction): string | null {
  switch (interaction.kind) {
    case "request_confirmation":
    case "request_checkbox_confirmation":
    case "request_item_verdicts":
      return interaction.payload.detailsMarkdown ?? null;
    default:
      return null;
  }
}

function getDecisionPrompt(interaction: IssueThreadInteraction): string {
  switch (interaction.kind) {
    case "request_confirmation":
    case "request_checkbox_confirmation":
    case "request_item_verdicts":
      return interaction.payload.prompt;
    default:
      return interaction.summary ?? interaction.title ?? "Review this decision.";
  }
}

function getDecisionLabels(interaction: IssueThreadInteraction): {
  approve: string;
  reject: string;
} {
  switch (interaction.kind) {
    case "request_confirmation":
    case "request_checkbox_confirmation":
      return {
        approve: interaction.payload.acceptLabel ?? "Approve",
        reject: interaction.payload.rejectLabel ?? "Reject",
      };
    default:
      return { approve: "Approve", reject: "Reject" };
  }
}

function getDocumentLink(
  issueUrl: string,
  interaction: IssueThreadInteraction,
): string | null {
  if (
    interaction.kind !== "request_confirmation"
    && interaction.kind !== "request_checkbox_confirmation"
    && interaction.kind !== "request_item_verdicts"
  ) {
    return null;
  }
  const target = interaction.payload.target;
  if (!target || target.type !== "issue_document") return null;
  return `${issueUrl}#document-${encodeURIComponent(target.key)}`;
}

function getExpiresAt(interaction: IssueThreadInteraction): string | null {
  if (interaction.kind !== "request_confirmation") return null;
  return interaction.payload.toolAction?.expiresAt
    ?? interaction.payload.decisionContext?.expiresAt
    ?? null;
}

function isSupportedDecision(interaction: IssueThreadInteraction): boolean {
  return interaction.kind === "request_confirmation"
    || interaction.kind === "request_checkbox_confirmation";
}

export function buildTelegramDecisionPackage(input: {
  companyName?: string;
  issue: TelegramDecisionPackageIssue;
  interaction: IssueThreadInteraction;
  publicUrl?: string | null;
  now?: Date;
}): TelegramDecisionPackage {
  const issuePath = buildIssuePath(input.issue);
  const issueUrl = joinPublicUrl(input.publicUrl, issuePath);
  const decisionUrl = `${issueUrl}#interaction-${encodeURIComponent(input.interaction.id)}`;
  const decisionContext = getDecisionContext(input.interaction);
  const evidenceStatus = decisionContext ? "complete" : "missing";
  const evidenceExcerpt = truncate(
    redactDecisionText(
      getDetailsMarkdown(input.interaction)
      ?? input.interaction.summary
      ?? "",
    ).trim(),
    MAX_EVIDENCE_EXCERPT_LENGTH,
  );
  const labels = getDecisionLabels(input.interaction);
  const expiresAt = getExpiresAt(input.interaction);
  const expired = expiresAt !== null
    && new Date(expiresAt).getTime() <= (input.now ?? new Date()).getTime();
  const conflict = input.interaction.status !== "pending"
    ? "already_resolved"
    : !isSupportedDecision(input.interaction)
      ? "unsupported_interaction"
      : expired
        ? "expired"
        : evidenceStatus === "missing"
          ? "missing_evidence"
          : null;
  const safeTitle = redactDecisionText(input.interaction.title);
  const safeSummary = redactDecisionText(input.interaction.summary);
  const reason = truncate(
    safeSummary || redactDecisionText(getDecisionPrompt(input.interaction)),
    MAX_DECISION_REASON_LENGTH,
  );
  const workProductLinks = (input.issue.workProducts ?? []).map((workProduct) => ({
    id: workProduct.id,
    title: truncate(redactDecisionText(workProduct.title), 240),
    href: `${issueUrl}#work-product-${encodeURIComponent(workProduct.id)}`,
  }));

  return {
    version: 1,
    company: {
      id: input.issue.companyId,
      ...(input.companyName ? { name: truncate(redactDecisionText(input.companyName), 240) } : {}),
    },
    issue: {
      id: input.issue.id,
      identifier: input.issue.identifier,
      title: truncate(redactDecisionText(input.issue.title), 240),
      url: decisionUrl,
    },
    interaction: {
      id: input.interaction.id,
      kind: input.interaction.kind,
      title: safeTitle ? truncate(safeTitle, 240) : null,
      summary: safeSummary ? truncate(safeSummary, 1000) : null,
      status: input.interaction.status,
      revision: toIsoString(input.interaction.updatedAt),
      expiresAt,
    },
    decision: {
      reason,
      options: [
        {
          action: "approve",
          label: truncate(redactDecisionText(labels.approve), 80),
        },
        {
          action: "reject",
          label: truncate(redactDecisionText(labels.reject), 80),
        },
      ],
    },
    evidence: {
      context: decisionContext,
      excerpt: evidenceExcerpt,
    },
    evidenceStatus,
    links: {
      issue: decisionUrl,
      document: getDocumentLink(issueUrl, input.interaction),
      workProducts: workProductLinks,
    },
    canResolve: conflict === null,
    conflict,
  };
}

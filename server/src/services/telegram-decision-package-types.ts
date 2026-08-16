import type {
  IssueThreadInteraction,
  RequestConfirmationDecisionContext,
} from "@paperclipai/shared";

export interface TelegramDecisionPackageIssue {
  id: string;
  companyId: string;
  identifier: string | null;
  title: string;
  workProducts?: Array<{
    id: string;
    title: string;
  }>;
}

export interface TelegramDecisionPackage {
  version: 1;
  company: {
    id: string;
    name?: string;
  };
  issue: {
    id: string;
    identifier: string | null;
    title: string;
    url: string;
  };
  interaction: {
    id: string;
    kind: IssueThreadInteraction["kind"];
    title: string | null;
    summary: string | null;
    status: IssueThreadInteraction["status"];
    revision: string;
    expiresAt: string | null;
  };
  decision: {
    reason: string;
    options: Array<{
      action: "approve" | "reject";
      label: string;
    }>;
  };
  evidence: {
    context: RequestConfirmationDecisionContext | null;
    excerpt: string;
  };
  evidenceStatus: "complete" | "missing";
  links: {
    issue: string;
    document: string | null;
    workProducts: Array<{
      id: string;
      title: string;
      href: string;
    }>;
  };
  canResolve: boolean;
  conflict: "already_resolved" | "expired" | "missing_evidence" | "unsupported_interaction" | null;
}

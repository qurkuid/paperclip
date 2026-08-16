import type { Approval, ApprovalComment, Issue } from "@paperclipai/shared";
import { api } from "./client";

export interface ApprovalInboxItem {
  id: string;
  kind: "approval" | "request_confirmation";
  status: string;
  issueId: string | null;
  issueIdentifier: string | null;
  issueTitle: string | null;
  originalInstruction: string | null;
  resultSummary: string | null;
  resultUrl: string | null;
  managerReview: string | null;
  ceoReview: string | null;
  userApprovalStatus: string;
  pendingConfirmation: string | null;
  updatedAt: string;
}

export const approvalsApi = {
  list: (companyId: string, status?: string) =>
    api.get<Approval[]>(
      `/companies/${companyId}/approvals${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  listInbox: (companyId: string, status?: string) =>
    api.get<ApprovalInboxItem[]>(
      `/companies/${companyId}/approval-inbox${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Approval>(`/companies/${companyId}/approvals`, data),
  get: (id: string) => api.get<Approval>(`/approvals/${id}`),
  approve: (id: string, decisionNote?: string) =>
    api.post<Approval>(`/approvals/${id}/approve`, { decisionNote }),
  reject: (id: string, decisionNote?: string) =>
    api.post<Approval>(`/approvals/${id}/reject`, { decisionNote }),
  requestRevision: (id: string, decisionNote?: string) =>
    api.post<Approval>(`/approvals/${id}/request-revision`, { decisionNote }),
  resubmit: (id: string, payload?: Record<string, unknown>) =>
    api.post<Approval>(`/approvals/${id}/resubmit`, { payload }),
  listComments: (id: string) => api.get<ApprovalComment[]>(`/approvals/${id}/comments`),
  addComment: (id: string, body: string) =>
    api.post<ApprovalComment>(`/approvals/${id}/comments`, { body }),
  listIssues: (id: string) => api.get<Issue[]>(`/approvals/${id}/issues`),
};

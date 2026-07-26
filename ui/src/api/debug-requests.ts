import type { CreateDebugRequest, Issue } from "@paperclipai/shared";
import { api } from "./client";

export const debugRequestsApi = {
  create: (companyId: string, input: CreateDebugRequest) =>
    api.post<Issue>(`/companies/${companyId}/debug-requests`, input),
};

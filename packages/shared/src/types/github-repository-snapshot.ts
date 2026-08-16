export type GitHubRepositorySnapshotFailure = "not_found" | "private" | "rate_limited" | "too_large" | "collection_failed";
export type GitHubRepositorySnapshotStatus = "ready" | GitHubRepositorySnapshotFailure;
export type GitHubRepositorySnapshotRecommendation = "skill" | "plugin" | "adapter" | "core_change" | "excluded";

export interface GitHubRepositorySnapshotData {
  releases: Array<{ tag: string | null; name: string | null; publishedAt: string | null }>;
  languages: string[];
  frameworkFiles: string[];
  buildTestFiles: string[];
  manifests: Array<{ file: string; ecosystem: string; dependencies: string[] }>;
  manifestDependencies: string[];
  lockfiles: string[];
  supplyChain: {
    dependencyCount: number;
    hasLockfile: boolean;
    findings: string[];
  };
  uiPaths: string[];
  dataPaths: string[];
  externalApiHints: string[];
  secrets: {
    templateFiles: string[];
    sensitiveFiles: string[];
    keyNames: string[];
    valuesRetained: false;
  };
  secretKeyNames: string[];
  securityAlerts: "unavailable_without_authenticated_security_scope";
  workflow: {
    phase: "plan_required" | "excluded";
    approvalRequired: true;
    implementationAllowed: false;
    requiredGates: Array<"license" | "secrets" | "supply_chain" | "company_scope" | "rollback">;
  };
}

export interface GitHubRepositorySnapshot {
  id: string;
  companyId: string;
  sourceUrl: string;
  collectedAt: Date | string;
  sourceEvidenceUrl: string;
  owner: string;
  repository: string;
  defaultBranch: string | null;
  headCommit: string | null;
  status: GitHubRepositorySnapshotStatus;
  license: string | null;
  recommendation: GitHubRepositorySnapshotRecommendation;
  exclusionScope: string[];
  data: GitHubRepositorySnapshotData | Record<string, never>;
}

import { Navigate, Route, useLocation, useParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { AGENT_FILTER_TABS } from "@/pages/Agents";
import { useCompany } from "@/context/CompanyContext";
import { useDialogActions, useDialogState } from "@/context/DialogContext";
import {
  isOnboardingWizardActive,
  shouldRedirectCompanylessRouteToOnboarding,
} from "@/lib/onboarding-route";
import { normalizeRememberedInstanceSettingsPath } from "@/lib/instance-settings";

export function companylessBoardRedirectRoutes() {
  return (
    <>
      <Route path="companies" element={<UnprefixedBoardRedirect />} />
      <Route path="issues" element={<UnprefixedBoardRedirect />} />
      <Route path="issues/:issueId" element={<UnprefixedBoardRedirect />} />
      <Route path="routines" element={<UnprefixedBoardRedirect />} />
      <Route path="routines/:routineId" element={<UnprefixedBoardRedirect />} />
      <Route path="review-queue" element={<UnprefixedBoardRedirect />} />
      <Route path="learnings" element={<UnprefixedBoardRedirect />} />
      <Route path="cases" element={<UnprefixedBoardRedirect />} />
      <Route path="cases/:caseIdentifier" element={<UnprefixedBoardRedirect />} />
      <Route path="pipelines" element={<UnprefixedBoardRedirect />} />
      <Route path="pipelines/:pipelineId" element={<UnprefixedBoardRedirect />} />
      <Route path="pipelines/:pipelineId/add" element={<UnprefixedBoardRedirect />} />
      <Route path="pipelines/:pipelineId/settings" element={<UnprefixedBoardRedirect />} />
      <Route path="pipelines/:pipelineId/items/:caseId" element={<UnprefixedBoardRedirect />} />
      <Route path="pipelines/:pipelineId/cases/:caseId" element={<UnprefixedBoardRedirect />} />
      <Route path="artifacts" element={<UnprefixedBoardRedirect />} />
      <Route path="decisions" element={<UnprefixedBoardRedirect />} />
      <Route path="analytics/funnel" element={<UnprefixedBoardRedirect />} />
      <Route path="u/:userSlug" element={<UnprefixedBoardRedirect />} />
      <Route path="skills/studio" element={<UnprefixedBoardRedirect />} />
      <Route path="skills/studio/new" element={<UnprefixedBoardRedirect />} />
      <Route path="skills/studio/:skillId" element={<UnprefixedBoardRedirect />} />
      <Route path="skills/:skillId/studio" element={legacySkillStudioRedirectElement()} />
      <Route path="skills/*" element={<UnprefixedBoardRedirect />} />
      <Route path="settings" element={<LegacySettingsRedirect />} />
      <Route path="settings/*" element={<LegacySettingsRedirect />} />
      <Route path="agents" element={<UnprefixedBoardRedirect />} />
      {AGENT_FILTER_TABS.map((tab) => (
        <Route key={tab} path={`agents/${tab}`} element={<UnprefixedBoardRedirect />} />
      ))}
      <Route path="agents/new" element={<UnprefixedBoardRedirect />} />
      <Route path="agents/:agentId" element={<UnprefixedBoardRedirect />} />
      <Route path="agents/:agentId/:tab" element={<UnprefixedBoardRedirect />} />
      <Route path="agents/:agentId/runs/:runId" element={<UnprefixedBoardRedirect />} />
      <Route path="projects" element={<UnprefixedBoardRedirect />} />
      <Route path="projects/:projectId" element={<UnprefixedBoardRedirect />} />
      <Route path="projects/:projectId/overview" element={<UnprefixedBoardRedirect />} />
      <Route path="projects/:projectId/issues" element={<UnprefixedBoardRedirect />} />
      <Route path="projects/:projectId/issues/:filter" element={<UnprefixedBoardRedirect />} />
      <Route path="projects/:projectId/workspaces" element={<UnprefixedBoardRedirect />} />
      <Route path="projects/:projectId/workspaces/:workspaceId" element={<UnprefixedBoardRedirect />} />
      <Route path="projects/:projectId/configuration" element={<UnprefixedBoardRedirect />} />
      <Route path="workspaces" element={<UnprefixedBoardRedirect />} />
      <Route path="execution-workspaces/:workspaceId" element={<UnprefixedBoardRedirect />} />
      <Route path="execution-workspaces/:workspaceId/services" element={<UnprefixedBoardRedirect />} />
      <Route path="execution-workspaces/:workspaceId/configuration" element={<UnprefixedBoardRedirect />} />
      <Route path="execution-workspaces/:workspaceId/runtime-logs" element={<UnprefixedBoardRedirect />} />
      <Route path="execution-workspaces/:workspaceId/issues" element={<UnprefixedBoardRedirect />} />
      <Route path="execution-workspaces/:workspaceId/routines" element={<UnprefixedBoardRedirect />} />
    </>
  );
}

export function legacySkillStudioRedirectElement() {
  return <LegacySkillStudioRedirect />;
}

function LegacySkillStudioRedirect() {
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();
  const { companyPrefix, skillId } = useParams<{ companyPrefix?: string; skillId?: string }>();

  if (loading) return null;

  const targetCompany =
    (companyPrefix
      ? companies.find((company) => company.issuePrefix.toUpperCase() === companyPrefix.toUpperCase())
      : null) ??
    selectedCompany ??
    companies[0] ??
    null;

  if (!targetCompany || !skillId) {
    return <Navigate to="/skills/studio" replace />;
  }

  return (
    <Navigate
      to={`/${targetCompany.issuePrefix}/skills/studio/${encodeURIComponent(skillId)}${location.search}${location.hash}`}
      replace
    />
  );
}

export function LegacySettingsRedirect() {
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany =
    (companyPrefix
      ? companies.find((company) => company.issuePrefix.toUpperCase() === companyPrefix.toUpperCase())
      : null) ??
    selectedCompany ??
    companies[0] ??
    null;

  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to="/onboarding" replace />;
    }
    return <NoCompaniesStartPage />;
  }

  const normalizedPath = normalizeRememberedInstanceSettingsPath(
    `${location.pathname}${location.search}${location.hash}`,
  );

  return (
    <Navigate
      to={`/${targetCompany.issuePrefix}${normalizedPath}`}
      replace
    />
  );
}

export function OnboardingRoutePage() {
  const { companies } = useCompany();
  const { openOnboarding } = useDialogActions();
  const { onboardingOpen, onboardingRouteDismissed } = useDialogState();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();

  if (isOnboardingWizardActive({ onboardingOpen, routeDismissed: onboardingRouteDismissed })) {
    return null;
  }

  const matchedCompany = companyPrefix
    ? companies.find((company) => company.issuePrefix.toUpperCase() === companyPrefix.toUpperCase()) ?? null
    : null;
  const title = matchedCompany
    ? `Add another agent to ${matchedCompany.name}`
    : companies.length > 0
      ? "Create another company"
      : "Create your first company";
  const description = matchedCompany
    ? "Run onboarding again to add an agent and a starter task for this company."
    : companies.length > 0
      ? "Run onboarding again to create another company and seed its first agent."
      : "Get started by creating a company and your first agent.";

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4">
          <Button
            onClick={() =>
              matchedCompany
                ? openOnboarding({ initialStep: 2, companyId: matchedCompany.id })
                : openOnboarding()
            }
          >
            {matchedCompany ? "Add Agent" : "Start Onboarding"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CompanyRootRedirect() {
  const { companies, selectedCompany, loading } = useCompany();
  const location = useLocation();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to="/onboarding" replace />;
    }
    return <NoCompaniesStartPage />;
  }

  return <Navigate to={`/${targetCompany.issuePrefix}/dashboard`} replace />;
}

function UnprefixedBoardRedirect() {
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to="/onboarding" replace />;
    }
    return <NoCompaniesStartPage />;
  }

  return (
    <Navigate
      to={`/${targetCompany.issuePrefix}${location.pathname}${location.search}${location.hash}`}
      replace
    />
  );
}

function NoCompaniesStartPage() {
  const { openOnboarding } = useDialogActions();
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">
          {t("app.noCompanies.title", { defaultValue: "Create your first company" })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("app.noCompanies.description", { defaultValue: "Get started by creating a company." })}
        </p>
        <div className="mt-4">
          <Button onClick={() => openOnboarding()}>
            {t("app.noCompanies.newCompany", { defaultValue: "New Company" })}
          </Button>
        </div>
      </div>
    </div>
  );
}

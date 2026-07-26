import { Navigate, Route, useLocation, useParams } from "@/lib/router";
import { AppsExperimentalGate } from "@/components/AppsExperimentalGate";
import { Dashboard } from "@/pages/Dashboard";
import { DashboardLive } from "@/pages/DashboardLive";
import { Timeline } from "@/pages/Timeline";
import { Companies } from "@/pages/Companies";
import { AGENT_FILTER_TABS, Agents } from "@/pages/Agents";
import { AgentDetail } from "@/pages/AgentDetail";
import { CompanySettings } from "@/pages/CompanySettings";
import { CompanyEnvironments } from "@/pages/CompanyEnvironments";
import { CloudUpstream } from "@/pages/CloudUpstream";
import { CompanySettingsPluginPage } from "@/pages/CompanySettingsPluginPage";
import { CompanyAccess, CompanyAccessLegacyRoute } from "@/pages/CompanyAccess";
import { AdvancedToolsRoute } from "@/pages/tools/AdvancedToolsRoute";
import { ProfileWizardRoute } from "@/pages/tools/profiles/ProfileWizardRoute";
import { ProfileDetailRoute } from "@/pages/tools/profiles/ProfileDetailRoute";
import { Connections } from "@/pages/apps/Connections";
import { Browse } from "@/pages/apps/Browse";
import { AppsConnect } from "@/pages/apps/AppsConnect";
import { AppsReview } from "@/pages/apps/AppsReview";
import { AppDetail } from "@/pages/apps/AppDetail";
import { AppNotConnected } from "@/pages/apps/AppNotConnected";
import { GatewaysList } from "@/pages/apps/gateways/GatewaysList";
import { GatewayDetail } from "@/pages/apps/gateways/GatewayDetail";
import { CompanyInvites } from "@/pages/CompanyInvites";
import { CompanySkills } from "@/pages/CompanySkills";
import { SkillStudio } from "@/pages/SkillStudio";
import { Secrets } from "@/pages/Secrets";
import { CompanyExport } from "@/pages/CompanyExport";
import { CompanyImport } from "@/pages/CompanyImport";
import { InstanceGeneralSettings } from "@/pages/InstanceGeneralSettings";
import { InstanceAccess } from "@/pages/InstanceAccess";
import { InstanceSettings } from "@/pages/InstanceSettings";
import { InstanceExperimentalSettings } from "@/pages/InstanceExperimentalSettings";
import { ProfileSettings } from "@/pages/ProfileSettings";
import { PluginManager } from "@/pages/PluginManager";
import { PluginSettings } from "@/pages/PluginSettings";
import { AdapterManager } from "@/pages/AdapterManager";
import { PluginPage } from "@/pages/PluginPage";
import { OrgChart } from "@/pages/OrgChart";
import { NewAgent } from "@/pages/NewAgent";
import {
  LegacySettingsRedirect,
  OnboardingRoutePage,
  legacySkillStudioRedirectElement,
} from "./company-board-redirect-routes";

export function companyCoreRoutes() {
  return (
    <>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="dashboard/live" element={<DashboardLive />} />
      <Route path="timeline" element={<Timeline />} />
      <Route path="onboarding" element={<OnboardingRoutePage />} />
      <Route path="companies" element={<Companies />} />
      <Route path="company/settings" element={<CompanySettings />} />
      <Route path="company/settings/environments" element={<Navigate to="/company/settings/instance/environments" replace />} />
      <Route path="company/settings/cloud-upstream" element={<CloudUpstream />} />
      <Route path="company/settings/members" element={<CompanyAccess />} />
      <Route path="company/settings/access" element={<CompanyAccessLegacyRoute />} />
      <Route path="company/settings/invites" element={<CompanyInvites />} />
      <Route path="company/export/*" element={<CompanyExport />} />
      <Route path="company/import" element={<CompanyImport />} />
      <Route path="company/settings/secrets" element={<Secrets />} />
      <Route path="company/settings/tools" element={<LegacyToolsSettingsRedirect />} />
      <Route path="company/settings/tools/:tab" element={<LegacyToolsSettingsRedirect />} />
      <Route path="tools" element={<LegacyToolsRedirect />} />
      <Route path="tools/:tab" element={<LegacyToolsRedirect />} />
      <Route element={<AppsExperimentalGate />}>
        <Route path="apps" element={<Connections />} />
        <Route path="apps/browse" element={<Browse />} />
        <Route path="apps/connect" element={<AppsConnectEntryRoute />} />
        <Route path="apps/connect/:appKey" element={<Navigate to="/apps/browse" replace />} />
        <Route path="apps/connect/:appKey/:stage" element={<Navigate to="/apps/browse" replace />} />
        <Route path="apps/review" element={<AppsReview />} />
        <Route path="apps/attention" element={<Navigate to="/apps" replace />} />
        <Route path="apps/gateways" element={<GatewaysList />} />
        <Route path="apps/gateways/:gatewayId" element={<Navigate to="overview" replace />} />
        <Route path="apps/gateways/:gatewayId/:tab" element={<GatewayDetail />} />
        <Route path="apps/advanced" element={<AdvancedToolsRoute />} />
        <Route path="apps/advanced/profiles/new" element={<ProfileWizardRoute mode="new" />} />
        <Route path="apps/advanced/profiles/:profileId/edit" element={<ProfileWizardRoute mode="edit" />} />
        <Route path="apps/advanced/profiles/:profileId" element={<ProfileDetailRoute />} />
        <Route path="apps/advanced/:tab" element={<AdvancedToolsRoute />} />
        <Route path="apps/app/:applicationId" element={<AppNotConnected />} />
        <Route path="apps/app/:applicationId/:tab" element={<AppNotConnected />} />
        <Route path="apps/:connectionId" element={<Navigate to="setup" replace />} />
        <Route path="apps/:connectionId/:tab" element={<AppDetail />} />
      </Route>
    </>
  );
}

export function companyAdminRoutes() {
  return (
    <>
      <Route path="company/settings/instance" element={<Navigate to="general" replace />} />
      <Route path="company/settings/instance/profile" element={<ProfileSettings />} />
      <Route path="company/settings/instance/general" element={<InstanceGeneralSettings />} />
      <Route path="company/settings/instance/environments" element={<CompanyEnvironments />} />
      <Route path="company/settings/instance/environments/new" element={<CompanyEnvironments mode="create" />} />
      <Route path="company/settings/instance/environments/:environmentId/edit" element={<CompanyEnvironments mode="edit" />} />
      <Route path="company/settings/instance/access" element={<InstanceAccess />} />
      <Route path="company/settings/instance/heartbeats" element={<InstanceSettings />} />
      <Route path="company/settings/instance/experimental" element={<InstanceExperimentalSettings />} />
      <Route path="company/settings/instance/plugins" element={<PluginManager />} />
      <Route path="company/settings/instance/plugins/:pluginId" element={<PluginSettings />} />
      <Route path="company/settings/instance/adapters" element={<AdapterManager />} />
      <Route path="company/settings/:settingsRoutePath/*" element={<CompanySettingsPluginPage />} />
      <Route path="skills/studio" element={<SkillStudio />} />
      <Route path="skills/studio/new" element={<SkillStudio />} />
      <Route path="skills/studio/:skillId" element={<SkillStudio />} />
      <Route path="skills/:skillId/studio" element={legacySkillStudioRedirectElement()} />
      <Route path="skills/*" element={<CompanySkills />} />
      <Route path="settings" element={<LegacySettingsRedirect />} />
      <Route path="settings/*" element={<LegacySettingsRedirect />} />
      <Route path="plugins/:pluginId" element={<PluginPage />} />
      <Route path="org" element={<OrgChart />} />
      <Route path="agents" element={<Navigate to="/agents/all" replace />} />
      {AGENT_FILTER_TABS.map((tab) => (
        <Route key={tab} path={`agents/${tab}`} element={<Agents />} />
      ))}
      <Route path="agents/new" element={<NewAgent />} />
      <Route path="agents/:agentId" element={<AgentDetail />} />
      <Route path="agents/:agentId/:tab" element={<AgentDetail />} />
      <Route path="agents/:agentId/runs/:runId" element={<AgentDetail />} />
    </>
  );
}

function AppsConnectEntryRoute() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  return searchParams.get("byo") === "1" ? <AppsConnect /> : <Navigate to="/apps/browse" replace />;
}

function LegacyToolsSettingsRedirect() {
  const { tab } = useParams<{ tab?: string }>();
  return <Navigate to={legacyToolsRedirectTarget(tab)} replace />;
}

function LegacyToolsRedirect() {
  const { tab } = useParams<{ tab?: string }>();
  return <Navigate to={legacyToolsRedirectTarget(tab)} replace />;
}

function legacyToolsRedirectTarget(tab?: string) {
  if (!tab) return "/apps/advanced/profiles";
  if (tab === "applications" || tab === "connections" || tab === "overview" || tab === "examples") return "/apps";
  return `/apps/advanced/${tab}`;
}

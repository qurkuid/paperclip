import { Route, Routes } from "@/lib/router";
import { Layout } from "./components/Layout";
import { OnboardingWizardVariant } from "./components/OnboardingWizardVariant";
import { CloudAccessGate } from "./components/CloudAccessGate";
import { IssueChatLongThreadPerf } from "./pages/IssueChatLongThreadPerf";
import { CloudUpstreamUxLab } from "./pages/CloudUpstreamUxLab";
import { BootstrapSetupUxLab } from "./pages/BootstrapSetupUxLab";
import { ResponsibleUserDenialUxLab } from "./pages/ResponsibleUserDenialUxLab";
import { AuthPage } from "./pages/Auth";
import { BoardClaimPage } from "./pages/BoardClaim";
import { CliAuthPage } from "./pages/CliAuth";
import { InviteLandingPage } from "./pages/InviteLanding";
import { NotFoundPage } from "./pages/NotFound";
import {
  CompanyRootRedirect,
  LegacySettingsRedirect,
  OnboardingRoutePage,
  companyBoardRoutes,
  companylessBoardRedirectRoutes,
} from "./routes/company-board-routes";

export function App() {
  return (
    <>
      <Routes>
        <Route path="auth" element={<AuthPage />} />
        <Route path="board-claim/:token" element={<BoardClaimPage />} />
        <Route path="cli-auth/:id" element={<CliAuthPage />} />
        <Route path="invite/:token" element={<InviteLandingPage />} />
        <Route path="tests/perf/long-thread" element={<IssueChatLongThreadPerf />} />
        <Route path="ux-lab/cloud-upstream" element={<CloudUpstreamUxLab />} />
        <Route path="ux-lab/bootstrap-setup" element={<BootstrapSetupUxLab />} />
        <Route path="ux-lab/responsible-user-denial" element={<ResponsibleUserDenialUxLab />} />

        <Route element={<CloudAccessGate />}>
          <Route index element={<CompanyRootRedirect />} />
          <Route path="onboarding" element={<OnboardingRoutePage />} />
          <Route path="instance" element={<LegacySettingsRedirect />} />
          <Route path="instance/settings" element={<LegacySettingsRedirect />} />
          <Route path="instance/settings/*" element={<LegacySettingsRedirect />} />
          {companylessBoardRedirectRoutes()}
          <Route path=":companyPrefix" element={<Layout />}>
            {companyBoardRoutes()}
          </Route>
          <Route path="*" element={<NotFoundPage scope="global" />} />
        </Route>
      </Routes>
      <OnboardingWizardVariant />
    </>
  );
}

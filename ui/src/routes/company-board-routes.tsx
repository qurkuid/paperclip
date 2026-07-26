import { lazy, Suspense } from "react";
import { Route } from "@/lib/router";
import {
  companyAdminRoutes,
  companyCoreRoutes,
} from "./company-board-settings-routes";
import {
  companyActivityRoutes,
  companyWorkRoutes,
} from "./company-board-work-routes";
export {
  CompanyRootRedirect,
  LegacySettingsRedirect,
  OnboardingRoutePage,
  companylessBoardRedirectRoutes,
} from "./company-board-redirect-routes";

const SpacebogamFunnelAnalytics = lazy(() =>
  import("@/pages/SpacebogamFunnelAnalytics").then((module) => ({
    default: module.SpacebogamFunnelAnalytics,
  })),
);

export function companyBoardRoutes() {
  return (
    <>
      {companyCoreRoutes()}
      {companyAdminRoutes()}
      <Route path="analytics/funnel" element={spacebogamFunnelAnalyticsElement()} />
      {companyWorkRoutes()}
      {companyActivityRoutes()}
    </>
  );
}

function spacebogamFunnelAnalyticsElement() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <SpacebogamFunnelAnalytics />
    </Suspense>
  );
}

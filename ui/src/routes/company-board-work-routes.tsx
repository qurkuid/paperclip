import { Navigate, Route } from "@/lib/router";
import { ConferenceRoomChatGate } from "@/components/ConferenceRoomChatGate";
import { PipelinesExperimentalGate } from "@/components/PipelinesExperimentalGate";
import { CasesExperimentalGate } from "@/components/CasesExperimentalGate";
import { Cases } from "@/pages/Cases";
import { CaseDetail } from "@/pages/CaseDetail";
import { Projects } from "@/pages/Projects";
import { ProjectDetail } from "@/pages/ProjectDetail";
import { ProjectWorkspaceDetail } from "@/pages/ProjectWorkspaceDetail";
import { Workspaces } from "@/pages/Workspaces";
import { Issues } from "@/pages/Issues";
import { Search } from "@/pages/Search";
import { IssueDetail } from "@/pages/IssueDetail";
import { IssueChatLongThreadPerf } from "@/pages/IssueChatLongThreadPerf";
import { Routines } from "@/pages/Routines";
import { Learnings, PipelineItemDetail, PipelineItemLegacyRedirect, Pipelines, ReviewQueue } from "@/pages/Pipelines";
import { PipelineSettings } from "@/pages/PipelineSettings";
import { RoutineDetail } from "@/pages/RoutineDetail";
import { UserProfile } from "@/pages/UserProfile";
import { ExecutionWorkspaceDetail } from "@/pages/ExecutionWorkspaceDetail";
import { Goals } from "@/pages/Goals";
import { Artifacts } from "@/pages/Artifacts";
import { GoalDetail } from "@/pages/GoalDetail";
import { Approvals } from "@/pages/Approvals";
import { ApprovalDetail } from "@/pages/ApprovalDetail";
import { Costs } from "@/pages/Costs";
import { Activity } from "@/pages/Activity";
import { Inbox } from "@/pages/Inbox";
import { WhatNeedsMe } from "@/pages/WhatNeedsMe";
import { TrainingInspector, TrainingLibrary } from "@/pages/Training";
import { BoardChat } from "@/pages/BoardChat";
import { DesignGuide } from "@/pages/DesignGuide";
import { AdapterManager } from "@/pages/AdapterManager";
import { PluginPage } from "@/pages/PluginPage";
import { JoinRequestQueue } from "@/pages/JoinRequestQueue";
import { NotFoundPage } from "@/pages/NotFound";
import { loadLastInboxTab } from "@/lib/inbox";

export function companyWorkRoutes() {
  return (
    <>
      <Route path="projects" element={<Projects />} />
      <Route path="projects/:projectId" element={<ProjectDetail />} />
      <Route path="projects/:projectId/overview" element={<ProjectDetail />} />
      <Route path="projects/:projectId/issues" element={<ProjectDetail />} />
      <Route path="projects/:projectId/issues/:filter" element={<ProjectDetail />} />
      <Route path="projects/:projectId/workspaces/:workspaceId" element={<ProjectWorkspaceDetail />} />
      <Route path="projects/:projectId/workspaces" element={<ProjectDetail />} />
      <Route path="projects/:projectId/configuration" element={<ProjectDetail />} />
      <Route path="projects/:projectId/budget" element={<ProjectDetail />} />
      <Route path="workspaces" element={<Workspaces />} />
      <Route path="issues" element={<Issues />} />
      <Route path="search" element={<Search />} />
      <Route path="issues/all" element={<Navigate to="/issues" replace />} />
      <Route path="issues/active" element={<Navigate to="/issues" replace />} />
      <Route path="issues/backlog" element={<Navigate to="/issues" replace />} />
      <Route path="issues/done" element={<Navigate to="/issues" replace />} />
      <Route path="issues/recent" element={<Navigate to="/issues" replace />} />
      <Route path="issues/:issueId" element={<IssueDetail />} />
      {import.meta.env.DEV ? (
        <Route path="tests/perf/long-thread" element={<IssueChatLongThreadPerf />} />
      ) : null}
      <Route path="routines" element={<Routines />} />
      <Route
        path="cases"
        element={<CasesExperimentalGate><Cases /></CasesExperimentalGate>}
      />
      <Route
        path="cases/:caseIdentifier"
        element={<CasesExperimentalGate><CaseDetail /></CasesExperimentalGate>}
      />
      <Route
        path="review-queue"
        element={<PipelinesExperimentalGate><ReviewQueue /></PipelinesExperimentalGate>}
      />
      <Route
        path="learnings"
        element={<PipelinesExperimentalGate><Learnings /></PipelinesExperimentalGate>}
      />
      <Route
        path="pipelines"
        element={<PipelinesExperimentalGate><Pipelines /></PipelinesExperimentalGate>}
      />
      <Route
        path="pipelines/:pipelineId"
        element={<PipelinesExperimentalGate><Pipelines /></PipelinesExperimentalGate>}
      />
      <Route
        path="pipelines/:pipelineId/add"
        element={<PipelinesExperimentalGate><Pipelines /></PipelinesExperimentalGate>}
      />
      <Route
        path="pipelines/:pipelineId/settings"
        element={<PipelinesExperimentalGate><PipelineSettings /></PipelinesExperimentalGate>}
      />
      <Route
        path="pipelines/:pipelineId/items/:caseId"
        element={<PipelinesExperimentalGate><PipelineItemDetail /></PipelinesExperimentalGate>}
      />
      <Route
        path="pipelines/:pipelineId/cases/:caseId"
        element={<PipelinesExperimentalGate><PipelineItemLegacyRedirect /></PipelinesExperimentalGate>}
      />
      <Route path="routines/:routineId" element={<RoutineDetail />} />
      <Route path="routines/:routineId/:section" element={<RoutineDetail />} />
      <Route path="execution-workspaces/:workspaceId" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/services" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/configuration" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/runtime-logs" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/issues" element={<ExecutionWorkspaceDetail />} />
      <Route path="execution-workspaces/:workspaceId/routines" element={<ExecutionWorkspaceDetail />} />
    </>
  );
}

export function companyActivityRoutes() {
  return (
    <>
      <Route path="goals" element={<Goals />} />
      <Route path="goals/:goalId" element={<GoalDetail />} />
      <Route path="artifacts" element={<Artifacts />} />
      <Route path="approvals" element={<Approvals />} />
      <Route path="approvals/pending" element={<Approvals />} />
      <Route path="approvals/all" element={<Approvals />} />
      <Route path="approvals/:approvalId" element={<ApprovalDetail />} />
      <Route path="costs" element={<Costs />} />
      <Route path="activity" element={<Activity />} />
      <Route element={<ConferenceRoomChatGate />}>
        <Route path="board-chat" element={<BoardChat />} />
        <Route path="artifacts" element={<Artifacts />} />
      </Route>
      <Route path="decisions" element={<WhatNeedsMe />} />
      <Route path="training" element={<TrainingLibrary />} />
      <Route path="training/:id" element={<TrainingInspector />} />
      <Route path="inbox" element={<InboxRootRedirect />} />
      <Route path="inbox/mine" element={<Inbox />} />
      <Route path="inbox/recent" element={<Inbox />} />
      <Route path="inbox/unread" element={<Inbox />} />
      <Route path="inbox/blocked" element={<Inbox />} />
      <Route path="inbox/all" element={<Inbox />} />
      <Route path="inbox/requests" element={<JoinRequestQueue />} />
      <Route path="inbox/new" element={<Navigate to="/inbox/mine" replace />} />
      <Route path="u/:userSlug" element={<UserProfile />} />
      <Route path="design-guide" element={<DesignGuide />} />
      <Route path="instance/settings/adapters" element={<AdapterManager />} />
      <Route path=":pluginRoutePath/*" element={<PluginPage />} />
      <Route path="*" element={<NotFoundPage scope="board" />} />
    </>
  );
}

function InboxRootRedirect() {
  return <Navigate to={`/inbox/${loadLastInboxTab()}`} replace />;
}

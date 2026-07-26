import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createDebugRequestSchema, type CreateDebugRequest } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import {
  agentService,
  heartbeatService,
  issueService,
  logActivity,
  projectService,
} from "../services/index.js";
import {
  buildDebugRequestIssueSpec,
  resolveDebugRequestTargets,
} from "../services/debug-requests.js";
import { queueIssueAssignmentWakeup } from "../services/issue-assignment-wakeup.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function debugRequestRoutes(db: Db) {
  const router = Router();
  const issues = issueService(db);
  const projects = projectService(db);
  const agents = agentService(db);
  const heartbeat = heartbeatService(db);

  router.post(
    "/companies/:companyId/debug-requests",
    validate(createDebugRequestSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertBoard(req);
      assertCompanyAccess(req, companyId);

      const input = req.body as CreateDebugRequest;
      const [companyProjects, companyAgents] = await Promise.all([
        projects.list(companyId),
        agents.list(companyId),
      ]);
      const target = resolveDebugRequestTargets({
        projects: companyProjects,
        agents: companyAgents,
      });
      const spec = buildDebugRequestIssueSpec(input);
      const actor = getActorInfo(req);
      const issue = await issues.create(companyId, {
        id: randomUUID(),
        projectId: target.projectId,
        projectWorkspaceId: target.projectWorkspaceId,
        title: spec.title,
        description: spec.description,
        status: "todo",
        workMode: "standard",
        priority: "medium",
        assigneeAgentId: target.assigneeAgentId,
        originKind: spec.originKind,
        originId: spec.originId,
        originFingerprint: `ui_debug_request:${randomUUID()}`,
        createdByUserId: actor.actorId,
        responsibleUserId: actor.actorId,
        trustExplicitResponsibleUserId: true,
      });

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        agentApiKeyId: actor.agentApiKeyId,
        action: "issue.created",
        entityType: "issue",
        entityId: issue.id,
        details: {
          title: issue.title,
          identifier: issue.identifier,
          source: "ui_debug_request",
          pagePath: input.element.pagePath,
          selector: input.element.selector,
          allowPaperclipServerRestart: true,
          restartService: "paperclip",
        },
      });

      void queueIssueAssignmentWakeup({
        heartbeat,
        issue,
        reason: "ui_debug_request_assigned",
        mutation: "create",
        contextSource: "debug-requests.create",
        requestedByActorType: actor.actorType,
        requestedByActorId: actor.actorId,
      });

      res.status(201).json(issue);
    },
  );

  return router;
}

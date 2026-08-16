import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createGitHubRepositorySnapshotSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { githubRepositorySnapshotService, logActivity } from "../services/index.js";
import { assertBoardOrAgent, assertCompanyAccess, getActorInfo } from "./authz.js";

export function githubRepositorySnapshotRoutes(db: Db) {
  const router = Router(); const snapshots = githubRepositorySnapshotService(db);
  router.get("/companies/:companyId/github-repository-snapshots", async (req, res) => { const companyId = req.params.companyId as string; assertBoardOrAgent(req); assertCompanyAccess(req, companyId); res.json(await snapshots.list(companyId)); });
  router.get("/companies/:companyId/github-repository-snapshots/:snapshotId", async (req, res) => { const companyId = req.params.companyId as string; assertBoardOrAgent(req); assertCompanyAccess(req, companyId); const snapshot = await snapshots.get(companyId, req.params.snapshotId as string); if (!snapshot) return res.status(404).json({ error: "GitHub repository snapshot not found" }); res.json(snapshot); });
  router.post("/companies/:companyId/github-repository-snapshots", validate(createGitHubRepositorySnapshotSchema), async (req, res) => { const companyId = req.params.companyId as string; assertBoardOrAgent(req); assertCompanyAccess(req, companyId); const snapshot = await snapshots.collect(companyId, req.body.url); const actor = getActorInfo(req); await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, runId: actor.runId, agentApiKeyId: actor.agentApiKeyId, action: "github_repository_snapshot.collected", entityType: "github_repository_snapshot", entityId: snapshot.id, details: { sourceUrl: snapshot.sourceUrl, sourceEvidenceUrl: snapshot.sourceEvidenceUrl, status: snapshot.status, recommendation: snapshot.recommendation } }); res.status(201).json(snapshot); });
  return router;
}

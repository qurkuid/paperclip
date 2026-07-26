import { aggregateVariantMetrics } from "../analytics.js";
import {
  persistedEntrySchema,
  snapshotSchema,
  type Snapshot,
} from "../contracts/index.js";
import type { ExperimentDetail } from "../repository.js";
import type {
  EntryPayload,
  EntryWrite,
  SpacebogamExperimentServiceDeps,
  UpdateEntryPayload,
} from "./types.js";

export function createEntryActionHandlers(
  deps: SpacebogamExperimentServiceDeps,
) {
  async function createEntry(
    companyId: string,
    payload: EntryPayload,
  ): Promise<ExperimentDetail> {
    const detail = await deps.repository.createEntry(entryFromPayload(
      companyId,
      deps.newId(),
      payload,
      await deps.hashLeadKey(payload.leadKey),
    ));
    return appendSnapshot(detail, "manual");
  }

  async function updateEntry(
    companyId: string,
    payload: UpdateEntryPayload,
  ): Promise<ExperimentDetail> {
    const detail = await deps.repository.updateEntry({
      companyId,
      experimentId: payload.experimentId,
      entryId: payload.entryId,
      expectedVersion: payload.version,
      patch: entryFromPayload(
        companyId,
        payload.entryId,
        payload,
        await deps.hashLeadKey(payload.leadKey),
      ),
    });
    return appendSnapshot(detail, "manual");
  }

  async function appendSnapshot(
    detail: ExperimentDetail,
    source: Snapshot["source"],
  ): Promise<ExperimentDetail> {
    const funnel = await deps.funnelFreshness(
      detail.experiment.companyId,
      detail.experiment.id,
    );
    await deps.repository.appendSnapshot(snapshotSchema.parse({
      id: deps.newId(),
      companyId: detail.experiment.companyId,
      experimentId: detail.experiment.id,
      recordedAt: deps.now(),
      variantMetrics: aggregateVariantMetrics(detail.variants, detail.entries),
      funnelGeneratedAt: funnel.generatedAt,
      funnelDataThrough: funnel.dataThrough,
      funnelQuality: funnel.quality,
      source,
    }));
    return detail;
  }

  return { createEntry, updateEntry, appendSnapshot };
}

function entryFromPayload(
  companyId: string,
  id: string,
  payload: EntryPayload,
  leadKeyHash: string,
): EntryWrite {
  const entry = persistedEntrySchema.parse({
    id,
    companyId,
    experimentId: payload.experimentId,
    variantId: payload.variantId,
    leadKeyHash,
    outcome: payload.outcome,
    utmSource: payload.utmSource ?? null,
    utmMedium: payload.utmMedium ?? null,
    utmCampaign: payload.utmCampaign ?? null,
    enteredAt: payload.enteredAt,
    outcomeAt: payload.outcomeAt ?? null,
    version: payload.version,
  });
  return { ...entry, idempotencyKey: payload.idempotencyKey ?? null };
}

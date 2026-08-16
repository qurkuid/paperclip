import {
  spacebogamFunnelReportSchema,
  type SpacebogamFunnelRangeDays,
  type SpacebogamFunnelReport,
} from "./validators/spacebogam-funnel.js";

export const SPACEBOGAM_FUNNEL_MONITOR_RANGES = [7, 28, 90] as const;

export type SpacebogamFunnelContractSample = {
  rangeDays: SpacebogamFunnelRangeDays;
  report: unknown;
};

export type SpacebogamFunnelContractViolation = {
  rangeDays: SpacebogamFunnelRangeDays;
  field: string;
  deploymentSha: string;
};

export type SpacebogamFunnelContractMonitorResult = {
  ok: boolean;
  violations: SpacebogamFunnelContractViolation[];
};

const deploymentShaPattern = /^[0-9a-f]{7,64}$/i;

export function inspectSpacebogamFunnelContract(input: {
  deploymentSha: string;
  samples: SpacebogamFunnelContractSample[];
}): SpacebogamFunnelContractMonitorResult {
  if (!deploymentShaPattern.test(input.deploymentSha)) {
    throw new Error("deploymentSha must be a 7-64 character hexadecimal git SHA");
  }

  const violations: SpacebogamFunnelContractViolation[] = [];
  const seenRanges = new Set<SpacebogamFunnelRangeDays>();

  const record = (rangeDays: SpacebogamFunnelRangeDays, field: string) => {
    if (violations.some((violation) => (
      violation.rangeDays === rangeDays && violation.field === field
    ))) {
      return;
    }

    violations.push({
      rangeDays,
      field,
      deploymentSha: input.deploymentSha,
    });
  };

  for (const sample of input.samples) {
    if (seenRanges.has(sample.rangeDays)) {
      record(sample.rangeDays, "report.duplicateRange");
      continue;
    }
    seenRanges.add(sample.rangeDays);

    const parsed = spacebogamFunnelReportSchema.safeParse(sample.report);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const suffix = issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
        record(sample.rangeDays, `schema${suffix}`);
      }
      continue;
    }

    inspectReport(parsed.data, sample.rangeDays, record);
  }

  for (const rangeDays of SPACEBOGAM_FUNNEL_MONITOR_RANGES) {
    if (!seenRanges.has(rangeDays)) {
      record(rangeDays, "report.missingRange");
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

function inspectReport(
  report: SpacebogamFunnelReport,
  requestedRange: SpacebogamFunnelRangeDays,
  record: (rangeDays: SpacebogamFunnelRangeDays, field: string) => void,
) {
  if (report.rangeDays !== requestedRange) {
    record(requestedRange, "rangeDays");
  }

  if (!report.quality.isMonotonic) {
    record(requestedRange, "quality.isMonotonic");
  }

  const reconciliation = report.quality.leadReconciliation;
  if (!reconciliation) {
    record(requestedRange, "quality.leadReconciliation");
  } else {
    if (reconciliation.funnelLeads !== reconciliation.sourceLeads) {
      record(requestedRange, "quality.leadReconciliation.testExclusionAlignment");
    }
    if (reconciliation.missingInFunnel !== 0) {
      record(requestedRange, "quality.leadReconciliation.missingInFunnel");
    }
    if (report.counts.submittedLeads !== reconciliation.funnelLeads) {
      record(requestedRange, "counts.submittedLeads");
    }
  }

  const formStart = report.stages.find((stage) => stage.key === "form_start");
  if (!formStart) {
    record(requestedRange, "stages.form_start");
  } else {
    for (const field of [
      "previousCount",
      "conversionFromPrevious",
      "dropOffCount",
      "dropOffRate",
    ] as const) {
      if (formStart[field] !== null) {
        record(requestedRange, `stages.form_start.${field}`);
      }
    }
  }

  if (report.daily.some((row) => (
    row.submittedLeads === 0 && row.visitToLeadRate !== null
  ))) {
    record(requestedRange, "daily.visitToLeadRate.whenSubmittedLeadsZero");
  }

  if (report.campaigns.some((row) => (
    row.submittedLeads === 0 && row.visitToLeadRate !== null
  ))) {
    record(requestedRange, "campaigns.visitToLeadRate.whenSubmittedLeadsZero");
  }
}

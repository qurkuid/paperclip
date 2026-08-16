import { OperationError } from "./errors.mjs";

const COMPLETE_EVIDENCE_STATUS = "complete";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new OperationError(`Decision package is missing ${label}`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OperationError(`Decision package is missing ${label}`);
  }
  return value.trim();
}

function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function redactContacts(value) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/(?<!\d)(?:\+?82[-.\s]?)?0?1[016789][-. \s]?\d{3,4}[-. \s]?\d{4}(?!\d)/g, "[redacted-phone]");
}

function safeText(value, label) {
  return redactContacts(requireString(value, label));
}

function validateEnvelope(value, issueId, interactionId) {
  if (value.version !== 1) {
    throw new OperationError("Decision package has an unsupported version");
  }
  const company = requireRecord(value.company, "company");
  const issue = requireRecord(value.issue, "issue");
  const interaction = requireRecord(value.interaction, "interaction");
  if (issue.id !== issueId || interaction.id !== interactionId) {
    throw new OperationError("Decision package identity does not match the request");
  }
  if (value.evidenceStatus !== COMPLETE_EVIDENCE_STATUS) {
    throw new OperationError("Decision package evidence is incomplete");
  }
  if (value.canResolve !== true) {
    throw new OperationError("Decision package is not resolvable");
  }
  if (interaction.status !== "pending") {
    throw new OperationError("Decision package is not pending");
  }
  const expiresAt = requireString(interaction.expiresAt, "expiry");
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    throw new OperationError("Decision package has an invalid expiry");
  }
  if (expiresAtMs <= Date.now()) {
    throw new OperationError("Decision package is expired");
  }
  const revision = requireString(interaction.revision, "revision");
  if (revision.includes("\n") || revision.includes("\r") || revision.length > 200) {
    throw new OperationError("Decision package has an invalid revision");
  }
  return { company, issue, interaction, expiresAt, revision };
}

function parseKpis(context) {
  if (!Array.isArray(context.kpis) || context.kpis.length === 0) {
    throw new OperationError("Decision package is missing evidence KPIs");
  }
  return context.kpis.map((rawKpi) => {
    const kpi = requireRecord(rawKpi, "evidence KPI");
    return {
      label: safeText(kpi.label, "evidence KPI label"),
      value: safeText(kpi.value, "evidence KPI value"),
    };
  });
}

function parseSample(context) {
  const sample = requireRecord(context.sample, "evidence sample");
  if (
    !Number.isInteger(sample.observed)
    || sample.observed < 0
    || !Number.isInteger(sample.required)
    || sample.required <= 0
  ) {
    throw new OperationError("Decision package has invalid evidence sample counts");
  }
  return {
    observed: sample.observed,
    required: sample.required,
  };
}

function parseOptions(decision) {
  const options = Array.isArray(decision.options)
    ? decision.options.map((rawOption) => {
      const option = requireRecord(rawOption, "decision option");
      const action = requireString(option.action, "decision option action");
      if (action !== "approve" && action !== "reject") {
        throw new OperationError("Decision package has an invalid decision option");
      }
      return {
        action,
        label: safeText(option.label, "decision option label"),
      };
    })
    : [];
  if (options.length === 0) {
    throw new OperationError("Decision package is missing decision options");
  }
  return options;
}

function parseWorkProducts(links) {
  if (!Array.isArray(links.workProducts)) return [];
  return links.workProducts.map((rawWorkProduct) => {
    const workProduct = requireRecord(rawWorkProduct, "work product link");
    return {
      title: safeText(workProduct.title, "work product title"),
      href: requireString(workProduct.href, "work product href"),
    };
  });
}

/**
 * Pointer-only projection for a pending decision the bridge will not deliver
 * as a resolvable package — typically one with no decision context, so there
 * is no KPI, sample or freshness evidence to show. It carries no options and
 * no resolve grammar, so a notice can never be acted on from Telegram; the
 * board has to open the issue.
 */
export function validateDecisionNotice(raw, issueId, interactionId) {
  const value = requireRecord(raw, "payload");
  if (value.version !== 1) {
    throw new OperationError("Decision package has an unsupported version");
  }
  const company = requireRecord(value.company, "company");
  const issue = requireRecord(value.issue, "issue");
  const interaction = requireRecord(value.interaction, "interaction");
  if (issue.id !== issueId || interaction.id !== interactionId) {
    throw new OperationError("Decision package identity does not match the request");
  }
  if (interaction.status !== "pending") {
    throw new OperationError("Decision package is not pending");
  }
  const revision = requireString(interaction.revision, "revision");
  if (revision.includes("\n") || revision.includes("\r") || revision.length > 200) {
    throw new OperationError("Decision package has an invalid revision");
  }
  const links = requireRecord(value.links, "links");
  const companyName = optionalString(company.name) ?? requireString(company.id, "company id");

  return {
    companyName: redactContacts(companyName),
    issueIdentifier: safeText(issue.identifier ?? issue.id, "issue identifier"),
    issueTitle: safeText(issue.title, "issue title"),
    interactionTitle: optionalString(interaction.title) === null
      ? "Decision"
      : redactContacts(interaction.title.trim()),
    interactionSummary: optionalString(interaction.summary) === null
      ? null
      : redactContacts(interaction.summary.trim()),
    revision,
    evidenceStatus: optionalString(value.evidenceStatus) ?? "missing",
    conflict: optionalString(value.conflict) ?? "none",
    links: {
      issue: requireString(links.issue, "issue link"),
    },
  };
}

export function validateDecisionPackage(raw, issueId, interactionId) {
  const value = requireRecord(raw, "payload");
  const envelope = validateEnvelope(value, issueId, interactionId);
  const decision = requireRecord(value.decision, "decision");
  const evidence = requireRecord(value.evidence, "evidence");
  const context = requireRecord(evidence.context, "evidence context");
  const freshness = requireRecord(context.freshness, "evidence freshness");
  const links = requireRecord(value.links, "links");
  const companyName = optionalString(envelope.company.name)
    ?? requireString(envelope.company.id, "company id");

  return {
    companyName: redactContacts(companyName),
    issueIdentifier: safeText(
      envelope.issue.identifier ?? envelope.issue.id,
      "issue identifier",
    ),
    issueTitle: safeText(envelope.issue.title, "issue title"),
    interactionTitle: optionalString(envelope.interaction.title) === null
      ? "Decision"
      : redactContacts(envelope.interaction.title.trim()),
    interactionSummary: optionalString(envelope.interaction.summary) === null
      ? null
      : redactContacts(envelope.interaction.summary.trim()),
    reason: safeText(decision.reason, "decision reason"),
    options: parseOptions(decision),
    revision: envelope.revision,
    expiresAt: envelope.expiresAt,
    status: envelope.interaction.status,
    conflict: optionalString(value.conflict) ?? "none",
    kpis: parseKpis(context),
    sample: parseSample(context),
    freshness: {
      recordUpdatedAt: safeText(freshness.recordUpdatedAt, "record freshness time"),
      funnelGeneratedAt: optionalString(freshness.funnelGeneratedAt),
      funnelDataThrough: optionalString(freshness.funnelDataThrough),
      quality: optionalString(freshness.quality),
    },
    asOf: safeText(context.asOf, "evidence as-of"),
    excerpt: optionalString(evidence.excerpt) === null
      ? null
      : redactContacts(evidence.excerpt.trim()),
    links: {
      issue: requireString(links.issue, "issue link"),
      document: optionalString(links.document),
      workProducts: parseWorkProducts(links),
    },
  };
}

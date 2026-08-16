function optionalLink(label, value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const raw = value.trim();
  if ((raw.startsWith("/") && !raw.startsWith("//")) || raw.startsWith("#")) {
    return `- ${label}: ${raw}`;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.username = "";
  url.password = "";
  url.search = "";
  return `- ${label}: ${url.toString()}`;
}

function formatLinks(links) {
  return [
    optionalLink("Issue", links.issue),
    optionalLink("Document", links.document),
    ...links.workProducts.map((item) =>
      optionalLink(`Work product — ${item.title}`, item.href)),
  ].filter(Boolean);
}

export function formatDecisionNotice(notice) {
  return [
    "Paperclip decision — 근거 미비, 앱에서 처리",
    "",
    `Company: ${notice.companyName}`,
    `Issue: ${notice.issueIdentifier} — ${notice.issueTitle}`,
    `Interaction: ${notice.interactionTitle}`,
    ...(notice.interactionSummary === null ? [] : [`Summary: ${notice.interactionSummary}`]),
    `Evidence: ${notice.evidenceStatus}`,
    `Conflict: ${notice.conflict}`,
    `Revision: ${notice.revision}`,
    ...[optionalLink("Issue", notice.links.issue)].filter(Boolean),
    "",
    "이 결정은 KPI·표본·신선도 근거가 없어 텔레그램에서 승인할 수 없습니다.",
    "위 이슈를 열어 처리해 주세요.",
  ].join("\n");
}

export function formatDecisionMessage(decision, issueId, interactionId) {
  const options = decision.options
    .map((option) => `${option.label} (${option.action})`)
    .join(" / ");
  return [
    "Paperclip decision",
    "",
    `Company: ${decision.companyName}`,
    `Issue: ${decision.issueIdentifier} — ${decision.issueTitle}`,
    `Interaction: ${decision.interactionTitle}`,
    ...(decision.interactionSummary === null ? [] : [`Summary: ${decision.interactionSummary}`]),
    `Reason: ${decision.reason}`,
    `Options: ${options}`,
    `Status: ${decision.status}`,
    `Conflict: ${decision.conflict}`,
    `Revision: ${decision.revision}`,
    `Expires at: ${decision.expiresAt}`,
    "",
    "Evidence",
    ...decision.kpis.map((kpi) => `- KPI — ${kpi.label}: ${kpi.value}`),
    `- Sample: ${decision.sample.observed} observed / ${decision.sample.required} required`,
    `- Record updated at: ${decision.freshness.recordUpdatedAt}`,
    `- Funnel generated at: ${decision.freshness.funnelGeneratedAt ?? "unavailable"}`,
    `- Funnel data through: ${decision.freshness.funnelDataThrough ?? "unavailable"}`,
    `- Freshness quality: ${decision.freshness.quality ?? "unavailable"}`,
    `- As of: ${decision.asOf}`,
    ...(decision.excerpt === null ? [] : [`- Excerpt: ${decision.excerpt}`]),
    ...formatLinks(decision.links),
    "",
    "Reply with exactly one command:",
    `decision ${issueId}:${interactionId} ${decision.revision} approve`,
    `decision ${issueId}:${interactionId} ${decision.revision} reject <optional-note>`,
    "",
    "Stale, expired, replayed, cross-company, and unregistered requests fail closed.",
  ].join("\n");
}

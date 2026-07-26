import type { SpacebogamFunnelReport } from "@paperclipai/shared/validators/spacebogam-funnel";

export interface FunnelRow {
  id: string;
  stage: string;
  count: number;
  conversion: number | null;
  dropOffRate: number | null;
}

export interface DailyRow {
  id: string;
  date: string;
  visits: number;
  leads: number;
  leadRate: number | null;
}

export interface CampaignRow {
  id: string;
  campaign: string;
  sourceMedium: string;
  visits: number;
  leads: number;
  leadRate: number | null;
}

export interface LossParetoRow {
  id: string;
  transition: string;
  losses: number;
  lossRate: number | null;
  cumulativeLossShare: number;
}

export function formatCount(value: number): string {
  return value.toLocaleString("ko-KR");
}

export function formatRate(value: number | null): string {
  if (value === null) return "-";
  return `${(value * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

export function buildFunnelRows(report: SpacebogamFunnelReport): FunnelRow[] {
  return report.stages.map((stage) => ({
    id: stage.key,
    stage: stage.label,
    count: stage.count,
    conversion: stage.conversionFromPrevious,
    dropOffRate: stage.dropOffRate,
  }));
}

export function buildDailyRows(report: SpacebogamFunnelReport): DailyRow[] {
  return report.daily.map((day) => ({
    id: day.date,
    date: day.date,
    visits: day.visits,
    leads: day.submittedLeads,
    leadRate: day.visitToLeadRate,
  }));
}

export function buildCampaignRows(report: SpacebogamFunnelReport): CampaignRow[] {
  return report.campaigns.map((campaign) => ({
    id: `${campaign.source}:${campaign.medium}:${campaign.campaign}`,
    campaign: campaign.campaign || "캠페인 없음",
    sourceMedium: `${campaign.source || "unknown"} / ${campaign.medium || "unknown"}`,
    visits: campaign.visits,
    leads: campaign.submittedLeads,
    leadRate: campaign.visitToLeadRate,
  }));
}

export function buildLossParetoRows(report: SpacebogamFunnelReport): LossParetoRow[] {
  const sorted = report.stages
    .map((stage, index) => ({
      id: stage.key,
      transition: `${report.stages[index - 1]?.label ?? "이전 단계"} → ${stage.label}`,
      losses: stage.dropOffCount ?? 0,
      lossRate: stage.dropOffRate,
      cumulativeLossShare: 0,
    }))
    .filter((row) => row.losses > 0)
    .sort((left, right) => right.losses - left.losses || (right.lossRate ?? -1) - (left.lossRate ?? -1));
  const totalLosses = sorted.reduce((sum, row) => sum + row.losses, 0);
  let running = 0;

  return sorted.map((row) => {
    running += row.losses;
    return {
      ...row,
      cumulativeLossShare: totalLosses > 0 ? running / totalLosses : 0,
    };
  });
}

import { useQuery } from "@tanstack/react-query";
import type {
  SpacebogamFunnelRangeDays,
  SpacebogamFunnelReport,
} from "@paperclipai/shared/validators/spacebogam-funnel";
import { fetchSpacebogamFunnel, spacebogamFunnelQueryKey } from "../api/spacebogam-funnel";

export const SPACEBOGAM_FUNNEL_STALE_MS = 60_000;
export const SPACEBOGAM_FUNNEL_REFETCH_MS = 300_000;

export function useSpacebogamFunnel(
  companyId: string | null | undefined,
  rangeDays: SpacebogamFunnelRangeDays,
) {
  const selectedCompanyId = companyId ?? "__none__";

  return useQuery<SpacebogamFunnelReport>({
    queryKey: spacebogamFunnelQueryKey(selectedCompanyId, rangeDays),
    queryFn: () => {
      if (!companyId) throw new Error("Select a company first.");
      return fetchSpacebogamFunnel(companyId, rangeDays);
    },
    enabled: Boolean(companyId),
    staleTime: SPACEBOGAM_FUNNEL_STALE_MS,
    refetchInterval: SPACEBOGAM_FUNNEL_REFETCH_MS,
  });
}

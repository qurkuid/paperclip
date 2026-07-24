import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { attentionApi } from "@/api/attention";
import { selectInboxReviewRequests } from "@/lib/inbox-review-requests";
import { queryKeys } from "@/lib/queryKeys";

export function useInboxReviewRequests(companyId: string | null | undefined) {
  const query = useQuery({
    queryKey: companyId
      ? queryKeys.attention(companyId)
      : ["attention", "__disabled__"] as const,
    queryFn: () => {
      if (!companyId) {
        throw new Error("Company ID is required to load inbox review requests.");
      }
      return attentionApi.list(companyId);
    },
    enabled: Boolean(companyId),
  });

  const reviewRequests = useMemo(
    () => selectInboxReviewRequests(query.data?.items ?? []),
    [query.data?.items],
  );

  return {
    reviewRequests,
    isLoading: query.isLoading,
  };
}

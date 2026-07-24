import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import type { OpenCrabSchemaPack } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { agentsApi } from "../api/agents";
import { useToastActions } from "../context/ToastContext";
import { assignRecommendedOpenCrabPacks } from "../lib/opencrab-agent-assignment";
import { queryKeys } from "../lib/queryKeys";

export function OpenCrabCompanySync({
  companyId,
  packs,
}: {
  companyId: string;
  packs: OpenCrabSchemaPack[];
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });
  const sync = useMutation({
    mutationFn: () => assignRecommendedOpenCrabPacks({
      companyId,
      packs,
      agents: agentsQuery.data ?? [],
      updateAgent: agentsApi.update,
    }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) }),
        ...result.assignments.map(({ agentId }) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) })),
      ]);
      pushToast({
        title: "직원별 OpenCrab 추천 팩 동기화 완료",
        body: `${result.updated}명 업데이트 · ${result.skipped}명 기존 설정 유지`,
        tone: "success",
      });
    },
    onError: (error) => pushToast({
      title: "직원별 팩 동기화 실패",
      body: error instanceof Error ? error.message : "직원 설정을 업데이트하지 못했습니다.",
      tone: "error",
    }),
  });

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-primary/10 p-2 text-primary">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">현재·신규 직원 팩 동기화</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              유효한 수동 선택은 보존하고, 미설정 직원만 역할에 맞는 추천 팩으로 채웁니다.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => sync.mutate()}
          disabled={sync.isPending || agentsQuery.isLoading || packs.length === 0}
        >
          {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          전체 직원 추천 팩 동기화
        </Button>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import type { AgentDetail as AgentDetailRecord } from "@paperclipai/shared";
import {
  OPENCRAB_SPACE_IDS,
  parseOpenCrabAgentConfig,
  recommendOpenCrabPackIds,
  type OpenCrabAgentConfig,
} from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { secretsApi } from "../api/secrets";
import { toolsApi } from "../api/tools";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "../components/InlineBanner";
import { useToastActions } from "../context/ToastContext";
import {
  connectOfficialOpenCrab,
  fetchOfficialOpenCrabPacks,
  isOfficialOpenCrabConnection,
} from "../lib/opencrab-connection";
import { queryKeys } from "../lib/queryKeys";
import { OpenCrabCompanySync } from "./OpenCrabCompanySync";
import { OpenCrabConnectionPanel } from "./OpenCrabConnectionPanel";
import { OpenCrabPackSelector } from "./OpenCrabPackSelector";

function initialConfig(agent: AgentDetailRecord): OpenCrabAgentConfig {
  const stored = parseOpenCrabAgentConfig(agent.runtimeConfig.openCrab);
  if (stored.packIds.length > 0) return stored;
  return {
    enabled: false,
    packIds: [],
    focusSpaces: [...OPENCRAB_SPACE_IDS],
    queryPolicy: "task_relevant",
  };
}

export function AgentOpenCrabTab({
  agent,
  companyId,
}: {
  agent: AgentDetailRecord;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [config, setConfig] = useState(() => initialConfig(agent));
  const [mcpUrl, setMcpUrl] = useState("");

  const connectionsQuery = useQuery({
    queryKey: queryKeys.tools.connections(companyId),
    queryFn: () => toolsApi.listConnections(companyId),
  });
  const connections = connectionsQuery.data?.connections ?? [];
  const connection = useMemo(
    () => connections.find(isOfficialOpenCrabConnection),
    [connections],
  );
  const installed = Boolean(connection?.installs?.some(
    (target) => target.targetType === "company"
      || (target.targetType === "agent" && target.targetId === agent.id),
  ));

  const packsQuery = useQuery({
    queryKey: ["opencrab", "packs", connection?.id, agent.id],
    queryFn: () => {
      if (!connection) throw new Error("공식 OpenCrab MCP 연결이 필요합니다.");
      return fetchOfficialOpenCrabPacks({
        connectionId: connection.id,
        agentId: agent.id,
        client: toolsApi,
      });
    },
    enabled: Boolean(connection && installed),
    retry: false,
  });
  const packs = packsQuery.data ?? [];
  const recommendedPackIds = useMemo(
    () => recommendOpenCrabPackIds({
      name: agent.name,
      role: agent.role,
      title: agent.title,
    }, packs),
    [agent.name, agent.role, agent.title, packs],
  );

  useEffect(() => {
    setConfig(initialConfig(agent));
  }, [agent.id, agent.runtimeConfig]);

  useEffect(() => {
    if (packs.length === 0) return;
    const availableIds = new Set(packs.map((pack) => pack.id));
    setConfig((current) => {
      const validPackIds = current.packIds.filter((packId) => availableIds.has(packId));
      const packIds = validPackIds.length > 0 ? validPackIds : recommendedPackIds;
      return { ...current, enabled: packIds.length > 0, packIds };
    });
  }, [packs, recommendedPackIds]);

  const connect = useMutation({
    mutationFn: () => connectOfficialOpenCrab({
      companyId,
      agentId: agent.id,
      mcpUrl: mcpUrl.trim(),
      connections,
      client: {
        ...toolsApi,
        listSecrets: secretsApi.list,
        createSecret: secretsApi.create,
        rotateSecret: secretsApi.rotate,
      },
    }),
    onSuccess: async () => {
      setMcpUrl("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.tools.connections(companyId) });
      pushToast({ title: "공식 OpenCrab MCP 연결 완료", tone: "success" });
    },
    onError: (error) => pushToast({
      title: "OpenCrab 연결 실패",
      body: error instanceof Error ? error.message : "원격 MCP에 연결하지 못했습니다.",
      tone: "error",
    }),
  });

  const assign = useMutation({
    mutationFn: () => {
      const availableIds = new Set(packs.map((pack) => pack.id));
      const missing = config.packIds.filter((packId) => !availableIds.has(packId));
      if (missing.length > 0) {
        throw new Error("현재 OpenCrab MCP 목록에 없는 팩은 할당할 수 없습니다.");
      }
      return agentsApi.update(agent.id, {
        runtimeConfig: {
          ...agent.runtimeConfig,
          openCrab: config,
        },
      }, companyId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) });
      pushToast({
        title: "직원별 팩 설정 저장 완료",
        body: `${agent.name}에게 ${config.packIds.length}개 팩을 할당했습니다.`,
        tone: "success",
      });
    },
    onError: (error) => pushToast({
      title: "팩 설정 저장 실패",
      body: error instanceof Error ? error.message : "설정을 저장하지 못했습니다.",
      tone: "error",
    }),
  });

  return (
    <div className="max-w-4xl space-y-4">
      <OpenCrabConnectionPanel
        connected={Boolean(connection && installed)}
        hasConnection={Boolean(connection)}
        mcpUrl={mcpUrl}
        pending={connect.isPending}
        onMcpUrlChange={setMcpUrl}
        onConnect={() => connect.mutate()}
      />

      {packsQuery.isError && (
        <InlineBanner tone="danger">
          {packsQuery.error instanceof Error
            ? packsQuery.error.message
            : "MCP 팩 목록을 불러오지 못했습니다."}
        </InlineBanner>
      )}
      {packsQuery.isFetching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> MCP에서 접근 가능한 팩을 확인하는 중입니다.
        </div>
      )}
      {packs.length > 0 && (
        <>
          <OpenCrabCompanySync companyId={companyId} packs={packs} />
          <OpenCrabPackSelector
            config={config}
            packs={packs}
            recommendedPackIds={recommendedPackIds}
            onChange={setConfig}
          />
          <div className="flex justify-end">
            <Button
              onClick={() => assign.mutate()}
              disabled={assign.isPending || config.packIds.length === 0}
            >
              {assign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              선택한 팩을 이 직원에게 할당
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

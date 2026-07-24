import {
  OPENCRAB_SPACE_IDS,
  parseOpenCrabAgentConfig,
  recommendOpenCrabPackIds,
  type Agent,
  type OpenCrabAgentConfig,
  type OpenCrabSchemaPack,
} from "@paperclipai/shared";

type AssignableAgent = Pick<
  Agent,
  "id" | "name" | "role" | "status" | "runtimeConfig"
> & { title?: string | null };

interface AssignmentResult {
  updated: number;
  skipped: number;
  assignments: Array<{ agentId: string; agentName: string; packIds: string[] }>;
}

function sameConfig(left: OpenCrabAgentConfig, right: OpenCrabAgentConfig): boolean {
  return left.enabled === right.enabled
    && left.packIds.join("\0") === right.packIds.join("\0")
    && left.focusSpaces.join("\0") === right.focusSpaces.join("\0");
}

export async function assignRecommendedOpenCrabPacks(input: {
  companyId: string;
  agents: readonly AssignableAgent[];
  packs: readonly OpenCrabSchemaPack[];
  updateAgent: (
    agentId: string,
    data: Record<string, unknown>,
    companyId: string,
  ) => Promise<unknown>;
}): Promise<AssignmentResult> {
  const availableIds = new Set(input.packs.map((pack) => pack.id));
  const candidates = input.agents.filter((agent) => agent.status !== "terminated");
  const assignments = candidates.flatMap((agent) => {
    const stored = parseOpenCrabAgentConfig(agent.runtimeConfig.openCrab);
    const validPackIds = stored.packIds.filter((packId) => availableIds.has(packId));
    const packIds = validPackIds.length > 0
      ? validPackIds
      : recommendOpenCrabPackIds({
          name: agent.name,
          role: agent.role,
          title: agent.title,
        }, input.packs);
    if (packIds.length === 0) return [];
    const nextConfig: OpenCrabAgentConfig = {
      enabled: true,
      packIds,
      focusSpaces: stored.focusSpaces.length > 0
        ? stored.focusSpaces
        : [...OPENCRAB_SPACE_IDS],
      queryPolicy: "task_relevant",
    };
    if (sameConfig(stored, nextConfig)) return [];
    return [{ agent, nextConfig }];
  });

  await Promise.all(assignments.map(({ agent, nextConfig }) =>
    input.updateAgent(agent.id, {
      runtimeConfig: {
        ...agent.runtimeConfig,
        openCrab: nextConfig,
      },
    }, input.companyId)));

  return {
    updated: assignments.length,
    skipped: candidates.length - assignments.length,
    assignments: assignments.map(({ agent, nextConfig }) => ({
      agentId: agent.id,
      agentName: agent.name,
      packIds: nextConfig.packIds,
    })),
  };
}

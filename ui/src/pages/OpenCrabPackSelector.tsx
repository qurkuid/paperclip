import {
  OPENCRAB_SPACE_IDS,
  type OpenCrabAgentConfig,
  type OpenCrabSchemaPack,
  type OpenCrabSpaceId,
} from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const SPACE_LABELS: Record<OpenCrabSpaceId, string> = {
  subject: "직원·조직",
  resource: "자료·프로젝트",
  evidence: "근거",
  concept: "개념",
  claim: "주장",
  outcome: "성과",
  lever: "개선 수단",
  community: "주제 묶음",
  policy: "정책·권한",
};

export function OpenCrabPackSelector({
  config,
  packs,
  recommendedPackIds,
  onChange,
}: {
  config: OpenCrabAgentConfig;
  packs: OpenCrabSchemaPack[];
  recommendedPackIds: string[];
  onChange: (config: OpenCrabAgentConfig) => void;
}) {
  const togglePack = (packId: string, checked: boolean) => {
    const packIds = checked
      ? [...new Set([...config.packIds, packId])]
      : config.packIds.filter((value) => value !== packId);
    onChange({ ...config, enabled: packIds.length > 0, packIds });
  };
  const toggleSpace = (spaceId: OpenCrabSpaceId, checked: boolean) => {
    const focusSpaces = checked
      ? [...new Set([...config.focusSpaces, spaceId])]
      : config.focusSpaces.filter((value) => value !== spaceId);
    onChange({ ...config, focusSpaces });
  };

  return (
    <>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">MCP에서 가져온 온톨로지 팩</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              이 직원에게 필요한 팩만 선택하세요. 선택하지 않은 팩은 실행 문맥에 넣지 않습니다.
            </p>
          </div>
          {recommendedPackIds.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onChange({
                ...config,
                enabled: true,
                packIds: recommendedPackIds,
              })}
            >
              추천 항목 선택
            </Button>
          )}
        </div>
        <div className="mt-3 space-y-3">
          {packs.map((pack) => {
            const recommended = recommendedPackIds.includes(pack.id);
            return (
              <label key={pack.id} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={config.packIds.includes(pack.id)}
                  onCheckedChange={(checked) => togglePack(pack.id, Boolean(checked))}
                  aria-label={`${pack.name} 사용`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{pack.name}</span>
                    {recommended && <Badge variant="secondary">이 직원에게 추천</Badge>}
                    {pack.installed && <Badge variant="outline">이 계정에서 사용 가능</Badge>}
                  </span>
                  {pack.description && (
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {pack.description}
                    </span>
                  )}
                  <span className="mt-1 block font-mono text-(length:--text-micro) text-muted-foreground">
                    {pack.id} · v{pack.version}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">이 직원이 집중할 지식 공간</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OPENCRAB_SPACE_IDS.map((spaceId) => (
            <label key={spaceId} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox
                checked={config.focusSpaces.includes(spaceId)}
                onCheckedChange={(checked) => toggleSpace(spaceId, Boolean(checked))}
                aria-label={`${SPACE_LABELS[spaceId]} 사용`}
              />
              {SPACE_LABELS[spaceId]}
            </label>
          ))}
        </div>
      </section>
    </>
  );
}

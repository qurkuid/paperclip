import { Database, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineBanner } from "../components/InlineBanner";

export function OpenCrabConnectionPanel({
  connected,
  hasConnection,
  mcpUrl,
  pending,
  onMcpUrlChange,
  onConnect,
}: {
  connected: boolean;
  hasConnection: boolean;
  mcpUrl: string;
  pending: boolean;
  onMcpUrlChange: (value: string) => void;
  onConnect: () => void;
}) {
  return (
    <>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <span className="rounded-md bg-emerald-500/10 p-2 text-emerald-600">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">공식 OpenCrab 원격 MCP</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                계정의 Marketplace·Packs 목록을 가져와 직원별로 필요한 팩만 할당합니다.
                회사 연결이라 새 직원도 MCP 도구 접근을 자동으로 상속합니다.
              </p>
            </div>
          </div>
          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            {connected ? "연결됨" : hasConnection ? "이 직원 연결 필요" : "연결 전"}
          </span>
        </div>
      </section>

      <InlineBanner tone="info">
        LocalCrab 로컬 스키마가 아니라 <strong>opencrab.sh</strong>에서 발급한 계정 전용
        원격 MCP URL을 사용합니다. 팩 목록도 코드에 고정하지 않고 MCP에서 실시간으로 가져옵니다.
      </InlineBanner>

      <section className="rounded-lg border border-border bg-card p-4">
        <label htmlFor="opencrab-mcp-url" className="text-sm font-semibold">
          OpenCrab 계정 전용 MCP URL
        </label>
        <Input
          id="opencrab-mcp-url"
          type="password"
          autoComplete="off"
          className="mt-2 font-mono text-xs"
          value={mcpUrl}
          onChange={(event) => onMcpUrlChange(event.target.value)}
          placeholder={hasConnection
            ? "연결된 URL을 유지하려면 비워 두세요"
            : "https://opencrab.sh/api/mcp/ocm_..."}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3">
            <a
              href="https://opencrab.sh/mcp"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              MCP URL 관리 <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://opencrab.sh/marketplace"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Marketplace <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <Button
            onClick={onConnect}
            disabled={pending || (!hasConnection && !mcpUrl.trim())}
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {connected ? "MCP 다시 연결" : "MCP 연결 및 팩 불러오기"}
          </Button>
        </div>
      </section>
    </>
  );
}

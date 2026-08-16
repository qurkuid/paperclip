// @vitest-environment jsdom

import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentActionButtons } from "./AgentActionButtons";

const mockNavigate = vi.hoisted(() => vi.fn());
const mockOpenNewIssue = vi.hoisted(() => vi.fn());
const mockPushToast = vi.hoisted(() => vi.fn());
const mockAgentsApi = vi.hoisted(() => ({
  invoke: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  clearError: vi.fn(),
  approve: vi.fn(),
  terminate: vi.fn(),
  resetSession: vi.fn(),
  instructionsBundle: vi.fn(),
  instructionsFile: vi.fn(),
  create: vi.fn(),
  hire: vi.fn(),
}));

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock("../context/DialogContext", () => ({
  useDialogActions: () => ({ openNewIssue: mockOpenNewIssue }),
}));

vi.mock("../context/ToastContext", () => ({
  useToastActions: () => ({ pushToast: mockPushToast }),
}));

vi.mock("../api/agents", () => ({
  agentsApi: mockAgentsApi,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

async function act(callback: () => void | Promise<void>) {
  let result: void | Promise<void> = undefined;
  flushSync(() => {
    result = callback();
  });
  await result;
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function waitForTestCondition(
  predicate: () => boolean,
  message: string,
  attempts = 100,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await flushReact();
  }
  throw new Error(message);
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    companyId: "company-1",
    name: "Alpha Agent",
    urlKey: "alpha",
    role: "engineer",
    title: null,
    icon: null,
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: false },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("AgentActionButtons", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;
  let queryClient: QueryClient;
  let invalidateQueries: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    invalidateQueries = vi.spyOn(queryClient, "invalidateQueries") as unknown as ReturnType<typeof vi.fn>;
    mockAgentsApi.clearError.mockResolvedValue(makeAgent({ status: "idle" }));
    mockAgentsApi.pause.mockResolvedValue(makeAgent({ status: "paused" }));
    mockAgentsApi.resume.mockResolvedValue(makeAgent({ status: "idle" }));
    mockAgentsApi.invoke.mockResolvedValue({ id: "run-1" });
    mockAgentsApi.resetSession.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const currentRoot = root;
    if (currentRoot) {
      await act(async () => {
        currentRoot.unmount();
      });
    }
    queryClient.clear();
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  function render(agent: Agent) {
    root = createRoot(container);
    root.render(
      <QueryClientProvider client={queryClient}>
        <AgentActionButtons agent={agent} companyId="company-1" runLabel="하트비트 실행" />
      </QueryClientProvider>,
    );
  }

  it("replaces the pause slot with Clear error for error agents", async () => {
    render(makeAgent({ status: "error" }));
    await flushReact();

    expect(container.textContent).toContain("오류 해제");
    expect(container.textContent).not.toContain("일시정지");
    expect(container.textContent).toContain("하트비트 실행");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Alpha Agent 작업 메뉴 열기"]')?.click();
    });
    await flushReact();

    expect(document.body.textContent).toContain("세션 초기화");
  });

  it("calls clearError and refreshes agent-related queries", async () => {
    render(makeAgent({ status: "error" }));
    await waitForTestCondition(
      () => container.querySelector('[aria-label="Clear error and return agent to idle"]') !== null,
      "Clear error action did not render",
    );

    const clearErrorButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Clear error and return agent to idle"]',
    );
    if (!clearErrorButton) throw new Error("Clear error action did not render");
    await act(async () => {
      clearErrorButton.click();
    });
    await waitForTestCondition(
      () =>
        mockAgentsApi.clearError.mock.calls.length === 1
        && invalidateQueries.mock.calls.some(
          ([filters]) =>
            JSON.stringify(filters) === JSON.stringify({ queryKey: ["heartbeats", "company-1", "agent-1"] }),
        ),
      "Clear error mutation did not finish refreshing agent queries",
    );

    expect(mockAgentsApi.clearError).toHaveBeenCalledWith("agent-1", "company-1");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["agents", "detail", "agent-1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["agents", "detail", "alpha"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["agents", "runtime-state", "agent-1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["agents", "task-sessions", "agent-1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["agents", "company-1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["live-runs", "company-1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["heartbeats", "company-1", "agent-1"] });
  });

  it("keeps the normal pause action for non-error agents", async () => {
    render(makeAgent({ status: "active" }));
    await flushReact();

    expect(container.textContent).toContain("일시정지");
    expect(container.textContent).not.toContain("오류 해제");
  });
});

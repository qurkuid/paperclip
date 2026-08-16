// @vitest-environment jsdom

import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebugRequestLauncher } from "./DebugRequestLauncher";

const createDebugRequestMock = vi.hoisted(() => vi.fn());
const pushToastMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("../api/debug-requests", () => ({
  debugRequestsApi: {
    create: (companyId: string, input: unknown) => createDebugRequestMock(companyId, input),
  },
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "company-1",
    selectedCompany: { issuePrefix: "CMP" },
  }),
}));

vi.mock("../context/ToastContext", () => ({
  useOptionalToastActions: () => ({ pushToast: pushToastMock }),
}));

vi.mock("@/lib/router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

async function flushReact() {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("DebugRequestLauncher", () => {
  let container: HTMLDivElement;
  let target: HTMLButtonElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    target = document.createElement("button");
    target.textContent = "Approve action";
    target.id = "approve-action";
    document.body.append(container, target);
    root = createRoot(container);
    flushSync(() => root.render(<DebugRequestLauncher />));
    createDebugRequestMock.mockResolvedValue({
      id: "issue-1",
      identifier: "CMP-99",
    });
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    document.body.innerHTML = "";
    document.head
      .querySelector("meta[name='paperclip-developer-console-url']")
      ?.remove();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("selects an element, opens a request modal, and creates an assigned task", async () => {
    const launcher = container.querySelector<HTMLButtonElement>("[aria-label='개발할 요소 선택']");
    if (!launcher) throw new Error("debug launcher missing");

    flushSync(() => launcher.click());
    expect(document.body.textContent).toContain("개발할 요소를 선택하세요");

    flushSync(() => target.click());
    expect(document.body.textContent).toContain("Paperclip Developer");
    expect(document.body.textContent).toContain("선택한 요소 개발 요청");
    expect(document.body.textContent).toContain("Approve action");

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) throw new Error("request textarea missing");
    flushSync(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "승인 버튼의 결과를 카드 안에서 바로 확인하게 해 주세요.");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const submit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("개발 요청 보내기"),
    );
    if (!submit) throw new Error("submit button missing");
    flushSync(() => submit.click());
    await flushReact();

    expect(createDebugRequestMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        request: "승인 버튼의 결과를 카드 안에서 바로 확인하게 해 주세요.",
        allowPaperclipServerRestart: true,
        element: expect.objectContaining({
          selector: "#approve-action",
          text: "Approve action",
        }),
      }),
    );
    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "CMP-99 작업을 생성했습니다",
        body: "Paperclip 개발자가 선택한 요소와 요청사항을 전달받았습니다.",
      }),
    );
  });

  it("starts element selection when requested from a task status menu", () => {
    flushSync(() => window.dispatchEvent(new Event("paperclip:start-debug-request")));

    expect(document.body.textContent).toContain("개발할 요소를 선택하세요");
  });

  it("opens the independent developer console when its URL is configured", async () => {
    const developerConsoleMeta = document.createElement("meta");
    developerConsoleMeta.name = "paperclip-developer-console-url";
    developerConsoleMeta.content = "https://developer.example.test/paperclip";
    document.head.append(developerConsoleMeta);
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);

    const launcher = container.querySelector<HTMLButtonElement>("[aria-label='개발할 요소 선택']");
    if (!launcher) throw new Error("debug launcher missing");

    flushSync(() => launcher.click());
    flushSync(() => target.click());

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) throw new Error("request textarea missing");
    flushSync(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "승인 결과가 저장되지 않는 원인을 풀스택으로 확인해 주세요.");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const submit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("개발 요청 보내기"),
    );
    if (!submit) throw new Error("submit button missing");
    flushSync(() => submit.click());
    await flushReact();

    expect(createDebugRequestMock).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalledOnce();
    const openedUrl = openMock.mock.calls[0]?.[0];
    if (typeof openedUrl !== "string") throw new Error("developer console URL missing");
    const parsedUrl = new URL(openedUrl);
    expect(parsedUrl.origin).toBe("https://developer.example.test");
    expect(parsedUrl.pathname).toBe("/paperclip");
    expect(parsedUrl.hash).toContain("paperclip-debug=");
  });
});

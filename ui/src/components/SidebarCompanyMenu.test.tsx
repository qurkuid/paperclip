// @vitest-environment jsdom

import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";

const mockAuthApi = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  signOut: vi.fn(),
}));
const mockNavigate = vi.hoisted(() => vi.fn());
const mockOpenOnboarding = vi.hoisted(() => vi.fn());
const mockSetSelectedCompanyId = vi.hoisted(() => vi.fn());
const mockSetSidebarOpen = vi.hoisted(() => vi.fn());
const mockLocation = vi.hoisted(() => ({ pathname: "/PAP/dashboard" }));
const mockSidebarPreferencesApi = vi.hoisted(() => ({
  getCompanyOrder: vi.fn(),
  updateCompanyOrder: vi.fn(),
}));

vi.mock("@/api/auth", () => ({
  authApi: mockAuthApi,
}));

vi.mock("@/api/sidebarPreferences", () => ({
  sidebarPreferencesApi: mockSidebarPreferencesApi,
}));

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [
      {
        id: "company-1",
        issuePrefix: "PAP",
        name: "Acme Labs",
        brandColor: "#3366ff",
        status: "active",
      },
      {
        id: "company-2",
        issuePrefix: "STR",
        name: "Strata",
        brandColor: "#36a269",
        status: "active",
      },
      {
        id: "company-3",
        issuePrefix: "ANA",
        name: "Anachronist Wiki",
        brandColor: "#a36a21",
        status: "active",
      },
    ],
    selectedCompany: {
      id: "company-1",
      issuePrefix: "PAP",
      name: "Acme Labs",
      brandColor: "#3366ff",
      status: "active",
    },
    setSelectedCompanyId: mockSetSelectedCompanyId,
  }),
}));

vi.mock("@/context/DialogContext", () => ({
  useDialogActions: () => ({
    openOnboarding: mockOpenOnboarding,
  }),
}));

vi.mock("./CompanyPatternIcon", () => ({
  CompanyPatternIcon: ({ companyName }: { companyName: string }) => (
    <span aria-hidden="true">{companyName.slice(0, 1)}</span>
  ),
}));

vi.mock("../context/SidebarContext", () => ({
  useSidebar: () => ({
    isMobile: false,
    setSidebarOpen: mockSetSidebarOpen,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function act(callback: () => void) {
  flushSync(callback);
}

async function flushReact() {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("SidebarCompanyMenu", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockAuthApi.getSession.mockResolvedValue({
      session: { id: "session-1", userId: "user-1" },
      user: {
        id: "user-1",
        name: "Jane Example",
        email: "jane@example.com",
      },
    });
    mockAuthApi.signOut.mockResolvedValue(undefined);
    mockSidebarPreferencesApi.getCompanyOrder.mockResolvedValue({
      orderedIds: ["company-1", "company-2", "company-3"],
      updatedAt: null,
    });
    mockSidebarPreferencesApi.updateCompanyOrder.mockResolvedValue({
      orderedIds: ["company-1", "company-2", "company-3"],
      updatedAt: null,
    });
    mockLocation.pathname = "/PAP/dashboard";
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("uses company-centric create copy without the chat flag", async () => {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SidebarCompanyMenu />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    const trigger = container.querySelector('button[aria-label="Acme Labs 회사 전환 메뉴 열기"]');
    expect(trigger).not.toBeNull();
    act(() => {
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(document.body.textContent).toContain("새 회사 만들기...");
    expect(document.body.textContent).not.toContain("Add company...");

    act(() => {
      root.unmount();
    });
  });

  it("shows the requested company actions and signs out through the dropdown", async () => {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SidebarCompanyMenu />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    expect(container.textContent).toContain("Acme Labs");

    const trigger = container.querySelector('button[aria-label="Acme Labs 회사 전환 메뉴 열기"]');
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(document.body.textContent).toContain("회사 전환");
    expect(document.body.textContent).toContain("편집");
    expect(document.body.textContent).toContain("Strata");
    expect(document.body.textContent).toContain("ANA");
    expect(document.body.textContent).toContain("새 회사 만들기...");
    expect(document.body.textContent).toContain("Acme Labs에 사용자 초대");
    expect(document.body.textContent).toContain("회사 설정");
    expect(document.body.textContent).toContain("로그아웃");

    const signOutButton = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]'))
      .find((element) => element.textContent?.includes("로그아웃"));
    expect(signOutButton).toBeTruthy();

    act(() => {
      signOutButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockAuthApi.signOut).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("toggles company order editing without selecting a company", async () => {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SidebarCompanyMenu />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    const trigger = container.querySelector('button[aria-label="Acme Labs 회사 전환 메뉴 열기"]');
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    const editButton = Array.from(document.body.querySelectorAll("button"))
      .find((element) => element.textContent === "편집");
    expect(editButton).toBeTruthy();

    act(() => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(document.body.textContent).toContain("완료");
    expect(document.body.textContent).not.toContain("PAP");
    expect(document.body.textContent).not.toContain("ANA");
    expect(document.body.querySelector('button[aria-label="Strata 순서 변경"]')).toBeTruthy();

    const strataItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]'))
      .find((element) => element.textContent?.includes("Strata"));
    expect(strataItem).toBeTruthy();

    act(() => {
      strataItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockSetSelectedCompanyId).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("navigates to the selected company dashboard from company-prefixed routes", async () => {
    mockLocation.pathname = "/PAP/issues";
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SidebarCompanyMenu />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    const trigger = container.querySelector('button[aria-label="Acme Labs 회사 전환 메뉴 열기"]');
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    const strataItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]'))
      .find((element) => element.textContent?.includes("Strata"));
    expect(strataItem).toBeTruthy();

    act(() => {
      strataItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockSetSelectedCompanyId).toHaveBeenCalledWith("company-2");
    expect(mockNavigate).toHaveBeenCalledWith("/STR/dashboard");

    act(() => {
      root.unmount();
    });
  });
});

// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { CompanySkillImportPreviewResult } from "@paperclipai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportSkillSourceDialog } from "./ImportSkillSourceDialog";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div role="dialog" className={className}>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, variant: _variant, ...props }: ComponentProps<"button"> & { variant?: string }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const preview: CompanySkillImportPreviewResult = {
  mode: "preview",
  valid: true,
  candidates: [{
    key: "acme/review",
    slug: "review",
    name: "Review",
    description: "Review pull requests.",
    sourceType: "github",
    sourceRef: "0123456789abcdef0123456789abcdef01234567",
    trustLevel: "markdown_only",
    compatibility: "compatible",
    fileCount: 1,
  }],
  warnings: ["Pinned to the detected commit."],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function buttonNamed(name: string) {
  return Array.from(container?.querySelectorAll("button") ?? [])
    .find((button) => button.textContent?.includes(name)) as HTMLButtonElement | undefined;
}

async function click(button: HTMLButtonElement) {
  flushSync(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
});

describe("ImportSkillSourceDialog", () => {
  it("requires source verification before exposing the install action", async () => {
    const onPreview = vi.fn();
    const onInstall = vi.fn();

    function Harness() {
      const [validated, setValidated] = useState<CompanySkillImportPreviewResult | null>(null);
      return (
        <ImportSkillSourceDialog
          open
          source="https://github.com/acme/review"
          preview={validated}
          validationError={null}
          previewPending={false}
          installPending={false}
          onOpenChange={vi.fn()}
          onSourceChange={vi.fn()}
          onPreview={() => {
            onPreview();
            setValidated(preview);
          }}
          onInstall={onInstall}
        />
      );
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root?.render(<Harness />));

    expect(buttonNamed("Install verified skill")).toBeUndefined();
    const verifyButton = buttonNamed("Verify source");
    expect(verifyButton).toBeTruthy();
    expect(container.querySelector('a[href="https://skills.sh"]')).toBeTruthy();
    expect(container.querySelector('a[href^="https://github.com/search"]')).toBeTruthy();

    await click(verifyButton!);

    expect(onPreview).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Valid Agent Skill source");
    expect(container.textContent).toContain("Review");
    expect(container.textContent).toContain("Compatible");
    expect(container.textContent).toContain("Markdown only");
    expect(container.textContent).toContain("Pinned to the detected commit.");
    expect(container.querySelector('[role="dialog"]')?.className).toContain("overflow-y-auto");

    const installButton = buttonNamed("Install verified skill");
    expect(installButton).toBeTruthy();
    await click(installButton!);

    expect(onInstall).toHaveBeenCalledOnce();
  });

  it("shows verification failures without exposing the install action", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root?.render(
      <ImportSkillSourceDialog
        open
        source="https://github.com/acme/not-a-skill"
        preview={null}
        validationError="YAML frontmatter must include name and description."
        previewPending={false}
        installPending={false}
        onOpenChange={vi.fn()}
        onSourceChange={vi.fn()}
        onPreview={vi.fn()}
        onInstall={vi.fn()}
      />,
    ));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "YAML frontmatter must include name and description.",
    );
    expect(buttonNamed("Install verified skill")).toBeUndefined();
    expect(buttonNamed("Verify source")).toBeTruthy();
  });
});

// @vitest-environment node

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../context/ThemeContext";
import { MarkdownBody } from "./MarkdownBody";

vi.mock("@/lib/router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: { children: ReactNode; to: string } & React.ComponentProps<"a">) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({
    pathname: "/CMP/issues/CMP-2",
    search: "",
    hash: "",
    state: null,
  }),
}));

vi.mock("../context/CompanyContext", () => ({
  useOptionalCompany: () => null,
}));

function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider>
        <MarkdownBody>{markdown}</MarkdownBody>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("MarkdownBody image links", () => {
  it("renders a linked HTTP image inline while preserving the destination", () => {
    // Given
    const markdown = "[1안 · 견적 누락](http://127.0.0.1:8765/cover-01.png)";

    // When
    const html = renderMarkdown(markdown);

    // Then
    expect(html).toContain('href="http://127.0.0.1:8765/cover-01.png"');
    expect(html).toContain('<img src="http://127.0.0.1:8765/cover-01.png"');
    expect(html).toContain('alt="1안 · 견적 누락"');
    expect(html).toContain("1안 · 견적 누락");
  });

  it("keeps non-image HTTP links as ordinary links", () => {
    // Given
    const markdown = "[표지 3안 비교 화면](http://127.0.0.1:8765/preview.html)";

    // When
    const html = renderMarkdown(markdown);

    // Then
    expect(html).toContain('href="http://127.0.0.1:8765/preview.html"');
    expect(html).not.toContain("<img");
  });
});

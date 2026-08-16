// @vitest-environment jsdom

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  PluginSlotMount,
  _buildPluginUiUrlForTests,
  _collectRegisterableExportNamesForTests,
  _resetPluginModuleLoader,
  _rewriteBareSpecifiersForTests,
  resolvePluginSlotAnchorHref,
  registerPluginWebComponent,
  type ResolvedPluginSlot,
} from "./slots";
import type { PluginUiContribution } from "@/api/plugins";

let roots: Root[] = [];

afterEach(() => {
  for (const root of roots) {
    flushSync(() => {
      root.unmount();
    });
  }
  roots = [];
  _resetPluginModuleLoader();
});

describe("plugin slot export registration", () => {
  it("loads plugin UI bundles from the configured application base path", () => {
    const contribution = {
      pluginId: "plugin id",
      pluginKey: "paperclip.example",
      displayName: "Example",
      version: "1.0.0",
      updatedAt: "2026-07-27T00:00:00.000Z",
      uiEntryFile: "index.js",
      slots: [],
      launchers: [],
    } satisfies PluginUiContribution;

    expect(_buildPluginUiUrlForTests(contribution, "/af/")).toBe(
      "/af/_plugins/plugin%20id/ui/index.js?v=2026-07-27T00%3A00%3A00.000Z",
    );
  });

  it("keeps raw plugin sidebar links inside the company and application base path", () => {
    expect(resolvePluginSlotAnchorHref("/CMP/agent-chat", "CMP", "/af/")).toBe(
      "/af/CMP/agent-chat",
    );
    expect(resolvePluginSlotAnchorHref("/agent-chat", "CMP", "/af/")).toBe(
      "/af/CMP/agent-chat",
    );
    expect(resolvePluginSlotAnchorHref("/af/CMP/agent-chat", "CMP", "/af/")).toBe(
      "/af/CMP/agent-chat",
    );
    expect(resolvePluginSlotAnchorHref("https://example.com/agent-chat", "CMP", "/af/")).toBe(
      "https://example.com/agent-chat",
    );
  });

  it("maps the Agent Chat community SDK import to the official host UI shim", () => {
    const officialImport = _rewriteBareSpecifiersForTests(
      'import { usePluginData } from "@paperclipai/plugin-sdk/ui";',
    );
    const communityImport = _rewriteBareSpecifiersForTests(
      'import { usePluginData } from "@paperclipai_dld/plugin-sdk/ui";',
    );

    expect(communityImport).toBe(officialImport);
    expect(communityImport).not.toContain(
      'from "@paperclipai_dld/plugin-sdk/ui"',
    );
  });

  it("keeps declared missing exports visible for diagnostics", () => {
    const exports = _collectRegisterableExportNamesForTests(
      { Page: () => null },
      new Set(["Page", "MissingRouteSidebar"]),
    );

    expect([...exports]).toEqual(["Page", "MissingRouteSidebar"]);
  });

  it("registers component-like module exports even when the current contribution did not declare them", () => {
    const exports = _collectRegisterableExportNamesForTests(
      {
        Page: () => null,
        RouteSidebar: () => null,
        webComponentTag: "paperclip-widget",
        metadata: { ignored: true },
        count: 1,
        default: () => null,
      },
      new Set(["Page"]),
    );

    expect(exports).toEqual(new Set(["Page", "RouteSidebar", "webComponentTag"]));
  });

  it("updates an already-mounted placeholder when the slot export registers later", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const slot: ResolvedPluginSlot = {
      type: "routeSidebar",
      id: "content-machine-sidebar",
      displayName: "Content",
      exportName: "ContentMachineRouteSidebar",
      routePath: "content-machine",
      pluginId: "content-machine-plugin",
      pluginKey: "content-machine",
      pluginDisplayName: "Content Machine",
      pluginVersion: "1.0.0",
    };

    flushSync(() => {
      root.render(createElement(PluginSlotMount, {
        slot,
        context: { companyId: "company-1", companyPrefix: "PAP" },
        missingBehavior: "placeholder",
      }));
    });

    expect(container.textContent).toContain("Content Machine: Content");

    flushSync(() => {
      registerPluginWebComponent("content-machine", "ContentMachineRouteSidebar", "paperclip-test-sidebar");
    });

    expect(container.textContent).not.toContain("Content Machine: Content");
    expect(container.querySelector("paperclip-test-sidebar")).not.toBeNull();
  });
});

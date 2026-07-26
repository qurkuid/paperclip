// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  buildElementSelector,
  captureDebugElement,
  isDebugRequestUiElement,
  safeDebugPagePath,
} from "./debug-element-selection";

describe("debug element selection", () => {
  it("builds a stable selector anchored to the nearest id", () => {
    document.body.innerHTML = `
      <main>
        <section id="decision-list">
          <button aria-label="Approve action"><span>Approve</span></button>
        </section>
      </main>
    `;
    const span = document.querySelector("span");
    if (!span) throw new Error("test span missing");

    expect(buildElementSelector(span)).toBe("#decision-list > button:nth-of-type(1) > span:nth-of-type(1)");
  });

  it("captures useful context without collecting form values", () => {
    document.body.innerHTML = `
      <form id="secret-form">
        <input aria-label="API secret" value="never-capture-this-token" />
      </form>
    `;
    const input = document.querySelector("input");
    if (!input) throw new Error("test input missing");
    Object.defineProperty(input, "getBoundingClientRect", {
      value: () => ({ x: 10, y: 20, width: 240, height: 36, top: 20, right: 250, bottom: 56, left: 10 }),
    });

    const context = captureDebugElement(input, "/CMP/company/settings/secrets");

    expect(context.ariaLabel).toBe("API secret");
    expect(JSON.stringify(context)).not.toContain("never-capture-this-token");
    expect(context.rect).toEqual({ x: 10, y: 20, width: 240, height: 36 });
  });

  it("excludes the debug launcher and its descendants", () => {
    document.body.innerHTML = `<div data-debug-request-ui><span id="icon">+</span></div>`;
    const icon = document.querySelector("#icon");
    if (!icon) throw new Error("test icon missing");

    expect(isDebugRequestUiElement(icon)).toBe(true);
  });

  it("keeps query structure without collecting query values", () => {
    expect(
      safeDebugPagePath({
        pathname: "/af/CMP/decisions",
        search: "?filter=pending&token=never-capture-this-token",
      }),
    ).toBe("/af/CMP/decisions?filter&token");
  });
});

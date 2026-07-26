import { describe, expect, it } from "vitest";
import { createDebugRequestSchema } from "./debug-request.js";

describe("createDebugRequestSchema", () => {
  const validInput = {
    request: "이 버튼의 상태와 다음 행동을 더 명확하게 보여 주세요.",
    pageTitle: "Decisions",
    allowPaperclipServerRestart: true,
    element: {
      pagePath: "/CMP/decisions",
      tagName: "button",
      selector: "#decision-list > button:nth-of-type(1)",
      text: "Approve action",
      role: "button",
      ariaLabel: "Approve action",
      rect: { x: 20, y: 40, width: 180, height: 42 },
    },
  };

  it("accepts a bounded element modification request", () => {
    expect(createDebugRequestSchema.parse(validInput)).toEqual(validInput);
  });

  it("rejects external URLs and oversized captured text", () => {
    expect(() =>
      createDebugRequestSchema.parse({
        ...validInput,
        element: {
          ...validInput.element,
          pagePath: "https://evil.example/CMP/decisions",
          text: "x".repeat(501),
        },
      }),
    ).toThrow();
  });

  it("rejects an attempt to disable the scoped restart grant", () => {
    expect(() =>
      createDebugRequestSchema.parse({
        ...validInput,
        allowPaperclipServerRestart: false,
      }),
    ).toThrow();
  });
});

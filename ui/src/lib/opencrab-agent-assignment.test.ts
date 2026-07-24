import { describe, expect, it, vi } from "vitest";
import { assignRecommendedOpenCrabPacks } from "./opencrab-agent-assignment";

const packs = [
  {
    id: "marketing",
    name: "marketing ontology pack",
    description: "content brand strategy",
    version: "1.0.0",
    installed: true,
  },
  {
    id: "social",
    name: "Social Media User Behavior",
    description: "audience behavior",
    version: "1.0.0",
    installed: true,
  },
  {
    id: "legal",
    name: "한국 계약 법률과 세무",
    description: "운영 규정과 tax law",
    version: "1.0.0",
    installed: true,
  },
];

describe("OpenCrab employee pack assignment", () => {
  it("fills missing or stale assignments while preserving valid explicit choices", async () => {
    const updateAgent = vi.fn().mockResolvedValue({});
    const result = await assignRecommendedOpenCrabPacks({
      companyId: "company-1",
      packs,
      agents: [
        {
          id: "content",
          name: "콘텐츠 매니저",
          role: "general",
          status: "active",
          runtimeConfig: {},
        },
        {
          id: "chief",
          name: "Chief of staff",
          role: "ceo",
          status: "active",
          runtimeConfig: {
            openCrab: {
              enabled: true,
              packIds: ["old-local-pack"],
              focusSpaces: [],
            },
          },
        },
        {
          id: "manual",
          name: "브랜드 담당",
          role: "general",
          status: "active",
          runtimeConfig: {
            openCrab: {
              enabled: true,
              packIds: ["social"],
              focusSpaces: ["evidence"],
            },
          },
        },
        {
          id: "former",
          name: "퇴사자",
          role: "general",
          status: "terminated",
          runtimeConfig: {},
        },
      ],
      updateAgent,
    });

    expect(result.updated).toBe(2);
    expect(updateAgent).toHaveBeenCalledWith(
      "content",
      expect.objectContaining({
        runtimeConfig: expect.objectContaining({
          openCrab: expect.objectContaining({
            enabled: true,
            packIds: expect.arrayContaining(["marketing", "social"]),
          }),
        }),
      }),
      "company-1",
    );
    expect(updateAgent).toHaveBeenCalledWith(
      "chief",
      expect.objectContaining({
        runtimeConfig: expect.objectContaining({
          openCrab: expect.objectContaining({ packIds: ["legal"] }),
        }),
      }),
      "company-1",
    );
    expect(updateAgent).not.toHaveBeenCalledWith("manual", expect.anything(), "company-1");
    expect(updateAgent).not.toHaveBeenCalledWith("former", expect.anything(), "company-1");
  });
});

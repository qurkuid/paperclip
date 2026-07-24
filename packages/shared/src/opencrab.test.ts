import { describe, expect, it } from "vitest";
import {
  buildOpenCrabRuntimeMarkdown,
  parseOpenCrabAgentConfig,
  parseOpenCrabPackListResult,
  recommendOpenCrabPackIds,
} from "./opencrab.js";

describe("OpenCrab agent configuration", () => {
  it("keeps safe pack IDs discovered from the official MCP", () => {
    expect(parseOpenCrabAgentConfig({
      enabled: true,
      packIds: [
        "12ff8506-b77a-4c82-a2a8-68b6b3826154",
        "brand-marketing-pack",
        "../../unsafe",
      ],
      focusSpaces: ["resource", "evidence", "unknown_space"],
    })).toEqual({
      enabled: true,
      packIds: [
        "12ff8506-b77a-4c82-a2a8-68b6b3826154",
        "brand-marketing-pack",
      ],
      focusSpaces: ["resource", "evidence"],
      queryPolicy: "task_relevant",
    });
  });

  it("parses official MCP pack metadata from a text content result", () => {
    const packs = parseOpenCrabPackListResult({
      content: [{
        type: "text",
        text: JSON.stringify({
          access_mode: "marketplace_installed_only",
          packs: [
            {
              package_id: "pack-1",
              title: "인테리어 마케팅 팩",
              description: "브랜드와 콘텐츠 운영 지식",
              version: "1.2.0",
            },
            {
              package_id: "pack-2",
              title: "건설 계약 실무",
              description: "계약, 의무, 규정",
              version: "1.0.0",
            },
          ],
        }),
      }],
    });

    expect(packs).toEqual([
      expect.objectContaining({ id: "pack-1", name: "인테리어 마케팅 팩", installed: true }),
      expect.objectContaining({ id: "pack-2", name: "건설 계약 실무", installed: true }),
    ]);
  });

  it("ranks only role-relevant packs from the MCP result", () => {
    const packs = parseOpenCrabPackListResult({
      packs: [
        { id: "marketing", name: "marketing ontology pack", description: "customer marketing" },
        { id: "social", name: "Social Media User Behavior ontology pack", description: "social audience" },
        { id: "brand", name: "brand_top100 ontology pack", description: "brand strategy" },
        { id: "blog", name: "네이버 블로그 작가 팩", description: "content writing" },
        { id: "legal", name: "건설 계약 법률", description: "계약 의무 규정" },
        { id: "marketing-copy", name: "marketing ontology pack", description: "customer marketing" },
        { id: "reflection", name: "유대인식 사고법 고도화 팩", description: "전제 검증 다중관점 실패 학습" },
        { id: "blog", name: "네이버 블로그 작가 팩", description: "작성 규칙과 키워드 검수" },
        { id: "fable", name: "Fable Work Pattern", description: "safety verification judge loops long-horizon coding decomposition structured retrieval" },
        { id: "modeling", name: "Kaggle 3D Modeling Ontology Pack", description: "3D modeling domain structure" },
        { id: "architecture", name: "건축 선형 정적 구조", description: "building engineering" },
        { id: "persona", name: "Korean personas", description: "SaaS ingest personas" },
        { id: "prompting", name: "Official Prompting Guidance", description: "source-grounded prompting guidance" },
        { id: "medical", name: "바이오메디컬", description: "임상 유전자" },
      ],
    });

    expect(recommendOpenCrabPackIds({
      name: "콘텐츠 매니저",
      role: "general",
    }, packs)).toEqual(expect.arrayContaining(["marketing", "social", "brand", "blog"]));
    expect(recommendOpenCrabPackIds({
      name: "Founding Engineer",
      role: "engineer",
    }, packs)).toEqual(expect.arrayContaining(["fable", "modeling", "architecture"]));
    expect(recommendOpenCrabPackIds({
      name: "Founding Engineer",
      role: "engineer",
    }, packs)).not.toContain("persona");
    expect(recommendOpenCrabPackIds({
      name: "Chief of staff",
      role: "ceo",
    }, packs)).toEqual(expect.arrayContaining(["legal"]));
    expect(recommendOpenCrabPackIds({
      name: "Reflection Coach",
      role: "general",
      title: "Reflection Coach",
    }, packs)).toEqual(expect.arrayContaining(["reflection", "fable"]));
    expect(recommendOpenCrabPackIds({
      name: "Summarizer",
      role: "general",
      title: "Summarizer",
    }, packs)).toContain("prompting");
    const marketingSelections = recommendOpenCrabPackIds({
      name: "콘텐츠 매니저",
      role: "general",
    }, packs).filter((id) => id === "marketing" || id === "marketing-copy");
    expect(marketingSelections).toHaveLength(1);
    expect(recommendOpenCrabPackIds({
      name: "콘텐츠 매니저",
      role: "general",
    }, packs)).toContain("blog");
  });

  it("injects only the packs explicitly assigned to the employee", () => {
    const markdown = buildOpenCrabRuntimeMarkdown({
      enabled: true,
      packIds: ["pack-marketing", "pack-interior"],
      focusSpaces: ["resource", "evidence"],
    }, "agent-123");

    expect(markdown).toContain("pack-marketing, pack-interior");
    expect(markdown).toContain("package_ids");
    expect(markdown).toContain("resource, evidence");
    expect(markdown).toContain("agent-123");
    expect(markdown).toContain("reference data");
  });
});

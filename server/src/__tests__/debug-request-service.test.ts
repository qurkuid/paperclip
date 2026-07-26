import { describe, expect, it } from "vitest";
import {
  buildDebugRequestIssueSpec,
  resolveDebugRequestTargets,
} from "../services/debug-requests.js";

const element = {
  pagePath: "/CMP/decisions?filter=pending",
  tagName: "button",
  selector: "#decision-list > button:nth-of-type(1)",
  text: "Approve action",
  role: "button",
  ariaLabel: "Approve action",
  rect: { x: 20, y: 40, width: 180, height: 42 },
};

describe("debug request issue construction", () => {
  it("targets the Paperclip project and Founding Engineer without ambiguity", () => {
    const result = resolveDebugRequestTargets({
      projects: [
        { id: "project-other", name: "Onboarding", primaryWorkspaceId: null },
        { id: "project-paperclip", name: "Paperclip", primaryWorkspaceId: "workspace-paperclip" },
      ],
      agents: [
        { id: "agent-other", name: "QA", status: "idle" },
        { id: "agent-founding", name: "Founding Engineer", status: "idle" },
      ],
    });

    expect(result).toEqual({
      projectId: "project-paperclip",
      projectWorkspaceId: "workspace-paperclip",
      assigneeAgentId: "agent-founding",
    });
  });

  it("creates an implementation task with a narrow Paperclip restart authorization", () => {
    const spec = buildDebugRequestIssueSpec({
      request: "버튼을 눌러도 입력 커서가 이미지로 이동하지 않게 해 주세요.",
      pageTitle: "Decisions",
      element,
    });

    expect(spec.title).toBe("[UI 수정] Approve action");
    expect(spec.description).toContain("버튼을 눌러도 입력 커서가 이미지로 이동하지 않게 해 주세요.");
    expect(spec.description).toContain("#decision-list > button:nth-of-type(1)");
    expect(spec.description).toContain("PM2 앱 `paperclip`만 재시작");
    expect(spec.description).toContain("테스트와 빌드가 통과한 뒤");
    expect(spec.description).toContain("`/api/health`");
    expect(spec.originKind).toBe("ui_debug_request");
  });

  it("fails closed when the required project or agent is missing", () => {
    expect(() =>
      resolveDebugRequestTargets({
        projects: [{ id: "project-other", name: "Onboarding", primaryWorkspaceId: null }],
        agents: [{ id: "agent-other", name: "QA", status: "idle" }],
      }),
    ).toThrow("Paperclip project");
  });
});

import type { CreateDebugRequest } from "@paperclipai/shared";
import { conflict } from "../errors.js";

type TargetProject = {
  id: string;
  name: string;
  primaryWorkspaceId?: string | null;
  primaryWorkspace?: { id: string } | null;
};

type TargetAgent = {
  id: string;
  name: string;
  urlKey?: string;
  status: string;
};

function quoteMarkdown(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function shortElementLabel(input: CreateDebugRequest) {
  return input.element.ariaLabel || input.element.text || input.element.selector || input.element.tagName;
}

export function resolveDebugRequestTargets(input: {
  projects: TargetProject[];
  agents: TargetAgent[];
}) {
  const project = input.projects.find((candidate) => candidate.name.trim().toLowerCase() === "paperclip");
  if (!project) {
    throw conflict("Paperclip project is not configured for this company.");
  }

  const agent = input.agents.find(
    (candidate) =>
      (candidate.name.trim().toLowerCase() === "paperclip 개발자" ||
        candidate.urlKey === "paperclip") &&
      candidate.status !== "terminated" &&
      candidate.status !== "paused",
  );
  if (!agent) {
    throw conflict("Paperclip developer agent is not available for this company.");
  }

  return {
    projectId: project.id,
    projectWorkspaceId: project.primaryWorkspaceId ?? project.primaryWorkspace?.id ?? null,
    assigneeAgentId: agent.id,
  };
}

export function buildDebugRequestIssueSpec(input: CreateDebugRequest) {
  const elementLabel = shortElementLabel(input).replace(/\s+/g, " ").trim().slice(0, 80);
  const title = `[UI 수정] ${elementLabel || input.element.tagName}`.slice(0, 120);
  const description = [
    "## 화면에서 선택한 수정 요청",
    "",
    `- 화면: ${input.pageTitle}`,
    `- 경로: \`${input.element.pagePath}\``,
    `- 요소: \`${input.element.tagName}\``,
    `- 선택자: \`${input.element.selector.replaceAll("`", "\\`")}\``,
    `- 접근성 이름: ${input.element.ariaLabel ?? "없음"}`,
    `- 역할: ${input.element.role ?? "없음"}`,
    `- 위치: x ${input.element.rect.x}, y ${input.element.rect.y}, ${input.element.rect.width} × ${input.element.rect.height}`,
    "",
    "### 요청사항",
    quoteMarkdown(input.request),
    "",
    "### 선택 요소에서 보인 텍스트",
    quoteMarkdown(input.element.text || "(텍스트 없음)"),
    "",
    "### 실행 범위와 권한",
    "- Paperclip 코드 저장소 안에서 원인을 확인하고 가장 작은 수정으로 해결합니다.",
    "- 관련 테스트와 타입 검사를 실행하고, 테스트와 빌드가 통과한 뒤 배포합니다.",
    "- 이 작업은 배포에 필요한 경우 PM2 앱 `paperclip`만 재시작할 권한을 포함합니다.",
    "- 다른 앱·서비스·데이터베이스는 재시작하거나 변경하지 않습니다.",
    "- 재시작 후 `/api/health`와 선택한 화면을 다시 확인하고 결과를 이 작업에 기록합니다.",
    "",
    "<!-- paperclip-debug-request:v1 allowPaperclipServerRestart=true service=paperclip -->",
  ].join("\n");

  return {
    title,
    description,
    originKind: "ui_debug_request" as const,
    originId: input.element.pagePath,
  };
}

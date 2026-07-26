import type {
  Issue,
  PluginContext,
} from "@paperclipai/plugin-sdk";
import { z } from "zod";

import { PLUGIN_ID } from "./manifest.js";

const resolveIssueInputSchema = z.object({
  companyId: z.string().uuid(),
  experimentId: z.string().uuid(),
  experimentTitle: z.string().trim().min(1).max(120),
  existingIssueId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
}).strict();

const publishStrategyInputSchema = z.object({
  companyId: z.string().uuid(),
  experimentId: z.string().uuid(),
  experimentTitle: z.string().trim().min(1).max(120),
  issueId: z.string().uuid(),
  proposal: z.string().trim().min(1).max(4000),
  evidenceMarkdown: z.string().trim().min(1).max(8000),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]+$/u).min(1).max(120),
  authorAgentId: z.string().uuid().nullable(),
}).strict();

const requestStrategyReviewInputSchema = z.object({
  companyId: z.string().uuid(),
  experimentId: z.string().uuid(),
  experimentTitle: z.string().trim().min(1).max(120),
  issueId: z.string().uuid(),
  responsibleAgentId: z.string().uuid(),
  request: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]+$/u).min(1).max(120),
}).strict();

const unsafeContactPattern =
  /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|01[016789][-\s]?\d{3,4}[-\s]?\d{4})/iu;

export type ResolveExperimentIssueInput = Readonly<
  z.infer<typeof resolveIssueInputSchema>
>;
export type PublishExperimentStrategyInput = Readonly<
  z.infer<typeof publishStrategyInputSchema>
>;
export type RequestExperimentStrategyReviewInput = Readonly<
  z.infer<typeof requestStrategyReviewInputSchema>
>;

export type RequestedExperimentStrategyReview = {
  readonly issueId: string;
  readonly commentId: string;
  readonly queued: boolean;
  readonly runId: string | null;
};

export type PublishedExperimentStrategy = {
  readonly issueId: string;
  readonly commentId: string;
  readonly documentId: string;
  readonly documentKey: string;
  readonly interaction: Awaited<
    ReturnType<PluginContext["issues"]["requestConfirmation"]>
  >;
};

export type ExperimentIssueIntegration = {
  readonly resolveIssue: (
    input: ResolveExperimentIssueInput,
  ) => Promise<Issue>;
  readonly requestStrategyReview: (
    input: RequestExperimentStrategyReviewInput,
  ) => Promise<RequestedExperimentStrategyReview>;
  readonly publishStrategy: (
    input: PublishExperimentStrategyInput,
  ) => Promise<PublishedExperimentStrategy>;
};

export type ExperimentIssueIntegrationErrorCode =
  | "issue_company_mismatch"
  | "issue_document_invalid"
  | "unsafe_strategy_content";

export class ExperimentIssueIntegrationError extends Error {
  constructor(
    readonly code: ExperimentIssueIntegrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExperimentIssueIntegrationError";
  }
}

function requireCompanyIssue(
  issue: Issue | null,
  companyId: string,
): Issue {
  if (issue === null || issue.companyId !== companyId) {
    throw new ExperimentIssueIntegrationError(
      "issue_company_mismatch",
      "Linked issue is not available in this company",
    );
  }
  return issue;
}

function strategyDocumentBody(
  input: PublishExperimentStrategyInput,
): string {
  return [
    `# 전략 제안: ${input.experimentTitle}`,
    "",
    "> 이 문서는 검토용 산출물입니다. 실험 운영 페이지의 구조화 데이터가 기준입니다.",
    "",
    "## 제안",
    "",
    input.proposal,
    "",
    "## 근거",
    "",
    input.evidenceMarkdown,
    "",
    "## 승인 후 처리",
    "",
    "승인은 제안에 대한 의사결정만 기록합니다. 실험 설계·상태·결과는 보드 사용자가 실험 운영 페이지에서 별도로 변경해야 합니다.",
  ].join("\n");
}

function strategyMarker(idempotencyKey: string): string {
  return `<!-- spacebogam-strategy:${idempotencyKey} -->`;
}

function strategyRequestMarker(idempotencyKey: string): string {
  return `<!-- spacebogam-strategy-request:${idempotencyKey} -->`;
}

function strategyRequestBody(
  input: RequestExperimentStrategyReviewInput,
  marker: string,
): string {
  return [
    marker,
    "## 실험 전략 검토 요청",
    "",
    `- 실험: ${input.experimentTitle}`,
    `- 실험 ID: \`${input.experimentId}\``,
    "",
    "### 요청",
    "",
    input.request,
    "",
    "### 작업 기준",
    "",
    "1. 공간보감 실험 overview/get 도구로 구조화된 실험 상태와 표본을 확인합니다.",
    "2. 같은 기간의 INTM 퍼널과 네이버 광고 근거를 확인합니다.",
    "3. 표본이 부족하면 추측하지 말고 필요한 계측·승인 항목을 구분합니다.",
    "4. 개인정보를 포함하지 않고 propose_strategy 도구로 검토안을 제출합니다.",
    "5. 광고·콘텐츠·실험 상태를 직접 변경하지 않습니다.",
  ].join("\n");
}

function strategyRequestDescription(
  input: RequestExperimentStrategyReviewInput,
): string {
  return [
    "실험 운영 페이지에서 설계, 표본, 결과와 전략 제안을 관리합니다.",
    "",
    "## 현재 작업",
    "",
    strategyRequestBody(input, strategyRequestMarker(input.idempotencyKey)),
    "",
    "제안 결과는 이 이슈의 전략 문서와 의사결정 요청으로 남겨야 합니다.",
  ].join("\n");
}

export function createExperimentIssueIntegration(
  ctx: PluginContext,
): ExperimentIssueIntegration {
  async function resolveIssue(
    rawInput: ResolveExperimentIssueInput,
  ): Promise<Issue> {
    const input = resolveIssueInputSchema.parse(rawInput);
    if (input.existingIssueId !== null) {
      return requireCompanyIssue(
        await ctx.issues.get(input.existingIssueId, input.companyId),
        input.companyId,
      );
    }

    const originKind = `plugin:${PLUGIN_ID}:experiment` as const;
    const originId = `experiment:${input.experimentId}`;
    const existing = await ctx.issues.list({
      companyId: input.companyId,
      originKind,
      originId,
      limit: 1,
    });
    if (existing[0] !== undefined) {
      return requireCompanyIssue(existing[0], input.companyId);
    }

    return ctx.issues.create({
      companyId: input.companyId,
      ...(input.projectId === null ? {} : { projectId: input.projectId }),
      title: `실험: ${input.experimentTitle}`,
      description: "실험 운영 페이지에서 설계, 표본, 결과와 전략 제안을 관리합니다.",
      priority: "medium",
      originKind,
      originId,
    });
  }

  async function requestStrategyReview(
    rawInput: RequestExperimentStrategyReviewInput,
  ): Promise<RequestedExperimentStrategyReview> {
    const input = requestStrategyReviewInputSchema.parse(rawInput);
    if (unsafeContactPattern.test(input.request)) {
      throw new ExperimentIssueIntegrationError(
        "unsafe_strategy_content",
        "Strategy requests cannot contain contact identifiers",
      );
    }
    const issue = requireCompanyIssue(
      await ctx.issues.get(input.issueId, input.companyId),
      input.companyId,
    );

    const marker = strategyRequestMarker(input.idempotencyKey);
    const comments = await ctx.issues.listComments(
      input.issueId,
      input.companyId,
    );
    const duplicateComment = comments.find((comment) =>
      comment.body.includes(marker));

    await ctx.issues.update(
      input.issueId,
      {
        status: issue.status === "in_progress" ? "in_progress" : "todo",
        assigneeAgentId: input.responsibleAgentId,
        description: strategyRequestDescription(input),
      },
      input.companyId,
    );
    const comment = duplicateComment ?? await ctx.issues.createComment(
      input.issueId,
      strategyRequestBody(input, marker),
      input.companyId,
    );
    const wakeup = await ctx.issues.requestWakeup(
      input.issueId,
      input.companyId,
      {
        reason: "spacebogam_strategy_review_requested",
        contextSource: `plugin:${PLUGIN_ID}:strategy-request`,
        idempotencyKey: `spacebogam-strategy-request:${input.idempotencyKey}`,
      },
    );

    return {
      issueId: input.issueId,
      commentId: comment.id,
      queued: wakeup.queued,
      runId: wakeup.runId,
    };
  }

  async function publishStrategy(
    rawInput: PublishExperimentStrategyInput,
  ): Promise<PublishedExperimentStrategy> {
    const input = publishStrategyInputSchema.parse(rawInput);
    if (
      unsafeContactPattern.test(input.proposal)
      || unsafeContactPattern.test(input.evidenceMarkdown)
    ) {
      throw new ExperimentIssueIntegrationError(
        "unsafe_strategy_content",
        "Strategy artifacts cannot contain contact identifiers",
      );
    }
    requireCompanyIssue(
      await ctx.issues.get(input.issueId, input.companyId),
      input.companyId,
    );

    const marker = strategyMarker(input.idempotencyKey);
    const documentKey = `spacebogam-strategy-${input.experimentId}`;
    const comments = await ctx.issues.listComments(
      input.issueId,
      input.companyId,
    );
    const duplicateComment = comments.find((comment) =>
      comment.body.includes(marker));
    const body = strategyDocumentBody(input);
    const document = duplicateComment === undefined
      ? await ctx.issues.documents.upsert({
          issueId: input.issueId,
          companyId: input.companyId,
          key: documentKey,
          title: `전략 제안: ${input.experimentTitle}`,
          body,
          format: "markdown",
          changeSummary: "공간보감 실험 전략 제안",
        })
      : await ctx.issues.documents.get(
          input.issueId,
          documentKey,
          input.companyId,
        );
    if (document === null || document.latestRevisionId === null) {
      throw new ExperimentIssueIntegrationError(
        "issue_document_invalid",
        "Strategy review document is unavailable",
      );
    }

    const comment = duplicateComment ?? await ctx.issues.createComment(
      input.issueId,
      [
        marker,
        `전략 제안 문서가 준비되었습니다: [내용 보기](#document-${documentKey})`,
        "",
        input.proposal,
      ].join("\n"),
      input.companyId,
      input.authorAgentId === null
        ? undefined
        : { authorAgentId: input.authorAgentId },
    );
    const interaction = await ctx.issues.requestConfirmation(
      input.issueId,
      {
        idempotencyKey: `spacebogam-strategy:${input.idempotencyKey}`,
        title: `전략 승인: ${input.experimentTitle}`,
        summary: input.proposal,
        continuationPolicy: "wake_assignee_on_accept",
        payload: {
          version: 1,
          prompt: "이 전략 제안을 다음 실험 설계의 근거로 승인할까요?",
          acceptLabel: "전략 승인",
          rejectLabel: "수정 요청",
          rejectRequiresReason: true,
          rejectReasonLabel: "수정할 내용을 알려주세요",
          allowDeclineReason: true,
          detailsMarkdown: body,
          target: {
            type: "issue_document",
            issueId: input.issueId,
            documentId: document.id,
            key: documentKey,
            revisionId: document.latestRevisionId,
            revisionNumber: document.latestRevisionNumber,
            label: "전략 제안 전체 내용",
          },
        },
      },
      input.companyId,
      input.authorAgentId === null
        ? undefined
        : { authorAgentId: input.authorAgentId },
    );

    return {
      issueId: input.issueId,
      commentId: comment.id,
      documentId: document.id,
      documentKey,
      interaction,
    };
  }

  return { resolveIssue, requestStrategyReview, publishStrategy };
}

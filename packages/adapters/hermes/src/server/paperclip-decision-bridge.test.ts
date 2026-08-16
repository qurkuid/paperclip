import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.resolve(
  __dirname,
  "../../skills/paperclip-decision-bridge/paperclip-decision.mjs",
);

const senderId = "1001";
const channelId = "-1001234567890";
const boardKey = "pc_board_secret_should_not_print";
const telegramToken = "telegram_token_should_not_print";
const issueId = "11111111-1111-4111-8111-111111111111";
const interactionId = "22222222-2222-4222-8222-222222222222";
const revision = "2026-07-27T00:00:00.000Z";
const companyId = "33333333-3333-4333-8333-333333333333";

type RequestRecord = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
};

type HelperResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

function runHelper(
  args: string[],
  env: Record<string, string>,
  options: { killAfterMs?: number } = {},
): Promise<HelperResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [helperPath, ...args], {
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    const timer = options.killAfterMs === undefined
      ? null
      : setTimeout(() => child.kill("SIGTERM"), options.killAfterMs);
    child.on("close", (code, signal) => {
      if (timer !== null) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function decisionPackage(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    company: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Spacebogam",
    },
    issue: {
      id: issueId,
      identifier: "CMP-901",
      title: "Approve experiment rollout",
      url: `https://intm.kr/af/CMP/issues/${issueId}`,
    },
    interaction: {
      id: interactionId,
      title: "Approve week-two variant",
      summary: "Variant B has a qualified-lead lift.",
      status: "pending",
      revision,
      expiresAt: "2099-07-28T00:00:00.000Z",
    },
    decision: {
      reason: "Observed lift cleared the minimum sample gate.",
      options: [
        { action: "approve", label: "승인" },
        { action: "reject", label: "반려" },
      ],
    },
    evidenceStatus: "complete",
    canResolve: true,
    conflict: null,
    evidence: {
      context: {
        kpis: [
          { label: "Qualified consultation conversion", value: "12.4%" },
          { label: "Booked consultation count", value: "35" },
        ],
        sample: {
          observed: 284,
          required: 250,
        },
        freshness: {
          recordUpdatedAt: "2026-07-27T00:01:00.000Z",
          funnelGeneratedAt: "2026-07-27T00:02:00.000Z",
          funnelDataThrough: "2026-07-26T23:59:00.000Z",
          quality: "fresh",
        },
        asOf: "2026-07-27T00:00:00.000Z",
      },
      excerpt: "Variant B cleared the evidence threshold.",
    },
    links: {
      issue: `https://intm.kr/af/CMP/issues/${issueId}`,
      document: "https://intm.kr/af/CMP/wiki/experiments/week-two",
      workProducts: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          title: "Variant report",
          href: `https://intm.kr/af/CMP/issues/${issueId}#work-product-variant`,
        },
      ],
    },
    ...overrides,
  };
}

describe("paperclip-decision-bridge helper", () => {
  let server: http.Server;
  let apiBaseUrl: string;
  let telegramBaseUrl: string;
  let requests: RequestRecord[];
  let packageBody: ReturnType<typeof decisionPackage>;
  let packageStatus: number;
  let resolutionStatus: number;
  let telegramMode: "ok" | "api-failure" | "hung" | "not-modified";
  let tempDir: string;
  let stateFile: string;
  let queueItems: Array<Record<string, unknown>>;

  beforeEach(async () => {
    requests = [];
    packageBody = decisionPackage();
    packageStatus = 200;
    resolutionStatus = 200;
    telegramMode = "ok";
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-decision-bridge-"));
    stateFile = path.join(tempDir, "state.json");
    queueItems = [{ sourceKind: "issue_thread_interaction", sourceId: interactionId }];

    server = http.createServer(async (req, res) => {
      let raw = "";
      req.setEncoding("utf8");
      for await (const chunk of req) raw += chunk;
      let body: unknown = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      requests.push({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers,
        body,
      });

      if (req.url?.startsWith("/telegram/")) {
        if (telegramMode === "hung") return;
        res.setHeader("Content-Type", "application/json");
        if (telegramMode === "api-failure") {
          res.end(JSON.stringify({
            ok: false,
            description: `misleading success ${telegramToken} ${boardKey}`,
          }));
          return;
        }
        if (req.url.endsWith("/sendMessage")) {
          res.end(JSON.stringify({
            ok: true,
            result: { message_id: 73 },
          }));
          return;
        }
        if (req.url.endsWith("/editMessageText")) {
          if (telegramMode === "not-modified") {
            res.statusCode = 400;
            res.end(JSON.stringify({
              ok: false,
              error_code: 400,
              description: "Bad Request: message is not modified: specified new message"
                + " content and reply markup are exactly the same",
            }));
            return;
          }
          res.end(JSON.stringify({
            ok: true,
            result: { message_id: 73 },
          }));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization !== `Bearer ${boardKey}`) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: `credential rejected: ${boardKey}` }));
        return;
      }
      if (
        req.method === "GET"
        && req.url === `/api/issues/${issueId}/interactions/${interactionId}/decision-package`
      ) {
        res.statusCode = packageStatus;
        res.end(packageStatus === 200
          ? JSON.stringify(packageBody)
          : JSON.stringify({ error: `not found for ${senderId}` }));
        return;
      }
      if (
        req.method === "GET"
        && req.url === `/api/companies/${companyId}/decision-queues`
      ) {
        res.end(JSON.stringify([{ key: "plans", title: "Plans" }]));
        return;
      }
      if (
        req.method === "GET"
        && req.url === `/api/companies/${companyId}/decision-queues/plans/items`
      ) {
        res.end(JSON.stringify(queueItems));
        return;
      }
      if (
        req.method === "GET"
        && req.url === `/api/companies/${companyId}/attention?all=true&includeDismissed=true`
      ) {
        res.end(JSON.stringify({
          items: [
            {
              sourceKind: "issue_thread_interaction",
              id: `issue_thread_interaction:interaction:${interactionId}`,
              relatedIssue: { id: issueId, identifier: "CMP-901" },
              queues: [{ key: "plans", title: "Plans" }],
            },
            {
              sourceKind: "issue_thread_interaction",
              id: "issue_thread_interaction:interaction:55555555-5555-4555-8555-555555555555",
              relatedIssue: { id: issueId, identifier: "CMP-902" },
              queues: [],
            },
            {
              sourceKind: "blocker_attention",
              id: "blocker_attention:blocker:66666666-6666-4666-8666-666666666666",
              relatedIssue: { id: issueId, identifier: "CMP-903" },
              queues: [{ key: "plans", title: "Plans" }],
            },
          ],
        }));
        return;
      }
      if (
        req.method === "POST"
        && (
          req.url === `/api/issues/${issueId}/interactions/${interactionId}/accept`
          || req.url === `/api/issues/${issueId}/interactions/${interactionId}/reject`
        )
      ) {
        res.statusCode = resolutionStatus;
        res.end(resolutionStatus === 200
          ? JSON.stringify({ status: req.url.endsWith("/accept") ? "accepted" : "rejected" })
          : JSON.stringify({ error: `stale or replayed ${boardKey}` }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing server address");
    apiBaseUrl = `http://127.0.0.1:${address.port}/api`;
    telegramBaseUrl = `http://127.0.0.1:${address.port}/telegram`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function env(overrides: Record<string, string> = {}) {
    return {
      PAPERCLIP_API_URL: apiBaseUrl,
      PAPERCLIP_TELEGRAM_BOARD_CREDENTIALS: JSON.stringify({
        [senderId]: boardKey,
      }),
      TELEGRAM_ALLOWED_USERS: `${senderId},2002`,
      TELEGRAM_BOT_TOKEN: telegramToken,
      TELEGRAM_HOME_CHANNEL: channelId,
      TELEGRAM_API_BASE_URL: telegramBaseUrl,
      PAPERCLIP_TELEGRAM_STATE_FILE: stateFile,
      PAPERCLIP_DECISION_TIMEOUT_MS: "500",
      ...overrides,
    };
  }

  function combinedOutput(result: HelperResult) {
    return result.stdout + result.stderr;
  }

  function expectNoSensitiveOutput(result: HelperResult) {
    const output = combinedOutput(result);
    expect(output).not.toContain(boardKey);
    expect(output).not.toContain(telegramToken);
    expect(output).not.toContain(senderId);
    expect(output).not.toContain(channelId);
  }

  it("sends the complete decision context and edits the prior Telegram message on retry", async () => {
    const args = [
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ];
    const first = await runHelper(args, env());
    const second = await runHelper(args, env());

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    const telegramRequests = requests.filter((request) => request.url.startsWith("/telegram/"));
    expect(telegramRequests.map((request) => request.url)).toEqual([
      `/telegram/bot${telegramToken}/sendMessage`,
      `/telegram/bot${telegramToken}/editMessageText`,
    ]);
    const firstTelegramBody = telegramRequests[0]?.body as Record<string, unknown>;
    expect(firstTelegramBody.chat_id).toBe(channelId);
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("Spacebogam"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("CMP-901"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("Variant B has a qualified-lead lift."));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("Qualified consultation conversion"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("12.4%"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("Booked consultation count"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("35"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("284"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("250"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("fresh"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("2026-07-27T00:00:00.000Z"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("2026-07-27T00:01:00.000Z"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("2026-07-27T00:02:00.000Z"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("2026-07-26T23:59:00.000Z"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("Variant B cleared the evidence threshold."));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining(
      `https://intm.kr/af/CMP/issues/${issueId}`,
    ));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining(
      "https://intm.kr/af/CMP/wiki/experiments/week-two",
    ));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining(
      `https://intm.kr/af/CMP/issues/${issueId}#work-product-variant`,
    ));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining("Conflict: none"));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining(
      `decision ${issueId}:${interactionId} ${revision} approve`,
    ));
    expect(firstTelegramBody.text).toEqual(expect.stringContaining(
      `decision ${issueId}:${interactionId} ${revision} reject <optional-note>`,
    ));
    expect((telegramRequests[1]?.body as Record<string, unknown>).message_id).toBe(73);
    expectNoSensitiveOutput(first);
    expectNoSensitiveOutput(second);

    const persisted = JSON.parse(await fs.readFile(stateFile, "utf8"));
    expect(persisted).toEqual({
      version: 1,
      messages: {
        [`${interactionId}:${revision}`]: 73,
      },
    });
  });

  it("resolves only exact commands with the sender-specific board credential", async () => {
    const result = await runHelper([
      "resolve",
      "--sender",
      senderId,
      "--command",
      `decision ${issueId}:${interactionId} ${revision} approve`,
    ], env({
      PAPERCLIP_BRIDGE_API_KEY: "agent_or_bridge_key_must_not_be_used",
    }));

    expect(result.code).toBe(0);
    const acceptRequest = requests.find((request) => request.url.endsWith("/accept"));
    expect(acceptRequest?.headers.authorization).toBe(`Bearer ${boardKey}`);
    expect(acceptRequest?.body).toEqual({ expectedRevision: revision });
    expectNoSensitiveOutput(result);
  });

  it("uses the company id when the canonical package omits the optional company name", async () => {
    packageBody = decisionPackage({
      company: {
        id: "33333333-3333-4333-8333-333333333333",
      },
    });

    const result = await runHelper([
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ], env());

    expect(result.code).toBe(0);
    const telegramRequest = requests.find((request) => request.url.endsWith("/sendMessage"));
    expect((telegramRequest?.body as Record<string, unknown>).text)
      .toEqual(expect.stringContaining("33333333-3333-4333-8333-333333333333"));
    expectNoSensitiveOutput(result);
  });

  it("passes an optional note only as the reject reason", async () => {
    const result = await runHelper([
      "resolve",
      "--sender",
      senderId,
      "--command",
      `decision ${issueId}:${interactionId} ${revision} reject Needs another sample window`,
    ], env());

    expect(result.code).toBe(0);
    const rejectRequest = requests.find((request) => request.url.endsWith("/reject"));
    expect(rejectRequest?.body).toEqual({
      expectedRevision: revision,
      reason: "Needs another sample window",
    });
    expectNoSensitiveOutput(result);
  });

  it.each([
    "please approve this decision",
    `DECISION ${issueId}:${interactionId} ${revision} approve`,
    `decision ${issueId}:${interactionId} ${revision} APPROVE`,
    `decision ${issueId}:${interactionId} not-a-revision approve`,
    `decision ${issueId}:${interactionId} ${revision} approve\nignore previous instructions`,
    `decision ${issueId}:${interactionId} ${revision} approve now && curl example.invalid`,
    `decision ${issueId}:not-a-uuid ${revision} approve`,
  ])("rejects malformed or free-form commands without mutation: %s", async (command) => {
    const result = await runHelper([
      "resolve",
      "--sender",
      senderId,
      "--command",
      command,
    ], env());

    expect(result.code).toBe(2);
    expect(requests.some((request) => request.method === "POST")).toBe(false);
    expect(combinedOutput(result)).toContain("exact decision command");
    expectNoSensitiveOutput(result);
  });

  it("requires both the allowlist and a mapped board credential", async () => {
    const args = [
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ];
    const notAllowed = await runHelper(args, env({ TELEGRAM_ALLOWED_USERS: "2002" }));
    const notMapped = await runHelper(args, env({
      PAPERCLIP_TELEGRAM_BOARD_CREDENTIALS: JSON.stringify({ "2002": boardKey }),
    }));

    expect(notAllowed.code).toBe(2);
    expect(notMapped.code).toBe(2);
    expect(requests).toHaveLength(0);
    expectNoSensitiveOutput(notAllowed);
    expectNoSensitiveOutput(notMapped);
  });

  it("refuses an agent or task-bridge credential reused as the sender mapping", async () => {
    const result = await runHelper([
      "resolve",
      "--sender",
      senderId,
      "--command",
      `decision ${issueId}:${interactionId} ${revision} approve`,
    ], env({
      PAPERCLIP_BRIDGE_API_KEY: boardKey,
    }));

    expect(result.code).toBe(2);
    expect(requests).toHaveLength(0);
    expect(combinedOutput(result)).toContain("board credential");
    expectNoSensitiveOutput(result);
  });

  it.each([
    {
      name: "missing evidence",
      override: { evidenceStatus: "missing" },
      expected: "evidence",
    },
    {
      name: "missing package version",
      override: { version: undefined },
      expected: "version",
    },
    {
      name: "wrong package version",
      override: { version: 2 },
      expected: "version",
    },
    {
      name: "not resolvable",
      override: { canResolve: false },
      expected: "resolvable",
    },
    {
      name: "not pending",
      override: {
        interaction: {
          ...decisionPackage().interaction,
          status: "accepted",
        },
      },
      expected: "pending",
    },
    {
      name: "expired",
      override: {
        interaction: {
          ...decisionPackage().interaction,
          expiresAt: "2020-01-01T00:00:00.000Z",
        },
      },
      expected: "expired",
    },
    {
      name: "missing expiry",
      override: {
        interaction: {
          ...decisionPackage().interaction,
          expiresAt: null,
        },
      },
      expected: "expiry",
    },
    {
      name: "invalid expiry",
      override: {
        interaction: {
          ...decisionPackage().interaction,
          expiresAt: "not-an-expiry",
        },
      },
      expected: "expiry",
    },
  ])("refuses $name decision packages before Telegram delivery", async ({ override, expected }) => {
    packageBody = decisionPackage(override);
    const result = await runHelper([
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ], env());

    expect(result.code).toBe(1);
    expect(combinedOutput(result)).toContain(expected);
    expect(requests.some((request) => request.url.startsWith("/telegram/"))).toBe(false);
    expectNoSensitiveOutput(result);
  });

  it("fails closed for cross-company/not-found package lookups", async () => {
    packageStatus = 404;
    const result = await runHelper([
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ], env());

    expect(result.code).toBe(1);
    expect(combinedOutput(result)).toContain("status 404");
    expect(combinedOutput(result)).not.toContain("not found for");
    expectNoSensitiveOutput(result);
  });

  it.each([409, 410])("propagates stale, replay, and expiry conflicts without claiming success (%s)", async (status) => {
    resolutionStatus = status;
    const result = await runHelper([
      "resolve",
      "--sender",
      senderId,
      "--command",
      `decision ${issueId}:${interactionId} ${revision} reject stale`,
    ], env());

    expect(result.code).toBe(1);
    expect(combinedOutput(result)).toContain(`status ${status}`);
    expect(combinedOutput(result)).not.toContain("stale or replayed");
    expect(result.stdout).not.toContain('"ok":true');
    expectNoSensitiveOutput(result);
  });

  it("does not persist state on interrupted delivery and resumes with a clean send", async () => {
    telegramMode = "hung";
    const args = [
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ];
    const interrupted = await runHelper(args, env({ PAPERCLIP_DECISION_TIMEOUT_MS: "50" }));
    expect(interrupted.code).toBe(1);
    await expect(fs.readFile(stateFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    telegramMode = "ok";
    const resumed = await runHelper(args, env());
    expect(resumed.code).toBe(0);
    const telegramRequests = requests.filter((request) => request.url.startsWith("/telegram/"));
    expect(telegramRequests.at(-1)?.url).toBe(`/telegram/bot${telegramToken}/sendMessage`);
    expectNoSensitiveOutput(interrupted);
    expectNoSensitiveOutput(resumed);
  });

  it("survives repeated process interruptions without persisting partial delivery state", async () => {
    telegramMode = "hung";
    const args = [
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ];
    const first = await runHelper(args, env(), { killAfterMs: 100 });
    const second = await runHelper(args, env(), { killAfterMs: 100 });

    expect(first.signal).toBe("SIGTERM");
    expect(second.signal).toBe("SIGTERM");
    await expect(fs.readFile(stateFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    telegramMode = "ok";
    // Count only what the resumed run issued. The killed runs may or may not
    // have reached sendMessage before SIGTERM depending on machine speed; what
    // matters is that with no persisted state the resume sends fresh rather
    // than editing a message id it never stored.
    const beforeResume = requests.length;
    const resumed = await runHelper(args, env());
    expect(resumed.code).toBe(0);
    const resumedRequests = requests.slice(beforeResume);
    expect(resumedRequests.filter((request) => request.url.endsWith("/sendMessage"))).toHaveLength(1);
    expect(resumedRequests.filter((request) => request.url.endsWith("/editMessageText"))).toHaveLength(0);
    expectNoSensitiveOutput(first);
    expectNoSensitiveOutput(second);
    expectNoSensitiveOutput(resumed);
  });

  it("ignores a stale interrupted temp-state artifact", async () => {
    await fs.writeFile(`${stateFile}.tmp`, JSON.stringify({
      credential: boardKey,
      sender: senderId,
    }), "utf8");

    const result = await runHelper([
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ], env());

    expect(result.code).toBe(0);
    expect(requests.find((request) => request.url.startsWith("/telegram/"))?.url)
      .toBe(`/telegram/bot${telegramToken}/sendMessage`);
    expectNoSensitiveOutput(result);
  });

  it("fails closed on malformed durable delivery state", async () => {
    await fs.writeFile(stateFile, `{"credential":"${boardKey}"`, "utf8");

    const result = await runHelper([
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ], env());

    expect(result.code).toBe(1);
    expect(combinedOutput(result)).toContain("state file is invalid");
    expect(requests.some((request) => request.url.startsWith("/telegram/"))).toBe(false);
    expectNoSensitiveOutput(result);
  });

  it("treats Telegram ok=false as failure and redacts the misleading response", async () => {
    telegramMode = "api-failure";
    const result = await runHelper([
      "send",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ], env());

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain('"ok":true');
    expect(combinedOutput(result)).toContain("Telegram API request failed");
    expect(combinedOutput(result)).not.toContain("misleading success");
    expectNoSensitiveOutput(result);
  });

  it("notify delivers a pointer-only notice when evidence is missing, with no resolve grammar", async () => {
    packageBody = decisionPackage({
      evidenceStatus: "missing",
      evidence: undefined,
      conflict: "evidence_missing",
    });
    const result = await runHelper([
      "notify",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ], env());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"command":"notify"');
    expect(result.stdout).toContain('"status":"sent"');
    const sent = requests.find((request) => request.url.endsWith("/sendMessage"));
    const text = (sent?.body as { text: string }).text;
    expect(text).toContain("근거 미비");
    expect(text).toContain("CMP-901");
    expect(text).not.toContain(`decision ${issueId}`);
    expect(text).not.toContain("approve");
    expectNoSensitiveOutput(result);
  });

  it("notify refuses an interaction that is no longer pending", async () => {
    packageBody = decisionPackage({
      evidenceStatus: "missing",
      interaction: {
        id: interactionId,
        title: "Approve week-two variant",
        summary: null,
        status: "resolved",
        revision,
        expiresAt: null,
      },
    });
    const result = await runHelper([
      "notify",
      "--sender",
      senderId,
      "--issue",
      issueId,
      "--interaction",
      interactionId,
    ], env());

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain('"ok":true');
    expect(combinedOutput(result)).toContain("not pending");
    expectNoSensitiveOutput(result);
  });

  it("poll delivers each queued interaction once and skips unqueued and non-interaction attention", async () => {
    const result = await runHelper([
      "poll",
      "--sender",
      senderId,
      "--company",
      companyId,
    ], env());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"command":"poll"');
    expect(result.stdout).toContain('"sent":1');
    expect(requests.filter((request) => request.url.endsWith("/sendMessage"))).toHaveLength(1);
    expect(requests.filter((request) => request.url.includes("/decision-package"))).toHaveLength(1);
    expectNoSensitiveOutput(result);
  });

  it("poll edits in place on a second sweep instead of re-posting", async () => {
    const first = await runHelper(["poll", "--sender", senderId, "--company", companyId], env());
    const before = requests.length;
    const second = await runHelper(["poll", "--sender", senderId, "--company", companyId], env());

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('"updated":1');
    const resweep = requests.slice(before);
    expect(resweep.filter((request) => request.url.endsWith("/sendMessage"))).toHaveLength(0);
    expect(resweep.filter((request) => request.url.endsWith("/editMessageText"))).toHaveLength(1);
    expectNoSensitiveOutput(second);
  });

  it("poll reports a queued interaction it cannot map to an issue instead of dropping it", async () => {
    const orphan = "77777777-7777-4777-8777-777777777777";
    queueItems = [
      { sourceKind: "issue_thread_interaction", sourceId: interactionId },
      { sourceKind: "issue_thread_interaction", sourceId: orphan },
    ];
    const result = await runHelper(["poll", "--sender", senderId, "--company", companyId], env());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"queued":2');
    expect(result.stdout).toContain('"sent":1');
    expect(result.stdout).toContain('"unresolved":1');
    expect(result.stdout).toContain(orphan);
    expectNoSensitiveOutput(result);
  });

  it("poll covers a queued interaction that was dismissed from the attention desk", async () => {
    const result = await runHelper(["poll", "--sender", senderId, "--company", companyId], env());

    expect(result.code).toBe(0);
    // The desk feed is read with includeDismissed, so a dismissed-but-queued
    // decision is still delivered rather than silently skipped.
    const feedRequest = requests.find((request) => request.url.includes("/attention?"));
    expect(feedRequest?.url).toContain("includeDismissed=true");
    expect(result.stdout).toContain('"unresolved":0');
  });

  it("poll succeeds when Telegram rejects an unchanged edit as not modified", async () => {
    const first = await runHelper(["poll", "--sender", senderId, "--company", companyId], env());
    expect(first.code).toBe(0);

    telegramMode = "not-modified";
    const second = await runHelper(["poll", "--sender", senderId, "--company", companyId], env());

    expect(second.code).toBe(0);
    expect(second.stdout).toContain('"updated":1');
    expectNoSensitiveOutput(second);
  });

  it("poll still fails on a 400 that is not an unchanged edit", async () => {
    packageStatus = 404;
    const result = await runHelper(["poll", "--sender", senderId, "--company", companyId], env());

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain('"ok":true');
    expectNoSensitiveOutput(result);
  });

  it("poll falls back to a notice when a queued interaction has incomplete evidence", async () => {
    packageBody = decisionPackage({ evidenceStatus: "missing", evidence: undefined });
    const result = await runHelper(["poll", "--sender", senderId, "--company", companyId], env());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"notified":1');
    expect(result.stdout).toContain('"sent":0');
    const sent = requests.find((request) => request.url.endsWith("/sendMessage"));
    expect((sent?.body as { text: string }).text).toContain("근거 미비");
    expectNoSensitiveOutput(result);
  });
});

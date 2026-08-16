import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PLUGIN_PACKAGE = "@paperclipai/plugin-spacebogam-experiments";
const PLUGIN_KEY = "paperclipai.plugin-spacebogam-experiments";
const ROUTE_PATH = "spacebogam-experiments";
const BASE_URL = process.env.PAPERCLIP_E2E_BASE_URL
  ?? `http://127.0.0.1:${process.env.PAPERCLIP_E2E_PORT ?? "3100"}`;

type CompanySeed = {
  readonly id: string;
  readonly prefix: string;
};

type PluginSecret = {
  readonly id: string;
};

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = Reflect.get(value, key);
  return typeof field === "string" ? field : null;
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  const field = Reflect.get(value, key);
  return typeof field === "object" && field !== null && !Array.isArray(field)
    ? field as Record<string, unknown>
    : null;
}

async function seedCompany(request: APIRequestContext, label: string): Promise<CompanySeed> {
  const res = await request.post(`${BASE_URL}/api/companies`, {
    data: { name: `E2E-Spacebogam-Experiments-${label}-${Date.now()}` },
  });
  expect(res.ok(), `create company failed ${res.status()}: ${await res.text()}`).toBe(true);
  const body: unknown = await res.json();
  const id = readString(body, "id");
  const prefix = readString(body, "issuePrefix")
    ?? readString(body, "prefix")
    ?? readString(body, "urlKey");
  expect(id).not.toBeNull();
  expect(prefix).not.toBeNull();
  return { id: id ?? "", prefix: prefix ?? "" };
}

async function seedSecret(request: APIRequestContext, companyId: string): Promise<PluginSecret> {
  const res = await request.post(`${BASE_URL}/api/companies/${companyId}/secrets`, {
    data: {
      name: `E2E Spacebogam lead hash ${Date.now()}`,
      key: `SBE_LEAD_HASH_${Date.now()}`,
      managedMode: "paperclip_managed",
      value: `e2e-lead-hash-${Date.now()}`,
      description: "E2E Spacebogam experiment lead hash secret",
    },
  });
  expect(res.ok(), `create secret failed ${res.status()}: ${await res.text()}`).toBe(true);
  const body: unknown = await res.json();
  const id = readString(body, "id");
  expect(id).not.toBeNull();
  return { id: id ?? "" };
}

async function configurePlugin(
  request: APIRequestContext,
  companyId: string,
  secret: PluginSecret,
): Promise<void> {
  const res = await request.post(`${BASE_URL}/api/plugins/${PLUGIN_KEY}/config`, {
    data: {
      companyId,
      configJson: {
        leadHashSecret: {
          type: "secret_ref",
          secretId: secret.id,
          version: "latest",
        },
      },
    },
  });
  expect(res.ok(), `configure plugin failed ${res.status()}: ${await res.text()}`).toBe(true);
}

async function installPlugin(request: APIRequestContext): Promise<void> {
  const install = await request.post(`${BASE_URL}/api/plugins/install`, {
    data: { packageName: PLUGIN_PACKAGE },
  });
  expect(
    install.ok(),
    `install plugin failed ${install.status()}: ${await install.text()}`,
  ).toBe(true);
}

async function expectContribution(request: APIRequestContext): Promise<void> {
  const res = await request.get(`${BASE_URL}/api/plugins/ui-contributions`);
  expect(res.ok(), `ui contributions failed ${res.status()}: ${await res.text()}`).toBe(true);
  const body: unknown = await res.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body).toEqual(expect.arrayContaining([
    expect.objectContaining({
      pluginKey: PLUGIN_KEY,
      slots: expect.arrayContaining([
        expect.objectContaining({ type: "sidebar", exportName: "SpacebogamExperimentsSidebar" }),
        expect.objectContaining({ type: "page", routePath: ROUTE_PATH, exportName: "SpacebogamExperimentsPage" }),
        expect.objectContaining({ type: "routeSidebar", routePath: ROUTE_PATH, exportName: "SpacebogamExperimentsRouteSidebar" }),
      ]),
    }),
  ]));
}

async function gotoExperimentRoute(page: Page, seed: CompanySeed) {
  await page.goto(`${BASE_URL}/${seed.prefix}/${ROUTE_PATH}`);
  await expect(page).toHaveURL(new RegExp(`/${seed.prefix}/${ROUTE_PATH}$`));
  await expect(page.getByText("실험 운영", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("퍼널 분석 보기", { exact: true })).toBeVisible();
}

async function createGovernanceExperiment(page: Page) {
  const suffix = Date.now();
  await page.getByLabel("실험 이름").fill(`거버넌스 E2E ${suffix}`);
  await page.getByLabel("가설").fill("상담 결과 입력과 board governance가 같은 흐름에서 검증됩니다.");
  await page.getByRole("button", { name: "실험과 운영 이슈 생성" }).click();
  await expect(page.getByText("새 실험과 Paperclip 운영 이슈를 만들었습니다.")).toBeVisible();
  await expect(page.getByRole("tab", { name: `거버넌스 E2E ${suffix}` })).toBeVisible();
}

test.describe("Spacebogam experiment operations navigation", () => {
  test("navigation exposes sidebar slots, direct reload, company switch, and funnel backlink", async ({ page, request }) => {
    const health = await request.get(`${BASE_URL}/api/health`).catch(() => null);
    test.skip(
      health === null || !health.ok(),
      `No local Paperclip server available at ${BASE_URL}; use tests/e2e/playwright.config.ts or live HTTP channel evidence.`,
    );

    await installPlugin(request);
    const first = await seedCompany(request, "first");
    const second = await seedCompany(request, "second");

    await expectContribution(request);

    await gotoExperimentRoute(page, first);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${first.prefix}/${ROUTE_PATH}$`));
    await expect(page.getByText("퍼널 분석 보기", { exact: true })).toBeVisible();

    await gotoExperimentRoute(page, second);
    await expect(page).not.toHaveURL(new RegExp(`/${first.prefix}/${ROUTE_PATH}$`));
    await page.getByText("퍼널 분석 보기", { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${second.prefix}/analytics/funnel$`));

    await request.delete(`${BASE_URL}/api/companies/${first.id}`).catch(() => undefined);
    await request.delete(`${BASE_URL}/api/companies/${second.id}`).catch(() => undefined);
  });
});

test.describe("Spacebogam experiment operations governance", () => {
  test("governance covers entry save, raw lead key redaction, destructive cancel/confirm, stale reapply, and approval links", async ({ page, request }) => {
    const health = await request.get(`${BASE_URL}/api/health`).catch(() => null);
    test.skip(
      health === null || !health.ok(),
      `No local Paperclip server available at ${BASE_URL}; use tests/e2e/playwright.config.ts or live HTTP channel evidence.`,
    );

    await installPlugin(request);
    const seed = await seedCompany(request, "governance");
    const secret = await seedSecret(request, seed.id);
    await configurePlugin(request, seed.id, secret);
    await expectContribution(request);

    await gotoExperimentRoute(page, seed);
    await createGovernanceExperiment(page);

    await page.getByLabel("기준안").fill("현재안");
    await page.getByLabel("비교안").fill("개선안");
    await page.getByRole("button", { name: "실험 설계 저장" }).click();
    await expect(page.getByText("기준안과 비교안을 저장했습니다.")).toBeVisible();

    await page.getByRole("button", { name: "실험 시작" }).click();
    await expect(page.getByText("실험 시작 상태로 변경했습니다.")).toBeVisible();

    await expect(page.getByRole("link", { name: "운영 이슈" })).toHaveAttribute("href", /\/issues\/[0-9a-f-]+/i);
    await expect(page.getByRole("link", { name: "의사결정" })).toHaveAttribute("href", /\/decisions$/);

    await page.getByRole("button", { name: "상담 결과 기록 열기" }).click();
    const leadKey = "010-1234-5678";
    await page.getByLabel("CRM 리드 ID").fill(leadKey);
    await expect(page.getByText("입력값은 이메일/휴대폰 패턴으로 보여지므로")).toBeVisible();
    await expect(page.getByRole("button", { name: "결과 반영" })).toBeDisabled();
    await page.getByLabel(/입력값은 이메일\/휴대폰 패턴/).check();
    await page.getByLabel("결과").selectOption("won");
    await page.getByRole("button", { name: "결과 반영" }).click();
    await expect(page.getByText("상담 결과 기록")).toBeHidden();
    await expect(page.getByText(leadKey)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(leadKey);

    const tabId = await page.locator("[id^='experiment-']").first().getAttribute("id");
    expect(tabId).not.toBeNull();
    const experimentId = tabId?.replace(/^experiment-/, "") ?? "";
    const actionResponse = await request.post(`${BASE_URL}/api/plugins/${PLUGIN_KEY}/actions/board-action`, {
      data: {
        companyId: seed.id,
        params: {
          action: "pause-experiment",
          payload: {
            experimentId,
            version: 1,
          },
        },
      },
    });
    expect(actionResponse.ok(), `stale action request failed ${actionResponse.status()}: ${await actionResponse.text()}`).toBe(true);
    const actionBody: unknown = await actionResponse.json();
    const staleData = readRecord(actionBody, "data");
    expect(staleData).toEqual(expect.objectContaining({
      ok: false,
      code: "invalid_version",
      reapply: true,
    }));

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("실험을 완료하면 되돌릴 수 없습니다.");
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "실험 완료" }).click();
    await expect(page.getByRole("button", { name: "실험 완료" })).toBeVisible();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("실험을 완료하면 되돌릴 수 없습니다.");
      await dialog.accept();
    });
    await page.getByRole("button", { name: "실험 완료" }).click();
    await expect(page.getByText("실험을 완료 처리했습니다.")).toBeVisible();

    await request.delete(`${BASE_URL}/api/companies/${seed.id}`).catch(() => undefined);
  });
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readConfigFromEnv, readNaverCredentialsFile } from "./config.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Naver Search Ads config", () => {
  it("reads only the three Naver credential keys from a protected dotenv file", () => {
    const directory = mkdtempSync(join(tmpdir(), "paperclip-naver-searchad-"));
    tempDirs.push(directory);
    const path = join(directory, ".env");
    writeFileSync(path, [
      "NAVER_SEARCH_AD_ACCESS_LICENSE='access'",
      "NAVER_SEARCH_AD_SECRET_KEY=\"secret\"",
      "NAVER_SEARCH_AD_CUSTOMER_ID=customer",
      "OTHER_PROVIDER_SECRET=must-not-load",
    ].join("\n"), { mode: 0o600 });

    expect(readNaverCredentialsFile(path)).toEqual({
      NAVER_SEARCH_AD_ACCESS_LICENSE: "access",
      NAVER_SEARCH_AD_SECRET_KEY: "secret",
      NAVER_SEARCH_AD_CUSTOMER_ID: "customer",
    });
    expect(readConfigFromEnv({ NAVER_SEARCH_AD_CREDENTIALS_PATH: path })).toMatchObject({
      accessLicense: "access",
      secretKey: "secret",
      customerId: "customer",
    });
  });
});

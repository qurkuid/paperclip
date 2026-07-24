import { describe, expect, it } from "vitest";
import { resolveAppResourceUrl, withAppBasePath } from "./base-path";

describe("withAppBasePath", () => {
  it("prefixes root-relative paths for a sub-path deployment", () => {
    expect(withAppBasePath("/api/health", "/af/")).toBe("/af/api/health");
  });

  it("does not double-prefix paths", () => {
    expect(withAppBasePath("/af/api/health", "/af")).toBe("/af/api/health");
  });

  it("keeps external and relative paths unchanged", () => {
    expect(withAppBasePath("https://example.com/image.png", "/af")).toBe("https://example.com/image.png");
    expect(withAppBasePath("image.png", "/af")).toBe("image.png");
  });
});

describe("resolveAppResourceUrl", () => {
  it("rewrites a saved loopback URL to the current origin", () => {
    expect(resolveAppResourceUrl(
      "http://127.0.0.1:3100/api/issues/issue-1/file.png?download=1",
      { origin: "https://intm.kr", hostname: "intm.kr" },
      "/af",
    )).toBe("https://intm.kr/af/api/issues/issue-1/file.png?download=1");
  });

  it("keeps public external URLs unchanged", () => {
    expect(resolveAppResourceUrl(
      "https://cdn.example.com/image.png",
      { origin: "https://intm.kr", hostname: "intm.kr" },
    )).toBe("https://cdn.example.com/image.png");
  });
});

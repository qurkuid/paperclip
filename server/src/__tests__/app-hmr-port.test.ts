import { describe, expect, it } from "vitest";
import {
  resolveViteBasePath,
  resolveViteHmrHost,
  resolveViteHmrPort,
  resolveViteMiddlewareUrl,
} from "../app.ts";

describe("resolveViteBasePath", () => {
  it("normalizes a reverse-proxy prefix for Vite module URLs", () => {
    expect(resolveViteBasePath("/af")).toBe("/af/");
    expect(resolveViteBasePath("af/")).toBe("/af/");
    expect(resolveViteBasePath(undefined)).toBe("/");
    expect(resolveViteMiddlewareUrl("/src/main.tsx", "/af/")).toBe("/af/src/main.tsx");
    expect(resolveViteMiddlewareUrl("/src/main.tsx", "/")).toBe("/src/main.tsx");
  });
});

describe("resolveViteHmrPort", () => {
  it("uses serverPort + 10000 when the result stays in range", () => {
    expect(resolveViteHmrPort(3100)).toBe(13_100);
    expect(resolveViteHmrPort(55_535)).toBe(65_535);
  });

  it("falls back below the server port when adding 10000 would overflow", () => {
    expect(resolveViteHmrPort(55_536)).toBe(45_536);
    expect(resolveViteHmrPort(63_000)).toBe(53_000);
  });

  it("never returns a privileged or invalid port", () => {
    expect(resolveViteHmrPort(65_535)).toBe(55_535);
    expect(resolveViteHmrPort(9_000)).toBe(19_000);
  });
});

describe("resolveViteHmrHost", () => {
  it("omits wildcard bind hosts so Vite uses the browser hostname", () => {
    expect(resolveViteHmrHost("0.0.0.0")).toBeUndefined();
    expect(resolveViteHmrHost("::")).toBeUndefined();
  });

  it("keeps concrete bind hosts", () => {
    expect(resolveViteHmrHost("127.0.0.1")).toBe("127.0.0.1");
    expect(resolveViteHmrHost("paperclip-dev")).toBe("paperclip-dev");
  });
});

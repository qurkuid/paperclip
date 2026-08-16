import { describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("../api/spacebogam-funnel", () => ({
  fetchSpacebogamFunnel: vi.fn(),
  spacebogamFunnelQueryKey: (companyId: string, rangeDays: number) => [
    "spacebogam-funnel",
    companyId,
    rangeDays,
  ],
}));

import { useSpacebogamFunnel } from "./useSpacebogamFunnel";
import { fetchSpacebogamFunnel } from "../api/spacebogam-funnel";

interface QueryOptions {
  queryKey?: readonly unknown[];
  enabled?: boolean;
  retry?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
  queryFn?: () => Promise<unknown>;
}

function lastQueryOptions(): QueryOptions {
  const call = useQueryMock.mock.lastCall;
  if (!call) throw new Error("useQuery was not called");
  const [options] = call;
  if (typeof options !== "object" || options === null) {
    throw new Error("useQuery options were not an object");
  }
  return options;
}

describe("useSpacebogamFunnel", () => {
  it("uses a company and range scoped query key with the required polling policy", async () => {
    useQueryMock.mockReturnValueOnce({ data: undefined });

    useSpacebogamFunnel("company-1", 90);
    const options = lastQueryOptions();

    expect(options.queryKey).toEqual(["spacebogam-funnel", "company-1", 90]);
    expect(options.enabled).toBe(true);
    expect(options.retry).toBe(false);
    expect(options.staleTime).toBe(60_000);
    expect(options.refetchInterval).toBe(300_000);
    if (!options.queryFn) throw new Error("queryFn was not set");
    await options.queryFn();
    expect(fetchSpacebogamFunnel).toHaveBeenCalledWith("company-1", 90);
  });

  it("does not fetch without a company id", () => {
    useQueryMock.mockReturnValueOnce({ data: undefined });

    useSpacebogamFunnel(null, 28);

    expect(lastQueryOptions().enabled).toBe(false);
  });
});

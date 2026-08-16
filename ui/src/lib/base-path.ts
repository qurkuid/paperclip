function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);

export function withAppBasePath(path: string, basePath = appBasePath): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return path;
  const normalizedBase = normalizeBasePath(basePath);
  if (!normalizedBase || path === normalizedBase || path.startsWith(`${normalizedBase}/`)) {
    return path;
  }
  return `${normalizedBase}${path}`;
}

/**
 * Prefix same-origin absolute request paths with the app base path.
 *
 * Every `fetch("/api/...")` and `new EventSource("/api/...")` in the UI is
 * written relative to the origin, which breaks when the app is mounted under
 * a prefix (the Mac mini serves it at https://intm.kr/af). Patching the two
 * entry points once keeps upstream's call sites untouched, so new fetches
 * they add keep working without a merge conflict.
 */
export function installAppBasePathNetworkPrefix(basePath = appBasePath): void {
  if (!basePath || typeof window === "undefined") return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string") return originalFetch(withAppBasePath(input, basePath), init);
    if (input instanceof Request && input.url.startsWith(`${window.location.origin}/`)) {
      const rewritten = withAppBasePath(new URL(input.url).pathname, basePath);
      if (rewritten !== new URL(input.url).pathname) {
        return originalFetch(new Request(new URL(rewritten + new URL(input.url).search, window.location.origin), input), init);
      }
    }
    return originalFetch(input, init);
  };

  const OriginalEventSource = window.EventSource;
  window.EventSource = class extends OriginalEventSource {
    constructor(url: string | URL, init?: EventSourceInit) {
      super(typeof url === "string" ? withAppBasePath(url, basePath) : url, init);
    }
  } as typeof EventSource;
}

type BrowserLocationLike = Pick<Location, "origin" | "hostname">;

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "0.0.0.0"
    || normalized === "::1"
    || normalized === "[::1]";
}

export function resolveAppResourceUrl(
  href: string,
  location: BrowserLocationLike | undefined = typeof window === "undefined" ? undefined : window.location,
  basePath = appBasePath,
): string {
  if (!href) return href;
  if (href.startsWith("/")) return withAppBasePath(href, basePath);
  if (!location || !URL.canParse(href)) return href;

  const parsed = new URL(href);
  if (!isLoopbackHostname(parsed.hostname)) return href;
  return `${location.origin}${withAppBasePath(`${parsed.pathname}${parsed.search}${parsed.hash}`, basePath)}`;
}

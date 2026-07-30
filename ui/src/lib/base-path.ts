function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);

export function resolveRouterBasename(
  pathname: string,
  basePath = appBasePath,
): string | undefined {
  const normalizedBase = normalizeBasePath(basePath);
  return normalizedBase && (pathname === normalizedBase || pathname.startsWith(`${normalizedBase}/`))
    ? normalizedBase
    : undefined;
}

export function withAppBasePath(path: string, basePath = appBasePath): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return path;
  const normalizedBase = normalizeBasePath(basePath);
  if (!normalizedBase || path === normalizedBase || path.startsWith(`${normalizedBase}/`)) {
    return path;
  }
  return `${normalizedBase}${path}`;
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

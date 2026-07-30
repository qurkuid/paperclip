import type { CreateDebugRequest } from "@paperclipai/shared";

const DEVELOPER_CONSOLE_META_NAME = "paperclip-developer-console-url";
const PAPERCLIP_DEBUG_FRAGMENT_KEY = "paperclip-debug";

type DeveloperConsoleHandoff = {
  version: 1;
  source: "paperclip";
  companyId: string;
  debugRequest: CreateDebugRequest;
};

function configuredDeveloperConsoleUrl(): URL | null {
  const configuredUrl = document
    .querySelector<HTMLMetaElement>(`meta[name="${DEVELOPER_CONSOLE_META_NAME}"]`)
    ?.content.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function openDeveloperConsole(
  companyId: string,
  debugRequest: CreateDebugRequest,
): boolean {
  const url = configuredDeveloperConsoleUrl();
  if (!url) return false;

  const handoff: DeveloperConsoleHandoff = {
    version: 1,
    source: "paperclip",
    companyId,
    debugRequest,
  };
  const fragment = new URLSearchParams({
    [PAPERCLIP_DEBUG_FRAGMENT_KEY]: JSON.stringify(handoff),
  });
  const existingFragment = url.hash.slice(1);
  url.hash = existingFragment ? `${existingFragment}&${fragment}` : fragment.toString();
  window.open(url.toString(), "_blank", "noopener,noreferrer");
  return true;
}

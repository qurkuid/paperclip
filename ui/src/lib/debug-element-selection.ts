import type { DebugElementContext } from "@paperclipai/shared";

const TEXT_LIMIT = 500;

function escapeCssIdentifier(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function elementSegment(element: Element) {
  if (element.id) return `#${escapeCssIdentifier(element.id)}`;
  const tagName = element.tagName.toLowerCase();
  const siblings = element.parentElement
    ? Array.from(element.parentElement.children).filter(
        (sibling) => sibling.tagName === element.tagName,
      )
    : [];
  const index = Math.max(1, siblings.indexOf(element) + 1);
  return `${tagName}:nth-of-type(${index})`;
}

function normalizedText(element: Element) {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return "";
  }
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT);
}

function inferredRole(element: Element) {
  const explicitRole = element.getAttribute("role")?.trim();
  if (explicitRole) return explicitRole.slice(0, 100);
  if (element instanceof HTMLButtonElement) return "button";
  if (element instanceof HTMLAnchorElement) return "link";
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return "textbox";
  return null;
}

export function buildElementSelector(element: Element) {
  const segments: string[] = [];
  let cursor: Element | null = element;

  while (cursor && cursor !== document.body && cursor !== document.documentElement) {
    segments.unshift(elementSegment(cursor));
    if (cursor.id) break;
    cursor = cursor.parentElement;
  }

  return segments.join(" > ");
}

export function isDebugRequestUiElement(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-debug-request-ui]") !== null;
}

export function safeDebugPagePath(input: Pick<Location, "pathname" | "search">) {
  const parameterNames = [...new Set(new URLSearchParams(input.search).keys())].sort();
  const queryShape = parameterNames.length > 0
    ? `?${parameterNames.map((name) => encodeURIComponent(name)).join("&")}`
    : "";
  return `${input.pathname}${queryShape}`.slice(0, 2048);
}

export function captureDebugElement(element: Element, pagePath: string): DebugElementContext {
  const rect = element.getBoundingClientRect();
  const ariaLabel = element.getAttribute("aria-label")?.replace(/\s+/g, " ").trim().slice(0, 300) || null;

  return {
    pagePath,
    tagName: element.tagName.toLowerCase(),
    selector: buildElementSelector(element),
    text: normalizedText(element),
    role: inferredRole(element),
    ariaLabel,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

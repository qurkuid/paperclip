import fs from "node:fs";
import path from "node:path";

type ViteWatcherEvent = "add" | "change" | "unlink";

export interface ViteWatcherHost {
  watcher?: {
    on?: (event: ViteWatcherEvent, listener: (file: string) => void) => unknown;
    off?: (event: ViteWatcherEvent, listener: (file: string) => void) => unknown;
  };
}

export interface CachedViteHtmlRenderer {
  render(_url: string): Promise<string>;
  dispose(): void;
}

const WATCHER_EVENTS: ViteWatcherEvent[] = ["add", "change", "unlink"];
function withBasePath(basePath: string, modulePath: string): string {
  if (basePath === "/") return modulePath;
  return `${basePath.replace(/\/+$/, "")}${modulePath}`;
}

function injectViteDevPreamble(html: string, basePath: string): string {
  const mainEntryPath = withBasePath(basePath, "/src/main.tsx");
  const viteClientPath = withBasePath(basePath, "/@vite/client");
  const reactRefreshPath = withBasePath(basePath, "/@react-refresh");
  const mainEntryTag = `<script type="module" src="${mainEntryPath}"></script>`;
  const viteClientTag = `<script type="module" src="${viteClientPath}"></script>`;
  const reactRefreshPreamble = `<script type="module">
import { injectIntoGlobalHook } from "${reactRefreshPath}";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
</script>`;
  let injectedHtml = html
    .replaceAll('"/src/main.tsx"', `"${mainEntryPath}"`)
    .replaceAll('"/@vite/client"', `"${viteClientPath}"`)
    .replaceAll('"/@react-refresh"', `"${reactRefreshPath}"`)
    .replaceAll("'/@react-refresh'", `'${reactRefreshPath}'`);
  if (!injectedHtml.includes(`"${reactRefreshPath}"`) && !injectedHtml.includes(`'${reactRefreshPath}'`)) {
    injectedHtml = injectedHtml.includes("</head>")
      ? injectedHtml.replace("</head>", `    ${reactRefreshPreamble}\n  </head>`)
      : `${reactRefreshPreamble}\n${injectedHtml}`;
  }
  if (injectedHtml.includes(viteClientTag)) return injectedHtml;
  if (injectedHtml.includes(mainEntryTag)) {
    return injectedHtml.replace(mainEntryTag, `${viteClientTag}\n    ${mainEntryTag}`);
  }
  return injectedHtml.replace("</body>", `    ${viteClientTag}\n  </body>`);
}

export function createCachedViteHtmlRenderer(opts: {
  vite: ViteWatcherHost;
  uiRoot: string;
  basePath?: string;
  brandHtml?: (html: string) => string;
}): CachedViteHtmlRenderer {
  const uiRoot = path.resolve(opts.uiRoot);
  const templatePath = path.resolve(uiRoot, "index.html");
  const brandHtml = opts.brandHtml ?? ((html: string) => html);
  const basePath = opts.basePath ?? "/";
  let cachedHtml: string | null = null;

  function loadHtml(): string {
    if (cachedHtml === null) {
      const rawTemplate = fs.readFileSync(templatePath, "utf-8");
      cachedHtml = injectViteDevPreamble(brandHtml(rawTemplate), basePath);
    }
    return cachedHtml;
  }

  function invalidate(): void {
    cachedHtml = null;
  }

  function onWatchEvent(filePath: string): void {
    const resolvedPath = path.resolve(filePath);
    if (resolvedPath === templatePath) {
      invalidate();
    }
  }

  for (const eventName of WATCHER_EVENTS) {
    opts.vite.watcher?.on?.(eventName, onWatchEvent);
  }

  return {
    render(): Promise<string> {
      return Promise.resolve(loadHtml());
    },

    dispose(): void {
      for (const eventName of WATCHER_EVENTS) {
        opts.vite.watcher?.off?.(eventName, onWatchEvent);
      }
    },
  };
}

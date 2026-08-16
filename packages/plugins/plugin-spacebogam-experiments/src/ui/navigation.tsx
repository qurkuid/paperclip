import {
  useHostNavigation,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";

import { ROUTE_PATH } from "../manifest.js";

function TargetIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" />
    </svg>
  );
}

export function SpacebogamExperimentsSidebar({ context }: PluginSidebarProps) {
  const navigation = useHostNavigation();
  if (!context.companyId) return null;
  return (
    <a
      {...navigation.linkProps(`/${ROUTE_PATH}`)}
      className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent/50 hover:text-foreground"
      style={{ textDecoration: "none" }}
    >
      <TargetIcon />
      <span className="flex-1 truncate">전체 현황</span>
    </a>
  );
}

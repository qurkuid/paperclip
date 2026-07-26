import {
  AppWindow,
  DollarSign,
  Funnel,
  GanttChartSquare,
  History,
  Network,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type CompanyNavItem = {
  to: string;
  label: "Org" | "Apps" | "Funnel Analytics" | "Timeline" | "Costs" | "Activity" | "Settings";
  icon: LucideIcon;
  requiresApps?: boolean;
};

export const COMPANY_NAV_ITEMS: readonly CompanyNavItem[] = [
  { to: "/org", label: "Org", icon: Network },
  { to: "/apps", label: "Apps", icon: AppWindow, requiresApps: true },
  { to: "/analytics/funnel", label: "Funnel Analytics", icon: Funnel },
  { to: "/timeline", label: "Timeline", icon: GanttChartSquare },
  { to: "/costs", label: "Costs", icon: DollarSign },
  { to: "/activity", label: "Activity", icon: History },
  { to: "/company/settings", label: "Settings", icon: Settings },
];

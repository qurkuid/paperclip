import { useState } from "react";
import { koMenu } from "@/i18n/korean-menu";
import { SidebarNavItem } from "../SidebarNavItem";
import { SidebarSection } from "../SidebarSection";
import { COMPANY_NAV_ITEMS } from "./companyNavigation";

interface SidebarCompanyNavigationProps {
  showApps: boolean;
}

export function SidebarCompanyNavigation({ showApps }: SidebarCompanyNavigationProps) {
  const [open, setOpen] = useState(true);
  const items = COMPANY_NAV_ITEMS.filter((item) => showApps || !item.requiresApps);

  return (
    <SidebarSection label={koMenu("Company")} collapsible={{ open, onOpenChange: setOpen }}>
      {items.map((item) => (
        <SidebarNavItem key={item.to} to={item.to} label={koMenu(item.label)} icon={item.icon} />
      ))}
    </SidebarSection>
  );
}

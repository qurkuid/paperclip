import { PanelLeftClose, PanelLeftOpen, Pin, Search } from "lucide-react";
import { NavLink } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { useSidebar } from "../../context/SidebarContext";
import { koMenu } from "@/i18n/korean-menu";
import { SidebarCompanyMenu } from "../SidebarCompanyMenu";

export function SidebarHeader() {
  const { isMobile, collapsed, collapseLocked, peeking, toggleCollapsed, setCollapsed } = useSidebar();
  const rail = collapsed && !peeking;

  return (
    <div className="flex items-center gap-1 px-3 h-12 shrink-0">
      <SidebarCompanyMenu />
      {!rail ? (
        <>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground shrink-0"
            aria-label={koMenu("Open search")}
            title={koMenu("Open search")}
          >
            <NavLink to="/search">
              <Search className="h-4 w-4" />
            </NavLink>
          </Button>
          {!isMobile && !collapseLocked ? (
            peeking ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground shrink-0"
                aria-label={koMenu("Keep sidebar expanded")}
                title={koMenu("Keep sidebar expanded")}
                onClick={() => setCollapsed(false)}
              >
                <Pin className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground shrink-0"
                aria-expanded={!collapsed}
                aria-label={collapsed ? koMenu("Expand sidebar") : koMenu("Collapse sidebar")}
                title={collapsed ? koMenu("Expand sidebar") : koMenu("Collapse sidebar")}
                onClick={() => toggleCollapsed()}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}

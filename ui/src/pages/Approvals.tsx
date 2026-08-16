import { useEffect } from "react";
import { Link, useNavigate, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { ShieldCheck } from "lucide-react";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";

type StatusFilter = "pending" | "all";

export function Approvals() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  const statusFilter: StatusFilter = new URLSearchParams(location.search).get("status") === "all" ? "all" : "pending";

  useEffect(() => {
    setBreadcrumbs([{ label: "Approvals" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.approvals.list(selectedCompanyId!), "inbox", statusFilter],
    queryFn: () => approvalsApi.listInbox(selectedCompanyId!, statusFilter === "pending" ? "pending" : undefined),
    enabled: !!selectedCompanyId,
  });

  const pendingCount = data?.length ?? 0;

  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">Select a company first.</p>;
  }

  if (isLoading) {
    return <PageSkeleton variant="approvals" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={statusFilter} onValueChange={(v) => navigate(`/approvals?status=${v}`)}>
          <PageTabBar items={[
            { value: "pending", label: <>Pending{pendingCount > 0 && (
              <Badge variant="ghost" className={cn(
                "ml-1.5 px-1.5 text-(length:--text-nano)",
                "bg-yellow-500/20 text-yellow-500"
              )}>
                {pendingCount}
              </Badge>
            )}</> },
            { value: "all", label: "All" },
          ]} />
        </Tabs>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {(data ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {statusFilter === "pending" ? "No pending approvals." : "No approvals yet."}
          </p>
        </div>
      )}

      {(data ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-(--sz-780px) text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {[
                  "대표 이슈", "원 지시", "결과 요약", "결과물", "매니저 검수", "CEO 검수", "사용자 승인", "Pending confirmation", "최종 갱신",
                ].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    {item.issueIdentifier ? <Link className="text-primary hover:underline" to={`/issues/${item.issueIdentifier}`}>{item.issueIdentifier}</Link> : item.issueTitle ?? "—"}
                  </td>
                  <td className="px-3 py-2">{item.originalInstruction ?? "—"}</td>
                  <td className="px-3 py-2">{item.resultSummary ?? "—"}</td>
                  <td className="px-3 py-2">{item.resultUrl ? <a className="text-primary hover:underline" href={item.resultUrl}>열기</a> : "—"}</td>
                  <td className="px-3 py-2">{item.managerReview ?? "—"}</td>
                  <td className="px-3 py-2">{item.ceoReview ?? "—"}</td>
                  <td className="px-3 py-2">{item.userApprovalStatus}</td>
                  <td className="px-3 py-2">{item.pendingConfirmation ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{new Date(item.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

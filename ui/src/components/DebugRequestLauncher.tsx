import { useEffect, useState } from "react";
import { Bug, MousePointer2, X } from "lucide-react";
import type { CreateDebugRequest, DebugElementContext } from "@paperclipai/shared";
import { debugRequestsApi } from "../api/debug-requests";
import { useCompany } from "../context/CompanyContext";
import { useOptionalToastActions } from "../context/ToastContext";
import {
  captureDebugElement,
  isDebugRequestUiElement,
  safeDebugPagePath,
} from "../lib/debug-element-selection";
import { openDeveloperConsole } from "../lib/developer-console-handoff";
import { useNavigate } from "@/lib/router";
import { DebugRequestDialog } from "./DebugRequestDialog";

function currentPagePath() {
  return safeDebugPagePath(window.location);
}

export function DebugRequestLauncher() {
  const { selectedCompanyId } = useCompany();
  const toastActions = useOptionalToastActions();
  const navigate = useNavigate();
  const [selecting, setSelecting] = useState(false);
  const [hoveredRect, setHoveredRect] = useState<DebugElementContext["rect"] | null>(null);
  const [selectedElement, setSelectedElement] = useState<DebugElementContext | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!selecting) return;
    const previousCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = "crosshair";

    const handlePointerMove = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || isDebugRequestUiElement(event.target)) {
        setHoveredRect(null);
        return;
      }
      setHoveredRect(captureDebugElement(event.target, currentPagePath()).rect);
    };
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || isDebugRequestUiElement(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSelectedElement(captureDebugElement(event.target, currentPagePath()));
      setSelecting(false);
      setHoveredRect(null);
      setDialogOpen(true);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelecting(false);
      setHoveredRect(null);
    };

    document.addEventListener("mousemove", handlePointerMove, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.documentElement.style.cursor = previousCursor;
      document.removeEventListener("mousemove", handlePointerMove, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [selecting]);

  if (!selectedCompanyId) return null;

  async function submitRequest(request: string) {
    const companyId = selectedCompanyId;
    if (!companyId || !selectedElement) return;
    const debugRequest: CreateDebugRequest = {
      request,
      pageTitle: document.title || "Paperclip",
      element: selectedElement,
      allowPaperclipServerRestart: true,
    };
    if (openDeveloperConsole(companyId, debugRequest)) {
      setDialogOpen(false);
      toastActions?.pushToast({
        title: "외부 개발 화면을 열었습니다",
        body: "선택한 요소와 요청사항을 안전하게 전달했습니다.",
        tone: "success",
      });
      return;
    }

    setPending(true);
    try {
      const issue = await debugRequestsApi.create(companyId, debugRequest);
      const issueRef = issue.identifier ?? issue.id;
      setDialogOpen(false);
      toastActions?.pushToast({
        title: `${issueRef} 작업을 생성했습니다`,
        body: "Founding Engineer가 선택한 요소와 요청사항을 전달받았습니다.",
        tone: "success",
        action: { label: "작업 보기", href: `/issues/${issueRef}` },
      });
      navigate(`/issues/${issueRef}`);
    } catch (error) {
      toastActions?.pushToast({
        title: "수정 요청을 만들지 못했습니다",
        body: error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  }

  function reselect() {
    setDialogOpen(false);
    setSelectedElement(null);
    setSelecting(true);
  }

  return (
    <div data-debug-request-ui>
      {hoveredRect ? (
        <div
          className="pointer-events-none fixed z-(--z-10000) rounded-sm border-2 border-amber-300 bg-amber-300/10 shadow-[0_0_0_1px_rgba(0,0,0,0.65),0_0_28px_rgba(252,211,77,0.28)]"
          style={{
            left: hoveredRect.x,
            top: hoveredRect.y,
            width: hoveredRect.width,
            height: hoveredRect.height,
          }}
        />
      ) : null}

      {selecting ? (
        <div className="fixed left-1/2 top-5 z-(--z-10001) flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-300/40 bg-zinc-950 px-4 py-2.5 text-zinc-100 shadow-2xl">
          <span className="flex size-7 items-center justify-center rounded-full bg-amber-300 text-zinc-950">
            <MousePointer2 className="size-3.5" />
          </span>
          <span className="text-sm font-medium">개발할 요소를 선택하세요</span>
          <span className="text-xs text-zinc-500">ESC 취소</span>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="개발할 요소 선택"
        aria-pressed={selecting}
        title={selecting ? "요소 선택 취소" : "화면 요소를 선택해 개발 화면으로 전달"}
        className="fixed bottom-6 right-6 z-(--z-10001) flex size-12 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-950 text-amber-300 shadow-[0_14px_40px_rgba(0,0,0,0.34)] transition hover:-translate-y-0.5 hover:border-amber-300/70 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        onClick={() => {
          setSelecting((current) => !current);
          setHoveredRect(null);
        }}
      >
        {selecting ? <X className="size-5" /> : <Bug className="size-5" />}
      </button>

      <DebugRequestDialog
        element={selectedElement}
        open={dialogOpen}
        pending={pending}
        onOpenChange={setDialogOpen}
        onReselect={reselect}
        onSubmit={submitRequest}
      />
    </div>
  );
}

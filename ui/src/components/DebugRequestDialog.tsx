import { useEffect, useRef, useState, type FormEvent } from "react";
import { Code2, RotateCcw, ShieldCheck } from "lucide-react";
import type { DebugElementContext } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type DebugRequestDialogProps = {
  element: DebugElementContext | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onReselect: () => void;
  onSubmit: (request: string) => Promise<void>;
};

function elementLabel(element: DebugElementContext) {
  return element.ariaLabel || element.text || element.selector;
}

export function DebugRequestDialog({
  element,
  open,
  pending,
  onOpenChange,
  onReselect,
  onSubmit,
}: DebugRequestDialogProps) {
  const [request, setRequest] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) setRequest("");
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!element || request.trim().length < 3 || pending) return;
    await onSubmit(request.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-debug-request-ui
        className="overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-50 shadow-2xl sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-zinc-800 px-6 py-5 text-left">
            <div className="mb-3 flex items-center gap-2 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-amber-300">
              <Code2 className="size-3.5" />
              Paperclip UI Debug
            </div>
            <DialogTitle className="text-xl font-semibold tracking-tight">
              선택한 요소 수정 요청
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-zinc-400">
              화면 위치와 요소 정보가 함께 전달됩니다. 입력값, 쿠키, 비밀값은 수집하지 않습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            {element ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {elementLabel(element)}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                      {element.selector}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 font-mono text-(length:--text-nano) uppercase text-zinc-400">
                    {element.tagName}
                  </span>
                </div>
              </div>
            ) : null}

            <div>
              <label htmlFor="debug-request-detail" className="mb-2 block text-sm font-medium text-zinc-200">
                무엇을 어떻게 바꾸면 될까요?
              </label>
              <Textarea
                ref={textareaRef}
                id="debug-request-detail"
                autoFocus
                value={request}
                onChange={(event) => setRequest(event.target.value)}
                placeholder="예: 이 버튼을 눌렀을 때 처리 결과를 카드 안에서 바로 확인할 수 있게 해 주세요."
                className="min-h-32 resize-none border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-400"
                disabled={pending}
              />
            </div>

            <div className="flex gap-3 rounded-xl border border-emerald-900/70 bg-emerald-950/40 p-3.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <div>
                <p className="text-xs font-semibold text-emerald-200">배포 권한 포함</p>
                <p className="mt-1 text-xs leading-5 text-emerald-300/70">
                  테스트와 빌드 통과 후 PM2의 paperclip 서비스만 재시작할 수 있습니다.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row justify-between border-t border-zinc-800 bg-zinc-900/50 px-6 py-4 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={onReselect}
              disabled={pending}
            >
              <RotateCcw className="mr-2 size-4" />
              다시 선택
            </Button>
            <Button
              type="submit"
              className="bg-amber-300 text-zinc-950 hover:bg-amber-200"
              disabled={pending || request.trim().length < 3}
            >
              {pending ? "작업 생성 중…" : "수정 요청 보내기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

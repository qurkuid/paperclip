import type { CompanySkillImportPreviewResult } from "@paperclipai/shared";
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ImportSkillSourceDialogProps {
  open: boolean;
  source: string;
  previewSource: string | null;
  preview: CompanySkillImportPreviewResult | null;
  validationError: string | null;
  previewPending: boolean;
  installPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSourceChange: (source: string) => void;
  onPreview: () => void;
  onInstall: () => void;
}

function trustLabel(value: CompanySkillImportPreviewResult["candidates"][number]["trustLevel"]) {
  if (value === "markdown_only") return "Markdown only";
  if (value === "assets") return "Includes assets";
  return "Includes executables";
}

function compatibilityLabel(value: CompanySkillImportPreviewResult["candidates"][number]["compatibility"]) {
  if (value === "compatible") return "Compatible";
  if (value === "unknown") return "Compatibility unknown";
  return "Invalid";
}

export function ImportSkillSourceDialog({
  open,
  source,
  previewSource,
  preview,
  validationError,
  previewPending,
  installPending,
  onOpenChange,
  onSourceChange,
  onPreview,
  onInstall,
}: ImportSkillSourceDialogProps) {
  const verifiedPreview = previewSource === source.trim() ? preview : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-(--sz-85vh) overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a skill</DialogTitle>
          <DialogDescription>
            Paste a GitHub URL, local path, or `skills.sh` command. Paperclip verifies the source before anything is added.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (verifiedPreview) onInstall();
            else onPreview();
          }}
        >
          <Input
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
            placeholder="https://github.com/owner/repository"
            aria-label="Skill source"
            disabled={installPending}
          />

          {!verifiedPreview ? (
            <div className="grid gap-2">
              <a
                href="https://skills.sh"
                target="_blank"
                rel="noreferrer"
                className="flex items-start justify-between rounded-md border border-border px-3 py-3 text-sm text-foreground no-underline transition-colors hover:bg-accent/40"
              >
                <span>
                  <span className="block font-medium">Browse skills.sh</span>
                  <span className="mt-1 block text-muted-foreground">Find install commands and paste one here.</span>
                </span>
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
              <a
                href="https://github.com/search?q=SKILL.md&type=code"
                target="_blank"
                rel="noreferrer"
                className="flex items-start justify-between rounded-md border border-border px-3 py-3 text-sm text-foreground no-underline transition-colors hover:bg-accent/40"
              >
                <span>
                  <span className="block font-medium">Search GitHub</span>
                  <span className="mt-1 block text-muted-foreground">Look for repositories with `SKILL.md`, then paste the repo URL.</span>
                </span>
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            </div>
          ) : null}

          {validationError ? (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Source is not a valid Agent Skill</p>
                <p className="mt-1">{validationError}</p>
              </div>
            </div>
          ) : null}

          {verifiedPreview ? (
            <div className="space-y-3">
              <div role="status" className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="font-medium">
                  Valid Agent Skill source · {verifiedPreview.candidates.length} detected
                </span>
              </div>
              {verifiedPreview.candidates.map((candidate) => (
                <div key={candidate.key} className="space-y-2 rounded-md border border-border px-3 py-3">
                  <div>
                    <p className="font-medium text-foreground">{candidate.name}</p>
                    {candidate.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{candidate.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{compatibilityLabel(candidate.compatibility)}</Badge>
                    <Badge variant="outline">{trustLabel(candidate.trustLevel)}</Badge>
                    <Badge variant="outline">{candidate.fileCount} file{candidate.fileCount === 1 ? "" : "s"}</Badge>
                  </div>
                </div>
              ))}
              <div className="text-sm text-muted-foreground">
                {verifiedPreview.warnings.length > 0 ? (
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Warnings</p>
                    {verifiedPreview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                  </div>
                ) : (
                  <p>No validation warnings.</p>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {verifiedPreview ? (
              <Button type="submit" disabled={installPending}>
                {installPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                {installPending ? "Installing..." : "Install verified skill"}
              </Button>
            ) : (
              <Button type="submit" disabled={previewPending || source.trim().length === 0}>
                {previewPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                {previewPending ? "Verifying..." : "Verify source"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

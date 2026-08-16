import { ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MarkdownBody, type MarkdownExternalReferenceMap } from "@/components/MarkdownBody";

interface ToolActionDecisionPreviewProps {
  argumentsSummaryJson: string;
  externalReferences?: MarkdownExternalReferenceMap;
}

const SPECIAL_LABELS: Record<string, string> = {
  altText: "Image description",
  bodyMarkdown: "Body",
  imageUrl: "Image",
  instagram: "Instagram",
  naverBlog: "Naver Blog",
  platforms: "Publishing to",
  threads: "Threads",
  videoUrl: "Video",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArguments(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function fieldLabel(key: string): string {
  const special = SPECIAL_LABELS[key];
  if (special) return special;
  return key
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function isImageUrl(key: string, value: string): boolean {
  return /image|thumbnail|cover|photo/i.test(key) && /^https?:\/\//i.test(value);
}

function isVideoUrl(key: string, value: string): boolean {
  return /^https?:\/\//i.test(value)
    && (/video/i.test(key) || /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(value));
}

function isMarkdownField(key: string): boolean {
  return /markdown/i.test(key);
}

function parentAltText(parent: Record<string, unknown>): string {
  const value = parent.altText;
  if (typeof value === "string" && value.trim()) return value.trim();
  const mediaType = parent.mediaType;
  return typeof mediaType === "string" && mediaType.trim()
    ? `Instagram ${mediaType.trim()} preview`
    : "Content preview";
}

function parentCoverUrl(parent: Record<string, unknown>): string | undefined {
  const value = parent.coverUrl;
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : undefined;
}

function PlatformList({ value }: { value: unknown[] }) {
  const platforms = value.filter((entry): entry is string => typeof entry === "string");
  if (platforms.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-muted-foreground">
        Publishing to
      </span>
      {platforms.map((platform) => (
        <Badge key={platform} variant="secondary" className="font-medium">
          {fieldLabel(platform)}
        </Badge>
      ))}
    </div>
  );
}

function FieldValue({
  field,
  value,
  parent,
  externalReferences,
}: {
  field: string;
  value: unknown;
  parent: Record<string, unknown>;
  externalReferences?: MarkdownExternalReferenceMap;
}) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-muted-foreground">Not provided</span>;
  }

  if (typeof value === "string") {
    if (isVideoUrl(field, value)) {
      return (
        <figure className="overflow-hidden rounded-sm border border-border bg-black">
          <video
            src={value}
            aria-label={parentAltText(parent)}
            poster={parentCoverUrl(parent)}
            className="max-h-[32rem] w-full object-contain"
            controls
            playsInline
            preload="auto"
          >
            <a href={value} target="_blank" rel="noreferrer">Open video</a>
          </video>
        </figure>
      );
    }
    if (isImageUrl(field, value)) {
      return (
        <figure className="overflow-hidden rounded-sm border border-border bg-muted/20">
          <img
            src={value}
            alt={parentAltText(parent)}
            className="max-h-80 w-full object-contain"
            loading="lazy"
          />
        </figure>
      );
    }
    if (isMarkdownField(field)) {
      return (
        <div className="rounded-sm border border-border/70 bg-background p-3 text-sm leading-6">
          <MarkdownBody externalReferences={externalReferences}>{value}</MarkdownBody>
        </div>
      );
    }
    return (
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
        {value}
      </p>
    );
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="font-mono text-sm text-foreground">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (field === "platforms" || field === "channels") {
      return <PlatformList value={value} />;
    }
    return (
      <div className="space-y-2">
        {value.map((entry, index) => (
          <div key={`${field}-${index}`} className="rounded-sm border border-border/70 bg-background p-3">
            <FieldValue
              field={`${field} ${index + 1}`}
              value={entry}
              parent={parent}
              externalReferences={externalReferences}
            />
          </div>
        ))}
      </div>
    );
  }

  if (isRecord(value)) {
    return (
      <div className="grid gap-3">
        {Object.entries(value).map(([nestedField, nestedValue]) => (
          <section key={nestedField} className="rounded-sm border border-border/70 bg-background p-3">
            <h5 className="mb-2 text-xs font-semibold text-foreground">
              {fieldLabel(nestedField)}
            </h5>
            <FieldValue
              field={nestedField}
              value={nestedValue}
              parent={value}
              externalReferences={externalReferences}
            />
          </section>
        ))}
      </div>
    );
  }

  return null;
}

export function ToolActionDecisionPreview({
  argumentsSummaryJson,
  externalReferences,
}: ToolActionDecisionPreviewProps) {
  const parsed = parseArguments(argumentsSummaryJson);
  if (!isRecord(parsed) || Object.keys(parsed).length === 0) return null;

  const platforms = Array.isArray(parsed.platforms) ? parsed.platforms : null;
  const fields = Object.entries(parsed).filter(([key]) => key !== "platforms");

  return (
    <section
      data-testid="tool-action-decision-preview"
      className="space-y-3 rounded-sm border border-border bg-muted/20 p-4"
      aria-label="Exact action inputs"
    >
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h4 className="text-sm font-semibold text-foreground">Review exact inputs</h4>
      </div>
      {platforms ? <PlatformList value={platforms} /> : null}
      <div className="grid gap-3">
        {fields.map(([field, value]) => (
          <section key={field} className="rounded-sm border border-border/70 bg-card p-3">
            <h4 className="mb-2 text-sm font-semibold text-foreground">{fieldLabel(field)}</h4>
            <FieldValue
              field={field}
              value={value}
              parent={parsed}
              externalReferences={externalReferences}
            />
          </section>
        ))}
      </div>
    </section>
  );
}

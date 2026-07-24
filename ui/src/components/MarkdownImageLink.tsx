import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "../lib/utils";
import { resolveAppResourceUrl } from "../lib/base-path";

const IMAGE_URL_EXTENSION_RE = /\.(?:avif|gif|jpe?g|png|webp)$/i;

export function isPreviewableImageHref(href: string | undefined): href is string {
  if (!href || !URL.canParse(href, "http://paperclip.local")) return false;
  const url = new URL(href, "http://paperclip.local");
  return (url.protocol === "http:" || url.protocol === "https:")
    && IMAGE_URL_EXTENSION_RE.test(url.pathname);
}

type MarkdownImageLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "children" | "href"
> & {
  readonly href: string;
  readonly children: ReactNode;
};

export function MarkdownImageLink({
  href,
  children,
  className,
  ...anchorProps
}: MarkdownImageLinkProps) {
  const alt = typeof children === "string" || typeof children === "number"
    ? String(children)
    : "이미지 미리보기";
  const resolvedHref = resolveAppResourceUrl(href);

  return (
    <a
      {...anchorProps}
      href={resolvedHref}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "not-prose my-2 block w-full max-w-xl overflow-hidden rounded-lg border border-border/70 bg-muted/20 no-underline",
        className,
      )}
    >
      <img
        src={resolvedHref}
        alt={alt}
        loading="lazy"
        className="max-h-(--sz-32rem) w-full bg-black/5 object-contain"
      />
      <span className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2 text-sm font-medium text-foreground">
        <span className="min-w-0 flex-1 truncate">{children}</span>
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </span>
    </a>
  );
}

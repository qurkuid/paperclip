import type {
  AnchorHTMLAttributes,
  ReactNode,
} from "react";

import type { LegacySource } from "./types.js";

export function LegacyHistoryBanner({
  legacySource,
  linkProps,
  busy = false,
  onLink,
  feedback,
}: {
  readonly legacySource: LegacySource;
  readonly linkProps: (
    href: string,
  ) => AnchorHTMLAttributes<HTMLAnchorElement>;
  readonly busy?: boolean;
  readonly onLink?: () => void;
  readonly feedback?: ReactNode;
}) {
  return (
    <section className="sbe-banner" aria-label="기존 운영 기록">
      <div>
        <strong>이전 실험과 결정 기록</strong>
        <p className="sbe-help">
          이 문서는 참고용 역사 자료입니다. 자유 형식 내용은 실험 데이터로 자동 가져오지 않습니다.
        </p>
        {feedback}
      </div>
      <div className="sbe-header-actions">
        <a
          aria-label="기존 운영 문서 보기"
          className="sbe-link"
          {...linkProps(legacySource.href)}
        >
          기존 운영 문서 보기
        </a>
        {onLink ? (
          <button
            className="sbe-button"
            type="button"
            disabled={busy}
            onClick={onLink}
          >
            현재 실험에 참조 기록
          </button>
        ) : null}
      </div>
    </section>
  );
}

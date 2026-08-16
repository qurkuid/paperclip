import type { BoardActionConflictResult } from "./action-result.js";

export function ActionFeedback({
  error,
  message,
  recovery,
  onReapply,
}: {
  error: string | null;
  message: string | null;
  recovery: BoardActionConflictResult | null;
  onReapply?: () => void;
}) {
  if (recovery) {
    return (
      <div className="sbe-error" role="alert">
        <p>{recovery.message}</p>
        {onReapply ? (
          <button className="sbe-button" type="button" onClick={onReapply}>
            다시 적용
          </button>
        ) : null}
        <small>요청 ID: {recovery.requestId}</small>
      </div>
    );
  }
  if (error) return <div className="sbe-error">{error}</div>;
  if (message) return <div className="sbe-success">{message}</div>;
  return null;
}

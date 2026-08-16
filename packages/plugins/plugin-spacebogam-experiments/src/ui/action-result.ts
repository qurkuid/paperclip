const successKeys = new Set(["ok", "requestId", "experimentId", "version"]);
const failureKeys = new Set(["ok", "code", "message", "requestId", "details", "status"]);

export type BoardActionSuccessResult = {
  readonly kind: "success";
};

export type BoardActionConflictResult = {
  readonly kind: "conflict";
  readonly ok: false;
  readonly message: string;
  readonly requestId: string;
  readonly refresh: true;
  readonly reapply: true;
};

export type BoardActionFailureResult = {
  readonly kind: "failure";
  readonly ok: false;
  readonly message: string;
};

export type BoardActionResult =
  | BoardActionSuccessResult
  | BoardActionConflictResult
  | BoardActionFailureResult;

export function normalizeBoardActionResult(result: unknown): BoardActionResult {
  if (!isRecord(result)) return failure("작업 응답이 올바르지 않습니다.");
  if (result.ok === true) return isStrictSuccess(result)
    ? { kind: "success" }
    : failure("작업 응답이 올바르지 않습니다.");
  if (result.ok !== false) return failure("작업 응답이 올바르지 않습니다.");
  if (!isStrictFailure(result)) return failure("작업 거부 응답이 올바르지 않습니다.");
  const code = result.code;
  const message = result.message;
  if (code === "invalid_version" || code === "conflict" || result.status === 409) {
    return {
      kind: "conflict",
      ok: false,
      message: `최신 내용을 다시 불러왔습니다. 다시 적용하세요. ${message}`,
      requestId: result.requestId,
      refresh: true,
      reapply: true,
    };
  }
  return failure(message);
}

function isStrictSuccess(result: Record<string, unknown>): boolean {
  const version = result.version;
  return hasOnlyKeys(result, successKeys)
    && typeof result.requestId === "string"
    && typeof result.experimentId === "string"
    && typeof version === "number"
    && Number.isInteger(version)
    && version > 0;
}

function isStrictFailure(result: Record<string, unknown>): result is {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly requestId: string;
  readonly status?: number;
} {
  return hasOnlyKeys(result, failureKeys)
    && typeof result.code === "string"
    && typeof result.message === "string"
    && result.message.length > 0
    && typeof result.requestId === "string"
    && (result.status === undefined || result.status === 409);
}

function hasOnlyKeys(result: Record<string, unknown>, expected: ReadonlySet<string>): boolean {
  return Object.keys(result).every((key) => expected.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(message: string): BoardActionFailureResult {
  return { kind: "failure", ok: false, message };
}

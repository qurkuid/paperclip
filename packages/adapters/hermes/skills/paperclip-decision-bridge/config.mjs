import { UsageError } from "./errors.mjs";

const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const UUID_RE = new RegExp(`^${UUID_PATTERN}$`);
const DECISION_COMMAND_RE = new RegExp(
  `^decision (${UUID_PATTERN}):(${UUID_PATTERN}) (\\S{1,200}) (approve|reject)(?: ([^\\r\\n]{1,1000}))?$`,
);
const ISO_OFFSET_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const TELEGRAM_SENDER_RE = /^[1-9][0-9]{0,19}$/;
const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const DEFAULT_TIMEOUT_MS = 15_000;

export function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const separator = arg.indexOf("=");
    if (separator !== -1) {
      out[arg.slice(2, separator)] = arg.slice(separator + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    index += 1;
  }
  return out;
}

export function requireFlag(args, name) {
  const value = args[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new UsageError(`Missing required --${name}`);
  }
  return value.trim();
}

export function requireUuid(value, label) {
  if (!UUID_RE.test(value)) throw new UsageError(`${label} must be a UUID`);
  return value;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new UsageError(`${name} is required`);
  return value;
}

function normalizeApiBaseUrl(raw) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function normalizeBaseUrl(raw) {
  return raw.trim().replace(/\/+$/, "");
}

function parseTimeout() {
  const raw = process.env.PAPERCLIP_DECISION_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 50 || value > 60_000) {
    throw new UsageError("PAPERCLIP_DECISION_TIMEOUT_MS must be an integer from 50 to 60000");
  }
  return value;
}

function parseAllowedUsers(raw) {
  const users = raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (users.length === 0 || users.some((entry) => !TELEGRAM_SENDER_RE.test(entry))) {
    throw new UsageError("TELEGRAM_ALLOWED_USERS must contain numeric Telegram sender ids");
  }
  return new Set(users);
}

function parseCredentialMap(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError("PAPERCLIP_TELEGRAM_BOARD_CREDENTIALS must be valid JSON");
  }
  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    throw new UsageError("PAPERCLIP_TELEGRAM_BOARD_CREDENTIALS must be a JSON object");
  }
  const entries = Object.entries(parsed);
  if (
    entries.length === 0
    || entries.some(([sender, credential]) =>
      !TELEGRAM_SENDER_RE.test(sender)
      || typeof credential !== "string"
      || credential.trim().length === 0
    )
  ) {
    throw new UsageError(
      "PAPERCLIP_TELEGRAM_BOARD_CREDENTIALS must map numeric sender ids to board credentials",
    );
  }
  return new Map(entries.map(([sender, credential]) => [sender, credential.trim()]));
}

export function getIdentityConfig(sender) {
  if (!TELEGRAM_SENDER_RE.test(sender)) {
    throw new UsageError("--sender must be a numeric Telegram sender id");
  }
  const allowedUsers = parseAllowedUsers(requireEnv("TELEGRAM_ALLOWED_USERS"));
  if (!allowedUsers.has(sender)) {
    throw new UsageError("Telegram sender is not allowlisted");
  }
  const credentials = parseCredentialMap(requireEnv("PAPERCLIP_TELEGRAM_BOARD_CREDENTIALS"));
  const boardCredential = credentials.get(sender);
  if (!boardCredential) {
    throw new UsageError("Telegram sender has no mapped Paperclip board credential");
  }
  const disallowedCredentials = [
    process.env.PAPERCLIP_BRIDGE_API_KEY?.trim(),
    process.env.PAPERCLIP_API_KEY?.trim(),
  ].filter(Boolean);
  if (disallowedCredentials.includes(boardCredential)) {
    throw new UsageError("Telegram sender must use a dedicated Paperclip board credential");
  }
  return {
    apiBaseUrl: normalizeApiBaseUrl(requireEnv("PAPERCLIP_API_URL")),
    boardCredential,
    timeoutMs: parseTimeout(),
  };
}

export function getSendConfig(sender) {
  const identity = getIdentityConfig(sender);
  return {
    ...identity,
    telegramToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    telegramChannel: requireEnv("TELEGRAM_HOME_CHANNEL"),
    telegramApiBaseUrl: normalizeBaseUrl(
      process.env.TELEGRAM_API_BASE_URL?.trim() || DEFAULT_TELEGRAM_API_BASE_URL,
    ),
    stateFile: requireEnv("PAPERCLIP_TELEGRAM_STATE_FILE"),
  };
}

export function parseDecisionCommand(raw) {
  const match = DECISION_COMMAND_RE.exec(raw);
  if (!match) {
    throw new UsageError("Use the exact decision command syntax");
  }
  const [, issueId, interactionId, expectedRevision, action, note] = match;
  if (
    !ISO_OFFSET_DATETIME_RE.test(expectedRevision)
    || !Number.isFinite(Date.parse(expectedRevision))
    || (action === "approve" && note !== undefined)
  ) {
    throw new UsageError("Use the exact decision command syntax");
  }
  return {
    issueId,
    interactionId,
    expectedRevision,
    action,
    note: note?.trim() || null,
  };
}

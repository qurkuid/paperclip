import { OperationError } from "./errors.mjs";

async function fetchWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch {
    throw new OperationError(`${label} request failed`);
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonResponse(response, label) {
  try {
    return await response.json();
  } catch {
    throw new OperationError(`${label} returned an invalid response`);
  }
}

export async function paperclipFetch(config, route, options = {}) {
  const response = await fetchWithTimeout(
    `${config.apiBaseUrl}${route}`,
    {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.boardCredential}`,
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    config.timeoutMs,
    "Paperclip API",
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new OperationError(`Paperclip API request failed with status ${response.status}`);
  }
  return readJsonResponse(response, "Paperclip API");
}

export async function telegramFetch(config, method, body) {
  const response = await fetchWithTimeout(
    `${config.telegramApiBaseUrl}/bot${config.telegramToken}/${method}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    config.timeoutMs,
    "Telegram API",
  );
  // Re-delivering an unchanged decision is a no-op, but Telegram answers the
  // identical edit with 400 "message is not modified". Treat that one case as
  // success so a repeat sweep stays idempotent.
  if (response.status === 400) {
    const failure = await readJsonResponse(response, "Telegram API").catch(() => null);
    if (
      typeof failure?.description === "string"
      && failure.description.includes("message is not modified")
    ) {
      return { ok: true, unchanged: true };
    }
    throw new OperationError("Telegram API request failed with status 400");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new OperationError(`Telegram API request failed with status ${response.status}`);
  }
  const result = await readJsonResponse(response, "Telegram API");
  if (result?.ok !== true) {
    throw new OperationError("Telegram API request failed");
  }
  return result;
}

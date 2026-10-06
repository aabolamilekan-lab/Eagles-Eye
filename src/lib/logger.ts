/**
 * Structured server logger.
 *
 * Writes one JSON line per event to stdout (info) or stderr (warn, error).
 * Sensitive keys are redacted before serialization, so a caller cannot leak a
 * password, hash, token, cookie, or secret by passing a whole object. No
 * `console.log` is used anywhere (AGENTS.md section 13).
 *
 * The logger is deliberately small: it correlates events by the fields a caller
 * provides, including a request id where one exists.
 */
const SENSITIVE_KEY = /pass|secret|token|cookie|authorization|hash|session/i;
const MAX_DEPTH = 4;
const MAX_ARRAY = 40;

type Fields = Record<string, unknown>;
type Level = "info" | "warn" | "error";

function sanitize(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => sanitize(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(item, depth + 1);
  }
  return result;
}

/** Redact sensitive keys from a plain object. Exported for unit tests. */
export function redactFields(fields: Fields): Fields {
  return sanitize(fields, 0) as Fields;
}

function emit(level: Level, event: string, fields?: Fields): void {
  const payload: Record<string, unknown> = {
    level,
    event,
    time: new Date().toISOString(),
    ...(fields ? redactFields(fields) : {}),
  };

  const line = `${JSON.stringify(payload)}\n`;
  if (level === "info") {
    process.stdout.write(line);
    return;
  }
  process.stderr.write(line);
}

export const logger = {
  info: (event: string, fields?: Fields): void => emit("info", event, fields),
  warn: (event: string, fields?: Fields): void => emit("warn", event, fields),
  error: (event: string, fields?: Fields): void => emit("error", event, fields),
};

import "server-only";

/**
 * Error Sanitization Utility for News Aggregation & Synchronization.
 *
 * Ensures error messages persisted in NewsSyncLog, NewsSource, or displayed to
 * administrators never leak secrets, connection strings, auth headers, API keys,
 * or server environment details. AGENTS.md section 13.
 */

const MAX_ERROR_MESSAGE_LENGTH = 500;

export function sanitizeSyncErrorMessage(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }

  let message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error);

  // 1. Redact PostgreSQL, MySQL, and generic DB connection strings
  message = message.replace(
    /(?:postgres(?:ql)?|mysql|sqlite|mongodb(?:\+srv)?):\/\/[^\s"']+/gi,
    "[REDACTED_DATABASE_URL]",
  );

  // 2. Redact Authorization Bearer and Basic tokens
  message = message.replace(
    /Bearer\s+[A-Za-z0-9_\-.~+/]+=*/gi,
    "Bearer [REDACTED_TOKEN]",
  );
  message = message.replace(
    /Basic\s+[A-Za-z0-9+/]+=*/gi,
    "Basic [REDACTED_TOKEN]",
  );

  // 3. Redact common secret/credential key-value pairs
  message = message.replace(
    /(?:authorization|auth-token|secret|token|api[_-]?key|password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;]+["']?/gi,
    (match) => {
      const prefix = match.split(/[:=]/)[0]?.trim();
      return `${prefix}=[REDACTED]`;
    },
  );

  // 4. Redact query parameters that might carry secrets (e.g. ?key=... or &api_key=...)
  message = message.replace(
    /([?&](?:api[_-]?key|token|key|secret|password|sig)=)[^&\s"']+/gi,
    "$1[REDACTED]",
  );

  // 5. Redact local file system paths that could leak local usernames or directory layouts
  message = message.replace(
    /(?:[a-zA-Z]:\\[^:<>"|?*\n\r]+|\/(?:Users|home|root|app)\/[^\s:]+)/gi,
    "[REDACTED_PATH]",
  );

  // 6. Clamp length to prevent log / database bloat
  if (message.length > MAX_ERROR_MESSAGE_LENGTH) {
    message = `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`;
  }

  return message.trim();
}

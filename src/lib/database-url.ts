/**
 * Database connection-string tuning.
 *
 * Prisma ships conservative connection defaults that are tuned for a
 * long-lived server with a local database. On managed, pooled PostgreSQL
 * (for example Neon's `-pooler` endpoint) the defaults can surface as
 * `P2024` (the pool waited past its timeout for a free connection) and
 * `P1001` (a cold or briefly unreachable compute). We add sane, overridable
 * pool and timeout parameters so the driver waits long enough to acquire a
 * connection and to establish one, without ever overriding a value the
 * operator has already chosen.
 *
 * The helper is pure and takes the environment explicitly so the arithmetic
 * can be pinned by unit tests.
 */

const DEFAULT_CONNECTION_LIMIT = "10";
const DEFAULT_POOL_TIMEOUT_SECONDS = "20";
const DEFAULT_CONNECT_TIMEOUT_SECONDS = "15";

type Env = Readonly<Record<string, string | undefined>>;

export function withResilientConnectionParams(
  rawUrl: string | undefined,
  env: Env = process.env,
): string | undefined {
  if (!rawUrl || !/^postgres(ql)?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }

  const separatorIndex = rawUrl.indexOf("?");
  const base = separatorIndex === -1 ? rawUrl : rawUrl.slice(0, separatorIndex);
  const query = separatorIndex === -1 ? "" : rawUrl.slice(separatorIndex + 1);
  const params = new URLSearchParams(query);

  const defaults: Array<[string, string]> = [
    [
      "connection_limit",
      env.DATABASE_CONNECTION_LIMIT ?? DEFAULT_CONNECTION_LIMIT,
    ],
    ["pool_timeout", env.DATABASE_POOL_TIMEOUT ?? DEFAULT_POOL_TIMEOUT_SECONDS],
    [
      "connect_timeout",
      env.DATABASE_CONNECT_TIMEOUT ?? DEFAULT_CONNECT_TIMEOUT_SECONDS,
    ],
  ];

  for (const [key, value] of defaults) {
    if (!params.has(key)) {
      params.set(key, value);
    }
  }

  const suffix = params.toString();
  return suffix.length > 0 ? `${base}?${suffix}` : base;
}

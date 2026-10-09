import { describe, expect, it } from "vitest";
import { withResilientConnectionParams } from "@/lib/database-url";

const EMPTY_ENV: Record<string, string | undefined> = {};

function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

describe("withResilientConnectionParams", () => {
  it("leaves a missing URL untouched", () => {
    expect(withResilientConnectionParams(undefined, EMPTY_ENV)).toBeUndefined();
  });

  it("leaves non-PostgreSQL schemes untouched", () => {
    expect(
      withResilientConnectionParams("prisma://accelerate.example/db", EMPTY_ENV),
    ).toBe("prisma://accelerate.example/db");
  });

  it("adds pool and timeout defaults when none are present", () => {
    const result = withResilientConnectionParams(
      "postgresql://user:pass@localhost:5432/db",
      EMPTY_ENV,
    );
    expect(result).toBeDefined();
    const params = paramsOf(result as string);
    expect(params.get("connection_limit")).toBe("10");
    expect(params.get("pool_timeout")).toBe("20");
    expect(params.get("connect_timeout")).toBe("15");
  });

  it("preserves existing query parameters", () => {
    const result = withResilientConnectionParams(
      "postgresql://user:pass@host:5432/db?schema=public&sslmode=require",
      EMPTY_ENV,
    ) as string;
    const params = paramsOf(result);
    expect(params.get("schema")).toBe("public");
    expect(params.get("sslmode")).toBe("require");
    expect(params.get("connection_limit")).toBe("10");
    expect(result.startsWith("postgresql://user:pass@host:5432/db?")).toBe(true);
  });

  it("does not override values the operator already set", () => {
    const result = withResilientConnectionParams(
      "postgresql://user:pass@host:5432/db?connection_limit=2&pool_timeout=5&connect_timeout=3",
      EMPTY_ENV,
    ) as string;
    const params = paramsOf(result);
    expect(params.get("connection_limit")).toBe("2");
    expect(params.get("pool_timeout")).toBe("5");
    expect(params.get("connect_timeout")).toBe("3");
  });

  it("honours environment overrides", () => {
    const result = withResilientConnectionParams(
      "postgresql://user:pass@host:5432/db",
      {
        DATABASE_CONNECTION_LIMIT: "25",
        DATABASE_POOL_TIMEOUT: "30",
        DATABASE_CONNECT_TIMEOUT: "45",
      },
    ) as string;
    const params = paramsOf(result);
    expect(params.get("connection_limit")).toBe("25");
    expect(params.get("pool_timeout")).toBe("30");
    expect(params.get("connect_timeout")).toBe("45");
  });
});

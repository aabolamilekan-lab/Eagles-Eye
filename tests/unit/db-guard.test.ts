import { describe, expect, it } from "vitest";
import {
  ALLOWED_LOCAL_HOSTS,
  parseDotEnv,
  validateDatabaseTarget,
} from "../../scripts/db-guard";

describe("Database Safety Guard - validateDatabaseTarget", () => {
  it("verifies ALLOWED_LOCAL_HOSTS contains only expected local entries", () => {
    expect(ALLOWED_LOCAL_HOSTS.has("localhost")).toBe(true);
    expect(ALLOWED_LOCAL_HOSTS.has("127.0.0.1")).toBe(true);
    expect(ALLOWED_LOCAL_HOSTS.has("neon.tech")).toBe(false);
  });

  it("approves standard localhost URLs", () => {
    const res = validateDatabaseTarget("postgresql://postgres:pass@localhost:5432/eagles_eye?schema=public");
    expect(res.ok).toBe(true);
    expect(res.hostname).toBe("localhost");
  });

  it("approves 127.0.0.1 loopback address", () => {
    const res = validateDatabaseTarget("postgres://user:secret@127.0.0.1:5432/test_db");
    expect(res.ok).toBe(true);
    expect(res.hostname).toBe("127.0.0.1");
  });

  it("approves IPv6 loopback [::1]", () => {
    const res = validateDatabaseTarget("postgresql://user:secret@[::1]:5432/test_db");
    expect(res.ok).toBe(true);
    expect(res.hostname).toBe("[::1]");
  });

  it("approves Docker/container local hostnames in allowlist", () => {
    for (const host of ["host.docker.internal", "postgres", "db"]) {
      const res = validateDatabaseTarget(`postgresql://user:secret@${host}:5432/test_db`);
      expect(res.ok).toBe(true);
      expect(res.hostname).toBe(host);
    }
  });

  it("handles case-insensitive hostnames and protocols", () => {
    const res = validateDatabaseTarget("POSTGRESQL://user:secret@LOCALHOST:5432/db");
    expect(res.ok).toBe(true);
    expect(res.hostname).toBe("localhost");
  });

  it("strictly rejects remote Neon database endpoints", () => {
    const remoteUrl =
      "postgresql://neondb_owner:dummySecret@ep-noisy-hall-za92iwpg-pooler.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require";
    const res = validateDatabaseTarget(remoteUrl);
    expect(res.ok).toBe(false);
    expect(res.hostname).toBe("ep-noisy-hall-za92iwpg-pooler.c-2.eu-west-2.aws.neon.tech");
    expect(res.reason).toContain("not in the approved local host allowlist");
  });

  it("strictly rejects AWS RDS, Supabase, and general cloud databases", () => {
    const urls = [
      "postgresql://user:pass@db.myproject.supabase.co:5432/postgres",
      "postgresql://user:pass@my-db.c9akj2kl.us-east-1.rds.amazonaws.com:5432/db",
      "postgres://user:pass@render-db.oregon-postgres.render.com/db",
    ];
    for (const url of urls) {
      const res = validateDatabaseTarget(url);
      expect(res.ok).toBe(false);
      expect(res.reason).toContain("not in the approved local host allowlist");
    }
  });

  describe("Bypass and Deception Protection", () => {
    it("rejects subdomain deception (e.g. localhost.neon.tech)", () => {
      const res = validateDatabaseTarget("postgresql://user:pass@localhost.neon.tech:5432/db");
      expect(res.ok).toBe(false);
      expect(res.hostname).toBe("localhost.neon.tech");
    });

    it("rejects username containing localhost pointing to remote host", () => {
      const res = validateDatabaseTarget("postgresql://localhost:secret@neon.tech:5432/db");
      expect(res.ok).toBe(false);
      expect(res.hostname).toBe("neon.tech");
    });

    it("rejects path/database containing localhost pointing to remote host", () => {
      const res = validateDatabaseTarget("postgresql://user:pass@ep-remote.neon.tech:5432/localhost");
      expect(res.ok).toBe(false);
      expect(res.hostname).toBe("ep-remote.neon.tech");
    });

    it("rejects query parameter containing localhost pointing to remote host", () => {
      const res = validateDatabaseTarget("postgresql://user:pass@ep-remote.neon.tech:5432/db?overrideHost=localhost");
      expect(res.ok).toBe(false);
      expect(res.hostname).toBe("ep-remote.neon.tech");
    });

    it("rejects domains with localhost prefix or suffix (e.g. localhost.com or not-localhost)", () => {
      const resA = validateDatabaseTarget("postgresql://user:pass@localhost.com:5432/db");
      expect(resA.ok).toBe(false);

      const resB = validateDatabaseTarget("postgresql://user:pass@evil-localhost:5432/db");
      expect(resB.ok).toBe(false);
    });

    it("rejects unsupported protocols even if host is localhost", () => {
      const resHttp = validateDatabaseTarget("http://localhost:5432/db");
      expect(resHttp.ok).toBe(false);
      expect(resHttp.reason).toContain("Unsupported database protocol");

      const resMysql = validateDatabaseTarget("mysql://localhost:3306/db");
      expect(resMysql.ok).toBe(false);
      expect(resMysql.reason).toContain("Unsupported database protocol");
    });
  });

  describe("Fail-Closed Validation on Invalid / Missing Input", () => {
    it("fails closed on undefined", () => {
      const res = validateDatabaseTarget(undefined);
      expect(res.ok).toBe(false);
      expect(res.reason).toContain("DATABASE_URL is not set");
    });

    it("fails closed on empty string or whitespace", () => {
      expect(validateDatabaseTarget("").ok).toBe(false);
      expect(validateDatabaseTarget("   ").ok).toBe(false);
    });

    it("fails closed on malformed non-URL strings", () => {
      expect(validateDatabaseTarget("not-a-url").ok).toBe(false);
      expect(validateDatabaseTarget("postgresql://").ok).toBe(false);
      expect(validateDatabaseTarget("postgres://:5432").ok).toBe(false);
    });
  });
});

describe("Database Safety Guard - parseDotEnv", () => {
  it("parses unquoted and quoted variables accurately", () => {
    const raw = `
# Comment line
DATABASE_URL="postgresql://postgres:pass@localhost:5432/db?schema=public"
AUTH_SECRET='my-secret-key-32-characters-long!!'
PORT=3000 # inline comment
EMPTY_VAR=
`;
    const parsed = parseDotEnv(raw);
    expect(parsed.DATABASE_URL).toBe("postgresql://postgres:pass@localhost:5432/db?schema=public");
    expect(parsed.AUTH_SECRET).toBe("my-secret-key-32-characters-long!!");
    expect(parsed.PORT).toBe("3000");
    expect(parsed.EMPTY_VAR).toBe("");
  });
});

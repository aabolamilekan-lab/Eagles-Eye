import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guarantees about how HTML reaches a browser.
 *
 * These are the rules from AGENTS.md section 10 stated as tests, because they
 * are the kind of rule that decays silently: nothing fails when a fourth
 * `dangerouslySetInnerHTML` appears, or when a sanitizer override is threaded
 * through a component.
 */

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = sourceFiles(SRC);

describe("rich text rendering", () => {
  it("uses dangerouslySetInnerHTML in only the two sanctioned places", () => {
    // `RichText` for stored chapter HTML, `JsonLd` for structured data built
    // server-side from published values. Anything else is a review blocker.
    const offenders = files
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        // A mention inside a comment is not a usage.
        return source
          .split("\n")
          .some((line) => !line.trim().startsWith("*") && line.includes("dangerouslySetInnerHTML"));
      })
      .map((file) => relative(process.cwd(), file).split(/[\\/]/).join("/"));

    expect(offenders.sort()).toEqual([
      "src/components/chapters/RichText.tsx",
      "src/components/seo/JsonLd.tsx",
    ]);
  });

  it("exposes no way to bypass the sanitizer", () => {
    // The removed prop let a caller render stored HTML verbatim, which is the
    // one guarantee this component exists to provide.
    const source = readFileSync(join(SRC, "components", "chapters", "RichText.tsx"), "utf8");
    expect(source).not.toContain("sanitizeOnRender");
  });

  it("sanitizes on render with the shared allowlist", () => {
    const source = readFileSync(join(SRC, "components", "chapters", "RichText.tsx"), "utf8");
    expect(source).toContain("sanitizeRichText(html");
  });
});

describe("JSON-LD is the only other sanctioned script injection", () => {
  it("lives in one component and escapes the script element", () => {
    const source = readFileSync(join(SRC, "components", "seo", "JsonLd.tsx"), "utf8");
    expect(source).toContain("dangerouslySetInnerHTML");
    // A `<` inside a serialized value would end the script element and let a
    // story title become markup.
    expect(source).toMatch(/\\u003c|replace\(/);
  });
});

describe("no debug leftovers", () => {
  it("contains no console calls in src", () => {
    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").split("\n").some((line) => {
        const code = line.replace(/\/\/.*$/, "");
        return /(^|[^.\w])console\.(log|debug|info|warn|error)\(/.test(code);
      }),
    );
    expect(offenders.map((f) => relative(process.cwd(), f))).toEqual([]);
  });

  it("contains no focused or skipped tests in src", () => {
    const offenders = files.filter((file) => /\.(only|skip)\(/.test(readFileSync(file, "utf8")));
    expect(offenders.map((f) => relative(process.cwd(), f))).toEqual([]);
  });
});

describe("a cover is never a remote host", () => {
  it("accepts no external image URL in story validation", () => {
    const source = readFileSync(join(SRC, "lib", "validation", "story.ts"), "utf8");
    // Removing this is what closed the open-image-proxy surface.
    expect(source).not.toContain("COVER_HTTP");
  });

  it("configures no next/image remote allowlist", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    // A remotePatterns entry is what would turn the optimizer into a fetch
    // primitive pointed at any hostname an admin names.
    expect(config).not.toContain("remotePatterns");
  });

  it("keeps cover keys server-generated and WebP-only", () => {
    const source = readFileSync(join(SRC, "lib", "storage", "covers.ts"), "utf8");
    expect(source).toContain("randomUUID()");
    expect(source).toContain(".webp");
  });
});

describe("privileged code paths are all gated", () => {
  it("gives every mutating server action a write-budget check", () => {
    const actionDir = join(SRC, "actions");
    const offenders: string[] = [];

    for (const file of sourceFiles(actionDir)) {
      const source = readFileSync(file, "utf8");
      const relative_ = relative(actionDir, file);
      // Auth actions are the exception: login is the credential check and
      // logout needs only a session to revoke.
      if (relative_.startsWith("auth")) {
        continue;
      }
      const actions = source.match(/export async function \w+/g) ?? [];
      // Only `requireWriteCapability` spends write budget, so it is the only
      // call that proves a mutation was counted.
      const guards = source.match(/requireWriteCapability\(/g) ?? [];
      // Thin wrappers delegate to a shared runner that holds the guard.
      if (actions.length > guards.length) {
        const delegates = source.match(/return runStatusAction\(/g) ?? [];
        if (actions.length > guards.length + delegates.length) {
          offenders.push(relative_);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps page renders off the write budget", () => {
    // An admin browsing the dashboard must not exhaust the write allowance,
    // so page guards use the read-only `requireCapability`.
    const offenders: string[] = [];

    for (const file of sourceFiles(join(SRC, "app"))) {
      const source = readFileSync(file, "utf8");
      if (source.includes("requireWriteCapability")) {
        offenders.push(relative(join(SRC, "app"), file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the two guard functions distinct", () => {
    const source = readFileSync(join(SRC, "lib", "auth", "guards.ts"), "utf8");
    // If authorization started charging again, reads would silently throttle
    // writes. The read gate must not call the budget.
    const readGate = source.slice(
      source.indexOf("export async function requireCapability"),
      source.indexOf("export async function requireWriteCapability"),
    );
    expect(readGate).not.toContain("chargeWriteBudget");
  });
});

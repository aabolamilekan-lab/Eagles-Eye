import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";

/**
 * Malicious rich-text payloads against the server sanitizer.
 *
 * Complements `chapter-reader.test.ts`: those tests pin the shape of the
 * allowlist, these pin the refusals an attacker would actually try — obfuscated
 * schemes, embedded handlers, dropping elements and CSS/JS breakout attempts.
 */
describe("sanitizeRichText — malicious content", () => {
  it("strips an obfuscated javascript href with embedded whitespace", () => {
    const clean = sanitizeRichText('<a href="java\tscript:alert(1)">x</a>');

    expect(clean).not.toMatch(/javascript/i);
    expect(clean).toContain(">x</a>");
  });

  it("strips an entity-encoded javascript scheme", () => {
    const clean = sanitizeRichText('<a href="javascript&#58;alert(1)">x</a>');

    expect(clean).not.toMatch(/javascript/i);
  });

  it("strips a vbscript href", () => {
    const clean = sanitizeRichText('<a href="vbscript:msgbox(1)">x</a>');

    expect(clean).not.toContain("vbscript:");
  });

  it("strips a data: image source, an event handler and a protocol-relative src", () => {
    const clean = sanitizeRichText(
      '<img src="data:image/svg+xml;base64,AAAA" onerror="alert(1)" alt="x">',
    );

    expect(clean).not.toContain("data:");
    expect(clean).not.toContain("onerror");
    expect(clean).toContain('alt="x"');
  });

  it("rejects a protocol-relative image source", () => {
    const clean = sanitizeRichText('<img src="//evil.test/a.png" alt="a">');

    expect(clean).not.toContain("evil.test");
  });

  it("rejects a mailto image source (images are web-only)", () => {
    const clean = sanitizeRichText('<img src="mailto:x@example.com" alt="a">');

    expect(clean).not.toContain("mailto:");
  });

  it("still allows a mailto link", () => {
    const clean = sanitizeRichText('<a href="mailto:x@example.com">x</a>');

    expect(clean).toContain('href="mailto:x@example.com"');
  });

  it("removes an svg payload and its contents", () => {
    const clean = sanitizeRichText(
      '<p>before</p><svg onload="alert(1)"><circle /></svg><p>after</p>',
    );

    expect(clean).not.toContain("svg");
    expect(clean).not.toContain("onload");
    expect(clean).toContain("<p>before</p>");
    expect(clean).toContain("<p>after</p>");
  });

  it.each([
    "script",
    "style",
    "iframe",
    "object",
    "form",
    "textarea",
    "template",
    "noscript",
  ])("drops <%s> and its contents", (tag) => {
    const clean = sanitizeRichText(`<p>keep</p><${tag}>payload</${tag}>`);

    expect(clean).not.toContain(`<${tag}`);
    expect(clean).not.toContain("payload");
    expect(clean).toContain("<p>keep</p>");
  });

  it("drops a void embed element", () => {
    const clean = sanitizeRichText('<p>keep</p><embed src="evil.swf">');

    expect(clean).not.toContain("<embed");
    expect(clean).toContain("<p>keep</p>");
  });

  it("strips style attributes", () => {
    expect(sanitizeRichText('<p style="position:fixed;top:0">x</p>')).toBe(
      "<p>x</p>",
    );
  });

  it("keeps only the alignment declaration when a style carries others", () => {
    const clean = sanitizeRichText(
      '<p style="color:red;text-align:center;background-image:url(https://evil.test/a)">x</p>',
    );

    expect(clean).toBe('<p style="text-align:center">x</p>');
  });

  it("drops a text-align value that is not on the allowlist", () => {
    expect(sanitizeRichText('<p style="text-align: expression(alert(1))">x</p>')).toBe(
      "<p>x</p>",
    );
    expect(sanitizeRichText('<p style="text-align: url(#x)">x</p>')).toBe("<p>x</p>");
    expect(sanitizeRichText('<p style="text-align: CENTER">x</p>')).toBe("<p>x</p>");
  });

  it("refuses a style attribute on a tag outside the style allowlist", () => {
    const clean = sanitizeRichText(
      '<a href="https://example.test" style="text-align: center">x</a>',
    );

    expect(clean).not.toContain("style");
    expect(clean).toContain('href="https://example.test"');
  });

  it("strips an srcdoc breakout attempt", () => {
    const clean = sanitizeRichText(
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    );

    expect(clean).not.toContain("srcdoc");
    expect(clean).not.toContain("alert");
  });

  it("removes comments and a doctype", () => {
    expect(sanitizeRichText("<!DOCTYPE html><!-- tracker --><p>x</p>")).toBe(
      "<p>x</p>",
    );
  });

  it("preserves the allowed long-form formatting surface", () => {
    const clean = sanitizeRichText(
      "<h2>H</h2><p><strong>a</strong> <em>b</em></p>" +
        "<ul><li>i</li></ul><blockquote>q</blockquote><hr>",
    );

    expect(clean).toContain("<h2>H</h2>");
    expect(clean).toContain("<strong>a</strong>");
    expect(clean).toContain("<em>b</em>");
    expect(clean).toContain("<ul><li>i</li></ul>");
    expect(clean).toContain("<blockquote>q</blockquote>");
    expect(clean).toContain("<hr");
  });

  it("allows an https image source", () => {
    const clean = sanitizeRichText(
      '<img src="https://cdn.example.com/a.png" alt="a" width="10" height="10">',
    );

    expect(clean).toContain('src="https://cdn.example.com/a.png"');
    expect(clean).toContain('alt="a"');
  });
});

/**
 * The other half of the contract: everything an editor session legitimately
 * produces must survive untouched, and sanitizing already-clean markup must
 * never drift. A sanitizer that is only proven to refuse is one rewrite away
 * from refusing the wrong thing.
 */
describe("sanitizeRichText — normal formatted content", () => {
  const chapter = [
    "<h2>The crossing</h2>",
    "<p><strong>Night fell</strong> and the <em>lamp</em> went out.</p>",
    '<p style="text-align:center">Meanwhile</p>',
    "<ul><li>First watch</li><li>Second watch</li></ul>",
    "<ol><li>Row</li><li>Rest</li></ol>",
    "<blockquote>Hold fast.</blockquote>",
    '<p><a href="https://example.test/log" rel="noopener noreferrer">the log</a></p>',
    "<hr />",
    "<p>After the storm.</p>",
  ].join("");

  it("preserves the whole formatted document unchanged", () => {
    expect(sanitizeRichText(chapter)).toBe(chapter);
  });

  it("is idempotent: sanitizing twice matches sanitizing once", () => {
    const once = sanitizeRichText(chapter);

    expect(sanitizeRichText(once)).toBe(once);
  });

  it("shifts only the headings when the reader view renders it", () => {
    const rendered = sanitizeRichText(chapter, { headingOffset: 1 });

    expect(rendered).toContain("<h3>The crossing</h3>");
    expect(rendered).toContain('<p style="text-align:center">Meanwhile</p>');
    expect(rendered).toContain("<strong>Night fell</strong>");
    expect(rendered).toContain("<blockquote>Hold fast.</blockquote>");
    expect(rendered).toContain("<hr />");
  });
});

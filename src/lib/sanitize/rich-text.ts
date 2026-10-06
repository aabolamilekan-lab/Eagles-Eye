import sanitizeHtml from "sanitize-html";

/**
 * Server-side rich-text sanitizer.
 *
 * AGENTS.md section 10: all rich text is untrusted, regardless of who typed
 * it. This is the single owner of the allowlist, so a tag or scheme is added
 * in one place and cannot drift between call sites.
 *
 * The allowlist is positive: anything not named here is stripped, including
 * `on*` event handlers, `javascript:` and `data:` URLs, `<script>`, `<style>`,
 * `<iframe>` and unknown attributes. `sanitize-html` never evaluates content.
 *
 * `headingOffset` remaps stored heading levels so the rendered document keeps a
 * single `<h1>` (the page title) and never skips a level. The chapter reader
 * passes `1`, turning a stored `<h1>` into `<h2>` and a stored `<h2>` into
 * `<h3>`.
 */
export interface SanitizeRichTextOptions {
  /**
   * Number of levels to push headings down. `0` leaves them unchanged. Levels
   * are clamped at `h6`.
   */
  headingOffset?: number;
}

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "mark",
  "small",
  "sup",
  "sub",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "cite",
  "code",
  "pre",
  "a",
  "figure",
  "figcaption",
  "img",
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "title", "rel"],
  img: ["src", "alt", "title", "width", "height"],
};

/** No `data:` or `javascript:`; protocol-relative URLs are rejected too. */
const ALLOWED_SCHEMES = ["http", "https", "mailto"];

/**
 * Images may only reference the open web. `mailto:` is meaningless for a
 * `src`, so it is not offered there even though links accept it.
 */
const ALLOWED_SCHEMES_BY_TAG: Record<string, string[]> = {
  img: ["http", "https"],
};

/** Tags whose contents are dropped entirely rather than unwrapped. */
const NON_TEXT_TAGS = [
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "portal",
  "form",
  "noscript",
  "template",
  "textarea",
  "option",
  "svg",
  "math",
];

const LINK_REL = "noopener noreferrer";

function headingTransforms(offset: number): Record<string, string> {
  if (offset <= 0) {
    return {};
  }

  const transforms: Record<string, string> = {};
  for (let level = 1; level <= 6; level += 1) {
    transforms[`h${level}`] = `h${Math.min(level + offset, 6)}`;
  }
  return transforms;
}

/**
 * Every link is forced onto a known-safe `rel`, so `target="_blank"` (present
 * or not) cannot hand the opened page a `window.opener` reference.
 */
const anchorTransform: sanitizeHtml.Transformer = (tagName, attribs) => ({
  tagName,
  attribs: { ...attribs, rel: LINK_REL },
});

/**
 * Sanitize stored rich text against the allowlist.
 *
 * Never throws for malformed markup: `sanitize-html` parses defensively and
 * returns the clean subset.
 */
export function sanitizeRichText(
  html: string,
  options: SanitizeRichTextOptions = {},
): string {
  const { headingOffset = 0 } = options;

  const config: sanitizeHtml.IOptions = {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: ALLOWED_SCHEMES_BY_TAG,
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: NON_TEXT_TAGS,
    transformTags: {
      ...headingTransforms(headingOffset),
      a: anchorTransform,
    },
  };

  return sanitizeHtml(html, config);
}

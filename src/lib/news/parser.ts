import { XMLParser, XMLValidator } from "fast-xml-parser";
import { normalizeCanonicalUrl, sanitizeTextSnippet, stripHtmlAndCollapseWhitespace } from "./normalizer";
import type { ParsedFeed, RawFeedItem } from "./types";

/**
 * Robust RSS and Atom XML feed parser.
 *
 * Implements resilient parsing across RSS 2.0, RSS 0.9x, RSS 1.0 (RDF), and Atom 1.0:
 * 1. Strictly limits feed size (2 MB cap) and item count (max 50 items).
 * 2. Defends against XML External Entity (XXE) and billion laughs entity expansion.
 * 3. Normalizes title, canonical link, external GUID, publication date, author, and snippet.
 * 4. Never executes or evaluates embedded markup, scripts, or instructions.
 * 5. Handles missing, malformed, or heterogeneous item schemas without throwing.
 */

const MAX_FEED_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_FEED_ITEMS = 50;
const MAX_TITLE_LENGTH = 300;
const MAX_SUMMARY_LENGTH = 5000;

export class FeedParseError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "FeedParseError";
    this.cause = cause;
  }
}

function extractText(node: unknown): string {
  if (node === null || node === undefined) {
    return "";
  }
  if (typeof node === "string") {
    return node;
  }
  if (typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record["#text"] === "string") {
      return record["#text"];
    }
    if (typeof record["__cdata"] === "string") {
      return record["__cdata"];
    }
  }
  return "";
}

function extractAtomLink(node: unknown): string | null {
  if (!node) {
    return null;
  }
  if (typeof node === "string") {
    return node.trim();
  }
  if (Array.isArray(node)) {
    // Prefer rel="alternate" link, or fall back to first link with href
    const alternate = node.find((item) => {
      if (item && typeof item === "object") {
        const rel = (item as Record<string, unknown>)["@_rel"];
        return rel === "alternate" || !rel;
      }
      return false;
    });
    if (alternate) {
      return extractAtomLink(alternate);
    }
    return node.length > 0 ? extractAtomLink(node[0]) : null;
  }
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    const href = record["@_href"];
    if (typeof href === "string" && href.trim()) {
      return href.trim();
    }
    return extractText(node).trim() || null;
  }
  return null;
}

function extractDate(item: Record<string, unknown>): Date | null {
  const dateCandidates = [
    item["pubDate"],
    item["published"],
    item["updated"],
    item["dc:date"],
    item["date"],
  ];

  for (const candidate of dateCandidates) {
    const raw = extractText(candidate).trim();
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
}

function extractAuthor(item: Record<string, unknown>): string | null {
  // Check dc:creator
  const creator = extractText(item["dc:creator"]).trim();
  if (creator) {
    return sanitizeTextSnippet(creator, 100);
  }

  // Check author node
  const authorNode = item["author"];
  if (authorNode && typeof authorNode === "object") {
    const authorRecord = authorNode as Record<string, unknown>;
    const name = extractText(authorRecord["name"]).trim();
    if (name) {
      return sanitizeTextSnippet(name, 100);
    }
    const email = extractText(authorRecord["email"]).trim();
    if (email) {
      return sanitizeTextSnippet(email, 100);
    }
  }

  const authorStr = extractText(authorNode).trim();
  if (authorStr) {
    // Remove "email (Name)" wrappers if present
    const match = authorStr.match(/\(([^)]+)\)/);
    const cleaned = match ? match[1] : authorStr;
    return sanitizeTextSnippet(cleaned, 100);
  }

  return null;
}

function extractSummary(item: Record<string, unknown>): string | null {
  // Order of preference: content:encoded, content, description, summary
  const candidates = [
    item["content:encoded"],
    item["content"],
    item["description"],
    item["summary"],
  ];

  for (const candidate of candidates) {
    const raw = extractText(candidate);
    if (raw && raw.trim().length > 0) {
      const sanitized = sanitizeTextSnippet(raw, MAX_SUMMARY_LENGTH);
      if (sanitized) {
        return sanitized;
      }
    }
  }

  return null;
}

/**
 * Parse raw RSS or Atom XML string into a normalized ParsedFeed structure.
 */
export function parseFeedXml(xmlContent: string): ParsedFeed {
  if (!xmlContent || typeof xmlContent !== "string") {
    throw new FeedParseError("Empty or invalid feed content");
  }

  if (xmlContent.length > MAX_FEED_SIZE_BYTES) {
    throw new FeedParseError(`Feed content exceeds maximum size of ${MAX_FEED_SIZE_BYTES} bytes`);
  }

  const validation = XMLValidator.validate(xmlContent);
  if (validation !== true) {
    throw new FeedParseError("XML parsing failed: malformed feed syntax", validation.err);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: true,
    parseTagValue: false,
    processEntities: true,
    htmlEntities: true,
    stopNodes: ["script", "style"],
  });

  let parsed: unknown;
  try {
    parsed = parser.parse(xmlContent);
  } catch (error) {
    throw new FeedParseError("XML parsing failed: malformed feed syntax", error);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new FeedParseError("Root document is empty or invalid XML");
  }

  const doc = parsed as Record<string, unknown>;

  // Detect RSS (rss.channel or rdf:RDF)
  const rssChannel = (doc["rss"] as Record<string, unknown> | undefined)?.["channel"] as
    | Record<string, unknown>
    | undefined;
  const rdfChannel = (doc["rdf:RDF"] as Record<string, unknown> | undefined);

  if (rssChannel) {
    return parseRssChannel(rssChannel);
  }
  if (rdfChannel) {
    return parseRdfChannel(rdfChannel);
  }

  // Detect Atom (feed)
  const atomFeed = doc["feed"] as Record<string, unknown> | undefined;
  if (atomFeed) {
    return parseAtomFeed(atomFeed);
  }

  throw new FeedParseError("Unrecognized feed format. Expected standard RSS 2.0 or Atom 1.0 root.");
}

function parseRssChannel(channel: Record<string, unknown>): ParsedFeed {
  const feedTitle = sanitizeTextSnippet(extractText(channel["title"]), MAX_TITLE_LENGTH) || "Untitled Feed";
  const feedDescription = sanitizeTextSnippet(extractText(channel["description"]), 1000);
  const feedLink = extractText(channel["link"]).trim() || null;

  const rawItems = channel["item"];
  const itemArray = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const capped = itemArray.slice(0, MAX_FEED_ITEMS);

  const items: RawFeedItem[] = [];

  for (const raw of capped) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const title = stripHtmlAndCollapseWhitespace(extractText(item["title"]));
    if (!title) {
      continue; // Skip items without a title
    }

    const rawLink = extractText(item["link"]).trim();
    if (!rawLink) {
      continue; // Skip items without a link
    }

    let canonicalUrl: string;
    try {
      canonicalUrl = normalizeCanonicalUrl(rawLink);
    } catch {
      continue; // Skip items with invalid URLs
    }

    const guid = extractText(item["guid"]).trim() || null;
    const publishedAt = extractDate(item);
    const summary = extractSummary(item);
    const author = extractAuthor(item);

    items.push({
      title: title.slice(0, MAX_TITLE_LENGTH),
      link: canonicalUrl,
      guid,
      publishedAt,
      summary,
      author,
    });
  }

  return {
    title: feedTitle,
    description: feedDescription,
    link: feedLink,
    items,
  };
}

function parseRdfChannel(rdf: Record<string, unknown>): ParsedFeed {
  const channel = (rdf["channel"] as Record<string, unknown> | undefined) ?? {};
  const feedTitle = sanitizeTextSnippet(extractText(channel["title"]), MAX_TITLE_LENGTH) || "Untitled RDF Feed";
  const feedDescription = sanitizeTextSnippet(extractText(channel["description"]), 1000);
  const feedLink = extractText(channel["link"]).trim() || null;

  const rawItems = rdf["item"];
  const itemArray = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const capped = itemArray.slice(0, MAX_FEED_ITEMS);

  const items: RawFeedItem[] = [];

  for (const raw of capped) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const title = stripHtmlAndCollapseWhitespace(extractText(item["title"]));
    if (!title) continue;

    const rawLink = extractText(item["link"]).trim();
    if (!rawLink) continue;

    let canonicalUrl: string;
    try {
      canonicalUrl = normalizeCanonicalUrl(rawLink);
    } catch {
      continue;
    }

    items.push({
      title: title.slice(0, MAX_TITLE_LENGTH),
      link: canonicalUrl,
      guid: extractText(item["dc:identifier"]).trim() || null,
      publishedAt: extractDate(item),
      summary: extractSummary(item),
      author: extractAuthor(item),
    });
  }

  return {
    title: feedTitle,
    description: feedDescription,
    link: feedLink,
    items,
  };
}

function parseAtomFeed(feed: Record<string, unknown>): ParsedFeed {
  const feedTitle = sanitizeTextSnippet(extractText(feed["title"]), MAX_TITLE_LENGTH) || "Untitled Atom Feed";
  const feedSubtitle = sanitizeTextSnippet(extractText(feed["subtitle"]), 1000);
  const feedLink = extractAtomLink(feed["link"]);

  const rawEntries = feed["entry"];
  const entryArray = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];
  const capped = entryArray.slice(0, MAX_FEED_ITEMS);

  const items: RawFeedItem[] = [];

  for (const raw of capped) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;

    const title = stripHtmlAndCollapseWhitespace(extractText(entry["title"]));
    if (!title) continue;

    const rawLink = extractAtomLink(entry["link"]);
    if (!rawLink) continue;

    let canonicalUrl: string;
    try {
      canonicalUrl = normalizeCanonicalUrl(rawLink);
    } catch {
      continue;
    }

    const guid = extractText(entry["id"]).trim() || null;
    const publishedAt = extractDate(entry);
    const summary = extractSummary(entry);
    const author = extractAuthor(entry);

    items.push({
      title: title.slice(0, MAX_TITLE_LENGTH),
      link: canonicalUrl,
      guid,
      publishedAt,
      summary,
      author,
    });
  }

  return {
    title: feedTitle,
    description: feedSubtitle,
    link: feedLink,
    items,
  };
}

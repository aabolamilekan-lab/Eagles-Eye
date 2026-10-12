import { describe, expect, it } from "vitest";
import { parseFeedXml, FeedParseError } from "@/lib/news/parser";

describe("parseFeedXml (RSS 2.0)", () => {
  it("parses standard RSS 2.0 channel and items with guid and dates", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Global News Channel</title>
    <link>https://example.com/news</link>
    <description>Daily global reports</description>
    <item>
      <title>Central Bank announces monetary policy rate</title>
      <link>https://example.com/news/article-101?utm_source=rss</link>
      <guid isPermaLink="false">item-101-guid</guid>
      <pubDate>Mon, 12 Oct 2026 09:30:00 GMT</pubDate>
      <description>&lt;p&gt;Officials held a briefing outlining key interest rate decisions.&lt;/p&gt;</description>
      <dc:creator>John Doe</dc:creator>
    </item>
    <item>
      <title>Second developing story</title>
      <link>https://example.com/news/article-102</link>
      <guid>https://example.com/news/article-102</guid>
      <pubDate>2026-10-12T08:00:00Z</pubDate>
      <description>Summary of second article</description>
    </item>
  </channel>
</rss>`;

    const parsed = parseFeedXml(xml);
    expect(parsed.title).toBe("Global News Channel");
    expect(parsed.description).toBe("Daily global reports");
    expect(parsed.items).toHaveLength(2);

    const first = parsed.items[0]!;
    expect(first.title).toBe("Central Bank announces monetary policy rate");
    expect(first.link).toBe("https://example.com/news/article-101"); // Normalized
    expect(first.guid).toBe("item-101-guid");
    expect(first.author).toBe("John Doe");
    expect(first.summary).toBe("Officials held a briefing outlining key interest rate decisions.");
    expect(first.publishedAt).toBeInstanceOf(Date);
    expect(first.publishedAt?.toISOString()).toBe("2026-10-12T09:30:00.000Z");

    const second = parsed.items[1]!;
    expect(second.title).toBe("Second developing story");
    expect(second.author).toBeNull();
  });

  it("extracts content:encoded when description is brief or absent", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Tech Wire</title>
    <link>https://techwire.example/rss</link>
    <item>
      <title>Autonomous computing breakthrough announced</title>
      <link>https://techwire.example/story-55</link>
      <content:encoded><![CDATA[<p>Researchers unveiled comprehensive benchmark results showing double efficiency gains.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

    const parsed = parseFeedXml(xml);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.summary).toBe(
      "Researchers unveiled comprehensive benchmark results showing double efficiency gains.",
    );
  });
});

describe("parseFeedXml (Atom 1.0)", () => {
  it("parses Atom 1.0 feed entries, extracting alternate link and ISO dates", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Science Daily</title>
  <subtitle>Latest scientific discoveries</subtitle>
  <link href="https://sciencedaily.example/feed" rel="self" />
  <link href="https://sciencedaily.example" rel="alternate" />
  <entry>
    <title>Deep Space Telescope observes novel exoplanet</title>
    <id>tag:sciencedaily.example,2026:article-889</id>
    <link href="https://sciencedaily.example/exoplanet-discovery?ref=atom" rel="alternate" type="text/html" />
    <link href="https://sciencedaily.example/api/v1/article-889" rel="enclosure" />
    <updated>2026-10-11T22:15:00Z</updated>
    <summary type="html">Astronomers reported atmospheric composition findings.</summary>
    <author>
      <name>Dr. Ada Lovelace</name>
      <email>ada@sciencedaily.example</email>
    </author>
  </entry>
</feed>`;

    const parsed = parseFeedXml(xml);
    expect(parsed.title).toBe("Science Daily");
    expect(parsed.description).toBe("Latest scientific discoveries");
    expect(parsed.items).toHaveLength(1);

    const entry = parsed.items[0]!;
    expect(entry.title).toBe("Deep Space Telescope observes novel exoplanet");
    expect(entry.link).toBe("https://sciencedaily.example/exoplanet-discovery"); // Alternate link selected and normalized
    expect(entry.guid).toBe("tag:sciencedaily.example,2026:article-889");
    expect(entry.publishedAt?.toISOString()).toBe("2026-10-11T22:15:00.000Z");
    expect(entry.author).toBe("Dr. Ada Lovelace");
    expect(entry.summary).toBe("Astronomers reported atmospheric composition findings.");
  });
});

describe("parseFeedXml (Error and Resilience Cases)", () => {
  it("skips items missing link or title without throwing", () => {
    const xml = `<rss version="2.0"><channel><title>Mixed Feed</title>
      <item><description>No title or link here</description></item>
      <item><title>Valid Item</title><link>https://example.com/ok</link></item>
      <item><title>Item without link</title></item>
    </channel></rss>`;

    const parsed = parseFeedXml(xml);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.title).toBe("Valid Item");
  });

  it("handles invalid publication dates by falling back to null", () => {
    const xml = `<rss version="2.0"><channel><title>Date Test</title>
      <item>
        <title>Article with bad date</title>
        <link>https://example.com/date-test</link>
        <pubDate>Not a real timestamp</pubDate>
      </item>
    </channel></rss>`;

    const parsed = parseFeedXml(xml);
    expect(parsed.items[0]!.publishedAt).toBeNull();
  });

  it("caps maximum items to MAX_FEED_ITEMS (50)", () => {
    let itemsXml = "";
    for (let i = 1; i <= 65; i += 1) {
      itemsXml += `<item><title>Item ${i}</title><link>https://example.com/item-${i}</link></item>`;
    }
    const xml = `<rss version="2.0"><channel><title>Large Feed</title>${itemsXml}</channel></rss>`;

    const parsed = parseFeedXml(xml);
    expect(parsed.items).toHaveLength(50);
  });

  it("throws FeedParseError on malformed XML syntax", () => {
    expect(() => parseFeedXml("<rss><channel><title>Unclosed tag")).toThrow(
      FeedParseError,
    );
  });

  it("throws FeedParseError on empty or unsupported root format", () => {
    expect(() => parseFeedXml("")).toThrow(FeedParseError);
    expect(() => parseFeedXml("<html lang='en'><body>Not a feed</body></html>")).toThrow(
      /Unrecognized feed format/,
    );
  });

  it("throws FeedParseError when feed exceeds 2 MB limit", () => {
    const hugeXml = "<rss><channel><title>" + "x".repeat(2 * 1024 * 1024 + 10) + "</title></channel></rss>";
    expect(() => parseFeedXml(hugeXml)).toThrow(/exceeds maximum size/);
  });

  it("neutralizes hostile embedded scripts in feed item summaries", () => {
    const hostileXml = `<rss version="2.0"><channel><title>Hostile Feed</title>
      <item>
        <title>Clean Title</title>
        <link>https://example.com/article</link>
        <description>&lt;script&gt;alert('xss')&lt;/script&gt;&lt;img src="x" onerror="alert(1)"&gt;Normal summary text.</description>
      </item>
    </channel></rss>`;

    const parsed = parseFeedXml(hostileXml);
    expect(parsed.items[0]!.summary).toBe("Normal summary text.");
    expect(parsed.items[0]!.summary).not.toContain("<script>");
    expect(parsed.items[0]!.summary).not.toContain("onerror");
  });
});

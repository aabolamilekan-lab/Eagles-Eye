import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parseAttributionPolicy,
  buildAttributionViewModel,
  type StorySourceAttributionData,
} from "@/lib/news/attribution";
import { SourceAttributionCard } from "@/components/stories/SourceAttributionCard";

describe("Source Attribution Policy Parsing (parseAttributionPolicy)", () => {
  it("parses structured JSON with verified Creative Commons license and link", () => {
    const jsonPolicy = JSON.stringify({
      licenseName: "Creative Commons Attribution 3.0 (CC BY 3.0)",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
      statement: "Licensed under CC BY 3.0. Credit original author and Global Voices.",
      isPublicDomain: false,
    });

    const parsed = parseAttributionPolicy(jsonPolicy);
    expect(parsed.licenseName).toBe("Creative Commons Attribution 3.0 (CC BY 3.0)");
    expect(parsed.licenseUrl).toBe("https://creativecommons.org/licenses/by/3.0/");
    expect(parsed.statement).toContain("Credit original author");
    expect(parsed.isPublicDomain).toBe(false);
    expect(parsed.policyUrl).toBeNull();
  });

  it("parses NASA public domain policy with policy URL reference rather than CC license", () => {
    const nasaPolicy = JSON.stringify({
      licenseName: "U.S. Public Domain",
      licenseUrl: null,
      policyUrl: "https://www.nasa.gov/multimedia/guidelines/index.html",
      statement:
        "U.S. Public Domain (17 U.S.C. § 105). Courtesy of NASA. NASA media usage guidelines are an institutional policy reference, not a CC license.",
      isPublicDomain: true,
    });

    const parsed = parseAttributionPolicy(nasaPolicy);
    expect(parsed.licenseName).toBe("U.S. Public Domain");
    expect(parsed.licenseUrl).toBeNull(); // No fake license link
    expect(parsed.isPublicDomain).toBe(true);
    expect(parsed.policyUrl).toBe("https://www.nasa.gov/multimedia/guidelines/index.html");
    expect(parsed.statement).toContain("NASA media usage guidelines");
  });

  it("falls back safely on plain-text without fabricating unverified license links", () => {
    const plainText = "Standard editorial reporting from verified media feed.";
    const parsed = parseAttributionPolicy(plainText);

    expect(parsed.licenseName).toBeNull();
    expect(parsed.licenseUrl).toBeNull();
    expect(parsed.statement).toBe(plainText);
    expect(parsed.isPublicDomain).toBe(false);
  });

  it("handles malformed JSON gracefully as fallback plain text", () => {
    const malformed = "{ licenseName: 'broken-json', missing quotes ";
    const parsed = parseAttributionPolicy(malformed);

    expect(parsed.licenseName).toBeNull();
    expect(parsed.licenseUrl).toBeNull();
    expect(parsed.statement).toBe(malformed.trim());
  });

  it("handles null, undefined, or empty policy gracefully", () => {
    expect(parseAttributionPolicy(null).statement).toBe("Attribution information not specified.");
    expect(parseAttributionPolicy("").statement).toBe("Attribution information not specified.");
    expect(parseAttributionPolicy("   ").statement).toBe("Attribution information not specified.");
  });
});

describe("Attribution View Model Builder (buildAttributionViewModel)", () => {
  it("normalizes author by trimming and converting blank author to null", () => {
    const input: StorySourceAttributionData = {
      publisher: "Tech Dispatch",
      originalTitle: "Quantum Circuit Demonstration",
      canonicalUrl: "https://techdispatch.example/quantum",
      originalAuthor: "   Dr. Ada Lovelace   ",
      attributionPolicy: null,
    };

    const vm = buildAttributionViewModel(input);
    expect(vm.originalAuthor).toBe("Dr. Ada Lovelace");
    expect(vm.isAiSummaryNotice).toContain("AI");

    const blankAuthorVm = buildAttributionViewModel({
      ...input,
      originalAuthor: "   ",
    });
    expect(blankAuthorVm.originalAuthor).toBeNull();
  });
});

describe("SourceAttributionCard Component (HTML Rendering)", () => {
  it("renders publisher, title link, author, verified license link, and AI disclosure", () => {
    const data: StorySourceAttributionData = {
      publisher: "Global Voices Nigeria",
      originalTitle: "Community Healthcare Innovations in Kano",
      canonicalUrl: "https://globalvoices.org/2026/kano-healthcare",
      originalAuthor: "Amina Yusuf",
      attributionPolicy: JSON.stringify({
        licenseName: "Creative Commons Attribution 3.0 (CC BY 3.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
        statement: "Licensed under Creative Commons Attribution 3.0.",
      }),
    };

    const html = renderToStaticMarkup(React.createElement(SourceAttributionCard, { attribution: data }));

    // Publisher & title link
    expect(html).toContain("Original Source: Global Voices Nigeria");
    expect(html).toContain("Community Healthcare Innovations in Kano");
    expect(html).toContain('href="https://globalvoices.org/2026/kano-healthcare"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');

    // Author
    expect(html).toContain("Original Author:");
    expect(html).toContain("Amina Yusuf");

    // Clickable verified license link
    expect(html).toContain('href="https://creativecommons.org/licenses/by/3.0/"');
    expect(html).toContain("Creative Commons Attribution 3.0 (CC BY 3.0)");

    // AI summary disclosure
    expect(html).toContain("AI-Assisted Editorial Summary");
    expect(html).toContain("journalistic summary synthesized with artificial intelligence");
    expect(html).toContain("Third-party wire photographs and proprietary external multimedia are strictly excluded");
  });

  it("omits author row cleanly when originalAuthor is absent", () => {
    const data: StorySourceAttributionData = {
      publisher: "European Commission Newsroom",
      originalTitle: "Green Hydrogen Infrastructure Package",
      canonicalUrl: "https://ec.europa.eu/commission/presscorner/detail/en/ip_26_100",
      originalAuthor: null,
      attributionPolicy: JSON.stringify({
        licenseName: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        statement: "Licensed under CC BY 4.0 under Commission Decision 2011/833/EU.",
      }),
    };

    const html = renderToStaticMarkup(React.createElement(SourceAttributionCard, { attribution: data }));
    expect(html).not.toContain("Original Author:");
    expect(html).toContain("Green Hydrogen Infrastructure Package");
  });

  it("does not render unverified clickable license links when licenseUrl is null", () => {
    const data: StorySourceAttributionData = {
      publisher: "Independent Bulletin",
      originalTitle: "Public Transport Modernization",
      canonicalUrl: "https://bulletin.example/news/transport",
      originalAuthor: null,
      attributionPolicy: "Plain text policy statement without formal Creative Commons link.",
    };

    const html = renderToStaticMarkup(React.createElement(SourceAttributionCard, { attribution: data }));
    expect(html).not.toContain("Applicable License:");
    expect(html).toContain("Plain text policy statement without formal Creative Commons link.");
  });

  it("renders NASA public domain policy reference correctly", () => {
    const data: StorySourceAttributionData = {
      publisher: "NASA News & Discoveries",
      originalTitle: "James Webb Telescope Discovers Distant Galaxy Cluster",
      canonicalUrl: "https://www.nasa.gov/news-release/jwst-cluster-2026",
      originalAuthor: null,
      attributionPolicy: JSON.stringify({
        licenseName: "U.S. Public Domain",
        licenseUrl: null,
        policyUrl: "https://www.nasa.gov/multimedia/guidelines/index.html",
        statement: "U.S. Public Domain (17 U.S.C. § 105). Courtesy of NASA.",
        isPublicDomain: true,
      }),
    };

    const html = renderToStaticMarkup(React.createElement(SourceAttributionCard, { attribution: data }));
    expect(html).toContain("Rights Status: U.S. Public Domain (17 U.S.C. § 105)");
    expect(html).toContain('href="https://www.nasa.gov/multimedia/guidelines/index.html"');
    expect(html).toContain("View institutional media guidelines");
  });
});

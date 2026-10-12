import { ExternalLink, Sparkles, ShieldCheck, Info } from "lucide-react";
import { parseAttributionPolicy, type StorySourceAttributionData } from "@/lib/news/attribution";

export interface SourceAttributionCardProps {
  attribution: StorySourceAttributionData;
  className?: string;
}

/**
 * Editorial and copyright attribution presentation component for imported news stories.
 *
 * Renders verified original publisher, canonical article link, original author (when present),
 * verified license links (or explicit public-domain policy reference), and mandatory
 * AI-assisted summary disclosures.
 */
export function SourceAttributionCard({
  attribution,
  className = "",
}: SourceAttributionCardProps) {
  const policy = parseAttributionPolicy(attribution.attributionPolicy);
  const { publisher, originalTitle, canonicalUrl, originalAuthor } = attribution;

  return (
    <aside
      aria-label="Source attribution and editorial notice"
      className={`rounded-2xl border border-border/80 bg-surface-sunken/60 p-5 sm:p-6 text-body-sm text-ink-muted transition-all ${className}`}
    >
      <div className="flex flex-col gap-4">
        {/* Top Header: Badge & Editorial Notice */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-3.5" aria-hidden="true" />
            </span>
            <span className="font-ui text-label-sm font-semibold text-ink">
              Original Source: {publisher}
            </span>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-caption font-medium text-ink-subtle border border-border/40">
            <Info className="size-3" aria-hidden="true" />
            AI-Assisted Editorial Summary
          </span>
        </div>

        {/* Core Canonical Link & Original Author */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-ui font-medium text-ink">Original Title:</span>
            <a
              href={canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-ui font-medium text-primary hover:underline"
            >
              <span>{originalTitle}</span>
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
            </a>
          </div>

          {originalAuthor ? (
            <div className="flex items-baseline gap-1.5">
              <span className="font-ui font-medium text-ink">Original Author:</span>
              <span>{originalAuthor}</span>
            </div>
          ) : null}
        </div>

        {/* License & Rights Policy Notice */}
        <div className="rounded-xl border border-border/40 bg-surface/70 p-3.5 text-caption text-ink-muted flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <ShieldCheck className="size-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              {policy.isPublicDomain ? (
                <div className="font-ui font-medium text-ink">
                  Rights Status: U.S. Public Domain (17 U.S.C. § 105)
                </div>
              ) : policy.licenseName ? (
                <div className="font-ui font-medium text-ink flex flex-wrap items-center gap-1.5">
                  <span>Applicable License:</span>
                  {policy.licenseUrl ? (
                    <a
                      href={policy.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                    >
                      <span>{policy.licenseName}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="font-semibold text-ink">{policy.licenseName}</span>
                  )}
                </div>
              ) : null}

              {/* Policy Statement */}
              <p className="leading-relaxed text-ink-muted/90 text-pretty">
                {policy.statement}
              </p>

              {/* Institutional Policy Reference (e.g. NASA Guidelines) */}
              {policy.policyUrl ? (
                <div className="mt-1">
                  <a
                    href={policy.policyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <span>View institutional media guidelines</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Transparency / Exclusion Disclosure */}
        <p className="text-caption text-ink-subtle leading-relaxed border-t border-border/40 pt-2.5">
          Notice: This content is an original, concise journalistic summary synthesized with artificial intelligence for reader discovery and editorial review. Third-party wire photographs and proprietary external multimedia are strictly excluded.
        </p>
      </div>
    </aside>
  );
}

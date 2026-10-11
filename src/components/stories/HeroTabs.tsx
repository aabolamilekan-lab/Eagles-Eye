"use client";

import { useState } from "react";
import { StoryCard, type StoryCardData } from "@/components/stories/StoryCard";
import { cn } from "@/lib/cn";

export function HeroTabs({
  recentStories,
  popularStories,
}: {
  recentStories: StoryCardData[];
  popularStories: StoryCardData[];
}) {
  const [activeTab, setActiveTab] = useState<"recent" | "top">("recent");

  const displayStories = activeTab === "recent" ? recentStories : popularStories;
  const items = displayStories.slice(0, 3);

  return (
    <div className="flex h-full flex-col justify-between rounded-3xl border border-border/80 bg-surface p-4 sm:p-6 shadow-xs transition-colors">
      <div>
        {/* Suprast-style clean tabs */}
        <div className="flex items-center gap-4 sm:gap-6 border-b border-border/60 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("recent")}
            className={cn(
              "relative font-sans text-sm sm:text-heading-sm font-bold transition-colors cursor-pointer",
              activeTab === "recent"
                ? "text-ink"
                : "text-ink-subtle hover:text-ink",
            )}
          >
            Recent Stories
            {activeTab === "recent" ? (
              <span
                className="absolute -bottom-3.5 left-0 right-0 h-0.75 bg-[#FFE500] rounded-full"
                aria-hidden="true"
              />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("top")}
            className={cn(
              "relative font-sans text-sm sm:text-heading-sm font-bold transition-colors cursor-pointer",
              activeTab === "top"
                ? "text-ink"
                : "text-ink-subtle hover:text-ink",
            )}
          >
            Top Stories
            {activeTab === "top" ? (
              <span
                className="absolute -bottom-3.5 left-0 right-0 h-0.75 bg-[#FFE500] rounded-full"
                aria-hidden="true"
              />
            ) : null}
          </button>
        </div>

        {/* 3 Story Rows: 2nd item gets the signature Suprast yellow card */}
        {items.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3 list-none">
            {items.map((story, index) => (
              <li key={story.slug}>
                <StoryCard
                  story={story}
                  layout="row"
                  variant={index === 1 ? "yellow" : "default"}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 font-ui text-body-sm text-ink-subtle">
            More stories arriving soon.
          </p>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-body-xs font-ui text-ink-subtle">
        <span>Curated for today</span>
        <span className="font-bold text-ink hover:text-black">Discover more &rarr;</span>
      </div>
    </div>
  );
}

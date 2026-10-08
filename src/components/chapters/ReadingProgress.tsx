"use client";

import { useEffect, useRef } from "react";

/**
 * Reading progress.
 *
 * The only client component on a chapter page. A thin rule that sticks just
 * below the site header and reports how far through the document the reader
 * is. It reserves its own height, so it cannot shift layout, and the animated
 * fill has no transition, so it cannot lag the scroll position.
 *
 * Progress is written straight to the fill's `width` through a ref rather than
 * through state. A scroll position changes on every frame of a flick, and routing
 * that through `useState` would re-render the subtree on each one; the fill is the
 * only thing that depends on the value, so updating the element directly keeps
 * scrolling off the React render path entirely.
 *
 * Bounds are recomputed in one `requestAnimationFrame` per scroll burst, with
 * passive listeners, so scrolling never blocks on layout work. Under
 * `prefers-reduced-motion` the fill still moves (it reflects position, not
 * decoration) but no transition is applied anywhere.
 */
export function ReadingProgress() {
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = document.documentElement;
    const fill = fillRef.current;
    const label = labelRef.current;

    // No script means no progress reporting, which is the documented behaviour
    // when JavaScript is unavailable.
    if (!fill || !label) {
      return;
    }

    const frame = { current: 0 };
    let announced = -1;

    const compute = () => {
      const scrollable = element.scrollHeight - element.clientHeight;
      const value =
        scrollable > 0
          ? Math.min(1, Math.max(0, element.scrollTop / scrollable))
          : 0;

      const percent = Math.round(value * 100);
      fill.style.width = `${percent}%`;
      fill.setAttribute("data-reading-percent", String(percent));

      // The status text moves in whole deciles only. A flick crosses dozens of
      // percentages per frame, and announcing every one would flood a screen
      // reader; ten steps through the document is the useful granularity.
      const decile = Math.floor(percent / 10) * 10;
      if (decile !== announced) {
        announced = decile;
        label.textContent = `${decile}% read`;
      }
    };

    const schedule = () => {
      if (frame.current !== 0) {
        return;
      }
      frame.current = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame.current !== 0) {
        window.cancelAnimationFrame(frame.current);
      }
    };
  }, []);

  return (
    <>
      <div
        aria-hidden="true"
        className="sticky top-16 z-30 h-0.5 w-full bg-border"
      >
        <div
          ref={fillRef}
          data-reading-progress=""
          data-reading-percent="0"
          className="h-full bg-primary"
          style={{ width: "0%" }}
        />
      </div>
      <span ref={labelRef} role="status" className="sr-only">
        0% read
      </span>
    </>
  );
}

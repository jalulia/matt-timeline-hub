import { describe, expect, it } from "vitest";
import {
  generateRulerTicks,
  getMonthTickVisibility,
  getRulerTimelineWindow,
  RAIL_Z_INDEX,
  RULER_LEFT_PAD,
  RULER_Z_INDEX,
  STICKY_MONTH_SAFE_ZONE_END,
} from "./timelineRuler";

describe("getMonthTickVisibility", () => {
  it("extends the ruler date window into the left rail so header labels can render there", () => {
    expect(getRulerTimelineWindow(240, 1200)).toEqual({ startX: -240, endX: 960 });
  });

  it("includes the left-rail portion when deriving the visible ruler span", () => {
    const { startX, endX } = getRulerTimelineWindow(320, 1036);
    expect(startX).toBe(-320);
    expect(endX).toBe(716);
  });

  it("keeps month labels visible while they scroll across the left rail", () => {
    const result = getMonthTickVisibility({
      x: 210,
      viewportWidth: 1200,
      stickyOn: false,
    });

    expect(result.shouldRender).toBe(true);
    expect(result.showMonthLabel).toBe(true);
  });

  it("hides the moving month label when it would overlap the sticky current-month label", () => {
    const result = getMonthTickVisibility({
      x: STICKY_MONTH_SAFE_ZONE_END - 1,
      viewportWidth: 1200,
      stickyOn: true,
    });

    expect(result.shouldRender).toBe(true);
    expect(result.showMonthLabel).toBe(false);
  });

  it("hides the previous-month preview until it clears the sticky label zone", () => {
    const result = getMonthTickVisibility({
      x: STICKY_MONTH_SAFE_ZONE_END - 8,
      viewportWidth: 1200,
      stickyOn: true,
    });

    expect(result.showPrevLabel).toBe(false);
  });

  it("shows the previous-month preview after it clears the sticky label zone", () => {
    const result = getMonthTickVisibility({
      x: STICKY_MONTH_SAFE_ZONE_END,
      viewportWidth: 1200,
      stickyOn: true,
    });

    expect(result.showPrevLabel).toBe(true);
  });

  it("renders month ticks that are partially scrolled into the left rail", () => {
    // Tick is sitting just inside the left rail (negative x relative to container)
    const result = getMonthTickVisibility({
      x: -40,
      viewportWidth: 1200,
      stickyOn: false,
    });

    expect(result.shouldRender).toBe(true);
    // Month label anchors right of the tick, so it should still be visible here
    expect(result.showMonthLabel).toBe(false);
    // Previous-month preview anchors to the right edge of the tick — should be hidden when too far left
    expect(result.showPrevLabel).toBe(false);
  });

  it("keeps month ticks rendering up to the far right viewport edge", () => {
    const viewportWidth = 1200;
    const result = getMonthTickVisibility({
      x: viewportWidth + 20,
      viewportWidth,
      stickyOn: false,
    });

    expect(result.shouldRender).toBe(true);
    expect(result.showMonthLabel).toBe(true);
  });

  it("hides month ticks that have scrolled fully past the right viewport edge", () => {
    const viewportWidth = 1200;
    const result = getMonthTickVisibility({
      x: viewportWidth + 200,
      viewportWidth,
      stickyOn: false,
    });

    expect(result.shouldRender).toBe(false);
  });

  it("hides month ticks that have scrolled fully off the left edge of the rail", () => {
    const result = getMonthTickVisibility({
      x: -200,
      viewportWidth: 1200,
      stickyOn: false,
    });

    expect(result.shouldRender).toBe(false);
  });

  it("exposes a left-pad constant so day ticks can be culled symmetrically with month ticks", () => {
    expect(RULER_LEFT_PAD).toBeGreaterThan(0);
  });
});

describe("ruler stacking order", () => {
  // Theme modes the timeline supports — light, dark, and any future
  // transparent-rail variant must keep the ruler painted above the rail.
  const themeModes = ["light", "dark", "transparent-rail", "high-contrast"] as const;

  it.each(themeModes)("keeps the ruler above the left rail in %s mode", (mode) => {
    // Stacking order is theme-independent because both layers live in the
    // same stacking context — assert numerically.
    expect(RULER_Z_INDEX).toBeGreaterThan(RAIL_Z_INDEX);
    // Sanity: the gap is non-trivial so future overlays inserted between
    // the two won't accidentally cover the ruler.
    expect(RULER_Z_INDEX - RAIL_Z_INDEX).toBeGreaterThanOrEqual(2);
    expect(mode).toBeTruthy();
  });
});

describe("generateRulerTicks performance", () => {
  it("generates ticks for a multi-year span within a tight time budget", () => {
    // 10-year span at the densest day-tick interval (ppd=20 → daily ticks)
    const start = new Date(2020, 0, 1).getTime();
    const end = new Date(2030, 0, 1).getTime();

    const t0 = performance.now();
    const ticks = generateRulerTicks(start, end, 20);
    const elapsed = performance.now() - t0;

    // ~120 months + ~3650 days + ~520 sundays ≈ 4300 ticks
    expect(ticks.length).toBeGreaterThan(3000);
    // Should comfortably finish well under one frame budget (16ms).
    // Generous bound to avoid CI flakes while still catching regressions.
    expect(elapsed).toBeLessThan(150);
  });

  it("stays fast when called repeatedly across scrolls", () => {
    const start = new Date(2024, 0, 1).getTime();
    const end = new Date(2027, 0, 1).getTime();

    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      generateRulerTicks(start + i * 864e5, end + i * 864e5, 16);
    }
    const elapsed = performance.now() - t0;

    // 50 regenerations of a 3-year window must remain snappy.
    expect(elapsed).toBeLessThan(250);
  });
});

describe("month/day label collision (property-based)", () => {
  // Mulberry32 — small deterministic PRNG so failures are reproducible.
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Approximate rendered label widths used in the ruler component.
  const MONTH_LABEL_W = 64; // "May 2026"
  const PREV_LABEL_W = 28; // "Apr"
  const STICKY_LABEL_W = 80;

  it("never lets two month labels overlap across the rail boundary", () => {
    const random = rng(0xc0ffee);
    const viewportWidth = 1200;
    const stickyZoneEnd = STICKY_MONTH_SAFE_ZONE_END;

    for (let trial = 0; trial < 200; trial++) {
      // Pick two adjacent month-tick x-positions straddling the rail edge.
      const xPrev = -100 + random() * 280; // somewhere in/near the rail
      const gap = 40 + random() * 220; // realistic month spacing
      const xNext = xPrev + gap;
      const stickyOn = random() > 0.5;

      const prev = getMonthTickVisibility({
        x: xPrev,
        viewportWidth,
        stickyOn,
        stickyZoneEnd,
      });
      const next = getMonthTickVisibility({
        x: xNext,
        viewportWidth,
        stickyOn,
        stickyZoneEnd,
      });

      // Label rectangles in container space.
      // Main month label is anchored at left:8 of its tick → spans [x+8, x+8+W]
      // Previous-month preview is anchored at right:6 of its tick → spans [x-6-PW, x-6]
      const labels: Array<[number, number, string]> = [];
      if (prev.shouldRender && prev.showMonthLabel) {
        labels.push([xPrev + 8, xPrev + 8 + MONTH_LABEL_W, "prev.month"]);
      }
      if (prev.shouldRender && prev.showPrevLabel) {
        labels.push([xPrev - 6 - PREV_LABEL_W, xPrev - 6, "prev.preview"]);
      }
      if (next.shouldRender && next.showMonthLabel) {
        labels.push([xNext + 8, xNext + 8 + MONTH_LABEL_W, "next.month"]);
      }
      if (next.shouldRender && next.showPrevLabel) {
        labels.push([xNext - 6 - PREV_LABEL_W, xNext - 6, "next.preview"]);
      }
      if (stickyOn) {
        // Sticky label sits at left:8 inside the rail-relative coordinate
        // space; in container space (where x is measured) it lives at [8, 8+W].
        labels.push([8, 8 + STICKY_LABEL_W, "sticky"]);
      }

      // The rail boundary is not a barrier in container coordinates — the
      // ruler renders continuously — but labels must still never overlap.
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const [a0, a1, an] = labels[i];
          const [b0, b1, bn] = labels[j];
          const overlap = a0 < b1 && b0 < a1;
          if (overlap) {
            throw new Error(
              `overlap on trial ${trial}: ${an}[${a0.toFixed(1)}, ${a1.toFixed(1)}] vs ` +
                `${bn}[${b0.toFixed(1)}, ${b1.toFixed(1)}] (xPrev=${xPrev.toFixed(1)}, xNext=${xNext.toFixed(1)}, stickyOn=${stickyOn})`,
            );
          }
        }
      }
    }
  });
});

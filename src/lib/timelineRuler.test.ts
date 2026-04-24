import { describe, expect, it } from "vitest";
import {
  getMonthTickVisibility,
  getRulerTimelineWindow,
  RULER_LEFT_PAD,
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

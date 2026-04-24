import { describe, expect, it } from "vitest";
import {
  getMonthTickVisibility,
  getRulerTimelineWindow,
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
});

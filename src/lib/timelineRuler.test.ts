import { describe, expect, it } from "vitest";
import { getMonthTickVisibility } from "./timelineRuler";

describe("getMonthTickVisibility", () => {
  it("keeps month labels visible while they scroll across the left rail", () => {
    const result = getMonthTickVisibility({
      x: 210,
      rail: 240,
      viewportWidth: 1200,
      stickyOn: false,
    });

    expect(result.shouldRender).toBe(true);
    expect(result.showMonthLabel).toBe(true);
  });

  it("hides the moving month label when it would overlap the sticky current-month label", () => {
    const result = getMonthTickVisibility({
      x: 275,
      rail: 240,
      viewportWidth: 1200,
      stickyOn: true,
    });

    expect(result.shouldRender).toBe(true);
    expect(result.showMonthLabel).toBe(false);
  });

  it("hides the previous-month preview until it clears the sticky label zone", () => {
    const result = getMonthTickVisibility({
      x: 330,
      rail: 240,
      viewportWidth: 1200,
      stickyOn: true,
    });

    expect(result.showPrevLabel).toBe(false);
  });

  it("shows the previous-month preview after it clears the sticky label zone", () => {
    const result = getMonthTickVisibility({
      x: 360,
      rail: 240,
      viewportWidth: 1200,
      stickyOn: true,
    });

    expect(result.showPrevLabel).toBe(true);
  });
});

export type MonthTickVisibilityInput = {
  x: number;
  viewportWidth: number;
  stickyOn: boolean;
  stickyZoneEnd?: number;
};

export type MonthTickVisibility = {
  shouldRender: boolean;
  showMonthLabel: boolean;
  showPrevLabel: boolean;
};

export const RULER_LEFT_PAD = 20;
export const STICKY_MONTH_TRIGGER_X = 84;
export const STICKY_MONTH_SAFE_ZONE_END = 152;

export function getRulerTimelineWindow(rail: number, viewportWidth: number) {
  return {
    startX: -rail,
    endX: viewportWidth - rail,
  };
}

export function getMonthTickVisibility({
  x,
  viewportWidth,
  stickyOn,
  stickyZoneEnd = STICKY_MONTH_SAFE_ZONE_END,
}: MonthTickVisibilityInput): MonthTickVisibility {
  const shouldRender = x >= -132 && x <= viewportWidth + 40;

  if (!shouldRender) {
    return { shouldRender: false, showMonthLabel: false, showPrevLabel: false };
  }

  const showMonthLabel = stickyOn ? x >= stickyZoneEnd : x >= 8;
  const showPrevLabel = stickyOn ? x >= stickyZoneEnd : x > 40;

  return { shouldRender, showMonthLabel, showPrevLabel };
}

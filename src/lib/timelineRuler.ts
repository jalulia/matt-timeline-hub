export type MonthTickVisibilityInput = {
  x: number;
  rail: number;
  viewportWidth: number;
  stickyOn: boolean;
};

export type MonthTickVisibility = {
  shouldRender: boolean;
  showMonthLabel: boolean;
  showPrevLabel: boolean;
};

export function getMonthTickVisibility({
  x,
  rail,
  viewportWidth,
  stickyOn,
}: MonthTickVisibilityInput): MonthTickVisibility {
  const shouldRender = x >= -132 && x <= viewportWidth + 40;

  if (!shouldRender) {
    return { shouldRender: false, showMonthLabel: false, showPrevLabel: false };
  }

  const showMonthLabel = stickyOn ? x >= rail + 60 : x >= 8;
  const showPrevLabel = stickyOn ? x >= rail + 120 : x > 40;

  return { shouldRender, showMonthLabel, showPrevLabel };
}

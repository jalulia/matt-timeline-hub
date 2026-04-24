export type MonthTickVisibilityInput = {
  x: number;
  viewportWidth: number;
  stickyOn: boolean;
  stickyZoneEnd?: number;
  /** x of the next month tick, used to suppress this month's main label when it
   *  would collide with the next month's main label. */
  nextTickX?: number;
  /** x of the previous month tick, used to suppress this month's preview label
   *  when it would collide with the previous month's main label. */
  prevTickX?: number;
};

export type MonthTickVisibility = {
  shouldRender: boolean;
  showMonthLabel: boolean;
  showPrevLabel: boolean;
};

export const RULER_LEFT_PAD = 20;
export const STICKY_MONTH_TRIGGER_X = 84;
export const STICKY_MONTH_SAFE_ZONE_END = 152;
/** Approximate rendered width of a "Mon YYYY" main label, plus its 8px left
 *  inset and a small breathing gap. Used for collision suppression. */
export const MONTH_LABEL_MIN_GAP = 72;
/** Min gap between a month tick and the previous one before this tick's
 *  previous-month preview label would overlap the prior month's main label. */
export const PREV_PREVIEW_MIN_GAP = 104;

// Stacking constants — kept here so tests can assert the ruler always
// renders above the left rail regardless of theme/background.
export const RAIL_Z_INDEX = 10;
export const RULER_Z_INDEX = 12;

const MS_DAY = 864e5;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export type RulerTick =
  | { t: "mo"; ts: number; l: string; yr: number; prev: string }
  | { t: "d"; ts: number; l: number; f: boolean; wk: boolean }
  | { t: "sun"; ts: number };

export function generateRulerTicks(
  startMs: number,
  endMs: number,
  ppd: number,
): RulerTick[] {
  const out: RulerTick[] = [];
  const s = new Date(startMs);
  let d = new Date(s.getFullYear(), s.getMonth(), 1);
  while (d.getTime() <= endMs + MS_DAY * 35) {
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    out.push({
      t: "mo",
      ts: d.getTime(),
      l: MONTHS[d.getMonth()],
      yr: d.getFullYear(),
      prev: MONTHS[prev.getMonth()],
    });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  if (ppd > 3.5) {
    const iv = ppd > 18 ? 1 : ppd > 9 ? 7 : 14;
    let day = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    while (day.getTime() <= endMs + MS_DAY * 2) {
      const dn = day.getDate();
      const f = dn === 1;
      const wk = dn === 8 || dn === 15 || dn === 22 || dn === 29;
      if (iv === 1 || f || (iv <= 7 && wk)) {
        out.push({ t: "d", ts: day.getTime(), l: dn, f, wk });
      }
      day = new Date(day.getTime() + MS_DAY);
    }
    let sd = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    while (sd.getTime() <= endMs + MS_DAY * 2) {
      if (sd.getDay() === 0) out.push({ t: "sun", ts: sd.getTime() });
      sd = new Date(sd.getTime() + MS_DAY);
    }
  }
  return out;
}

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
  nextTickX,
  prevTickX,
}: MonthTickVisibilityInput): MonthTickVisibility {
  const shouldRender = x >= -132 && x <= viewportWidth + 40;

  if (!shouldRender) {
    return { shouldRender: false, showMonthLabel: false, showPrevLabel: false };
  }

  const baseShowMonth = stickyOn ? x >= stickyZoneEnd : x >= 8;
  const baseShowPrev = stickyOn ? x >= stickyZoneEnd : x > 40;

  // Suppress this month's main label if the next month tick is so close that
  // the two labels would overlap.
  const tooCloseToNext =
    typeof nextTickX === "number" && nextTickX - x < MONTH_LABEL_MIN_GAP;
  const tooCloseToPrev =
    typeof prevTickX === "number" && x - prevTickX < PREV_PREVIEW_MIN_GAP;

  const showMonthLabel = baseShowMonth && !tooCloseToNext;
  const showPrevLabel = baseShowPrev && !tooCloseToPrev;

  return { shouldRender, showMonthLabel, showPrevLabel };
}

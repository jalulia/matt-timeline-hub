
Three fixes in `src/timeline.jsx` plus a new resizable sidebar.

## 1. Stack milestones on overlap (visual collision)

Current `stackMs` reserves only 90px per chip, but rendered chip width = date number + `·` + name and grows with text length. That's why the screenshot shows "Mileste18 Milestone" overlapping.

- Measure each milestone's actual rendered width (approx via `name.length * 7 + 40` for the `Geist Mono 12px` label, plus the diamond/padding ≈ 26px) and pass that into `stackMs` as the per-item span.
- Update `stackMs` to accept a `widthFor(m)` function and use `ends[r] >= x - 4` against `x + widthFor(m) + 8` gap.
- Result: any two milestones whose chips would overlap horizontally get pushed to the next row, indefinitely (`msH = msS.count*32 + 20` already grows with row count).

## 2. Fix ruler "covered" regression + remaining vertical rule line

The sidebar currently re-renders the same tick set with `x = RAIL + toX(t.ts)` and clips to `x < RAIL + 40`. Because labels (`Mar 2026`) are positioned `left: x + 8`, when the month tick sits near the right edge of the sidebar the whole label is clipped off → "dates disappear". The leftover vertical line is the month tick stroke drawn at `x = RAIL`.

- Remove the duplicate ticks/labels from the sidebar header entirely.
- Replace with a clean white block matching `RULER_H + AXIS_H`, with only the bottom 1px axis border continued from the main ruler. No tick lines, no labels in the sidebar gutter.
- Net effect: the visible ruler stops cleanly at the sidebar's right border (no stray rule line, no clipped month label), and the sidebar gutter reads as continuous white.

## 3. Resizable left sidebar

- Replace `const RAIL = 240` with `const [rail, setRail] = useState(240)` (persist via `localStorage` key `tl.rail`, clamp 180–520).
- Update every `RAIL` reference to use `rail`: viewport width calc, today-recenter, zoom buttons, `onWheel`, `onDown` hit-test, `moveMilestoneToClientX`, sidebar/timeline `width`/`left` styles.
- Add a 6px-wide drag handle absolutely positioned at the sidebar's right edge (`left: rail - 3`, full height, `cursor: col-resize`, `zIndex: 30`). On `pointerdown` it captures the pointer, sets a local drag ref, and updates `rail` on move; `stopPropagation` so it doesn't trigger pan/phase create.
- Recompute `vw.current` whenever `rail` changes so geometry stays accurate.

## 4. Regression guard for milestone drag

While editing the layout, keep the existing `msDrag` flow untouched (the `onPointerDown` + global `pointermove`/`mousemove` listeners already shipped). Only the `RAIL → rail` rename touches that path; verify `moveMilestoneToClientX` uses the new `rail` value.

## Files

- `src/timeline.jsx` — only file changed.

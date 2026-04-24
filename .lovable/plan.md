

# Timeline feedback — multiple fixes

All edits in `src/timeline.jsx`.

## 1. Project color actually applies

Today `proj.color` only renders a 3px swatch in the sidebar. Apply it to:
- The project header text in the sidebar (subtle — use color for the project name).
- The project lane's left border (2px colored stripe at `left:0` in the timeline lane block).
- Pass `proj.color` as a fallback for any phase whose track has no `color` (in `getVis`, fall back `tc || projColor`).

Result: changing project color visibly updates header, lane stripe, and untracked phases.

## 2. Milestone diamond alignment with tick

The diamond currently sits at `left: x - 12`. Because the chip is `display:flex` with `padding:"6px 12px 6px 8px"`, the diamond's visual center lands ~4px right of the date tick. Fix by absolutely centering the diamond at `x` and laying the label to its right:
- Render diamond as its own absolutely-positioned element at `left: x - 5` (10px wide, rotated 45°).
- Render the label chip starting at `left: x + 10`.
- Hit area wraps both with negative padding for grab.

## 3. Sunday gridlines + preceding-month label

In the lane background and `ticks` builder:
- Add a new tick type `sun` for every Sunday. Render a `1px` line in `#D5D2CC` (darker than the `#F2F0ED` weekday lines) full lane height.
- In `ticks`, also push Sundays when `ppd > 3.5` regardless of weekly interval.
- For the month label sticky behavior: when the month boundary tick scrolls off the left edge, render the current month name pinned at `left: 8` of the ruler (not at the boundary). Implementation: compute the "active month" from `toDate(0)` and overlay a sticky label in the ruler with the same style; hide the regular month label when its `x < 60`.
- Also draw the preceding month name in muted color just left of each month boundary (e.g. `Apr` faintly before `May 2026` strong label).

## 4. Track name echoed on phase chips when track label hidden

In each phase chip render, prepend a small monospace track tag (e.g. `BUILD ·`) before the phase number, only shown when:
- the chip is wide enough (`w > 90`), AND
- horizontal scroll has pushed the sidebar track label off-screen for that row (always true since sidebar is fixed — so use a simpler rule: show track name on the FIRST visible chip per track per viewport).
- Style: 9.5px Geist Mono, `color: v.numColor`, `opacity: .6`, uppercase, letterSpacing `0.08em`, followed by `·` separator.

## 5. Project / track popover — explicit Done + Escape

In `ItemPopover`:
- Add a footer row with two buttons: `Cancel` (closes without applying current uncommitted name) and `Done` (commits + closes). Keep Enter/Esc shortcuts.
- Style: small monospace, right-aligned, separated by `border-top`.

## 6. Track date pickers above style editor

Add a new floating panel above the style picker when `sel?.type==="ph"`:
- Two `<input type="date">` fields labelled `START` / `END` bound to `ph.start` and `ph.end`, with mono 11px label.
- Sits in the same fixed bar as the style picker, separated by a 1px divider.
- Updating either input calls `mut` to set the phase's date (clamped so end > start).

(Note: user said "tracks" but contextually means selected phase — phases are what have begin/end. If they truly want track-level start/end, ask. For now scope to phase-level pickers attached to the existing phase style bar, which is where the user pointed.)

## 7. Files

- `src/timeline.jsx`

## Open question

User said "calendar pickers for tracks". Tracks don't have explicit start/end in this data model — phase ranges do. I'll add the pickers to the **selected phase**, sitting above the style picker (matching the screenshot). If they actually want track-level bounds, we can extend the data model in a follow-up.


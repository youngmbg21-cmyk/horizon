# BUGLOG — Autonomous mobile UI/UX bug sweep

Scope: the mobile app (`#hzApp` / `HZMobile` class in `index.html`). Desktop is a
separate mature surface and out of scope for this mobile-focused run (see
SUMMARY.md for that decision). No explicit bug list was supplied (the template
placeholder came through empty), so Phase 1 uses the bugs fixed earlier in this
session; their patterns drive the sweep.

Format per entry: **Bug** → **Root cause** → **Fix** → **Pattern**.

---

## Phase 1 — Baseline bugs already fixed this session (patterns extracted)

1. **Fun Fund trips didn't affect the fund / didn't sync** (PR #63)
   - Root cause: mobile wrote trips to a separate `state.mobileTrips` array the engine never read.
   - Fix: use desktop's `state.trips` (month-keyed expenses).
   - **Pattern P1 — mobile-only data shape that bypasses the shared engine.**

2. **KPIs/afford budget didn't reflect trips** (PR #64)
   - Root cause: read gross `capacity12mo` (adds trips back) and clamped months.
   - Fix: net-of-trips aggregates.
   - **Pattern P2 — aggregate reads the wrong (gross/clamped) engine field.**

3. **Balance chart / nest-egg / mortgage charts ignored currency** (PR #67, #68)
   - Root cause: charts plotted native kr with a non-currency axis (`v+'M'`) and a
     default Chart.js tooltip showing the raw native number.
   - Fix: plot native, format axis + tooltip through `fmtC`.
   - **Pattern P3 — chart axis/tooltip not routed through the currency formatter.**

4. **Refresh dropped the user on the wrong tab** (PR #67)
   - Root cause: `go()` set `state.activePanel` but never `save()`.
   - Fix: persist active panel on navigation.
   - **Pattern P4 — UI/navigation state mutated in memory but never persisted.**

5. **Retire Anywhere diverged from desktop (fabricated APEX, no real scoring)** (PR #69)
   - Root cause: mobile invented its own model instead of `scoreLocation()`.
   - Fix: rebuild on the shared engine.
   - **Pattern P1 again (mobile-only model).**

6. **Landscape rotation dropped to desktop layout** (PR #75)
   - Root cause: width-only breakpoint (`max-width:720px`).
   - Fix: add short+touch clause.
   - **Pattern P5 — responsive gate assumes portrait-only dimensions.**

7. **Text inflated after landscape rotation** (PR #76)
   - Root cause: missing `-webkit-text-size-adjust`.
   - Fix: lock it to 100% on `#hzApp` + `html`.
   - **Pattern P6 — missing iOS/WebKit hardening (text-size-adjust, tap-highlight, etc.).**

8. **AI Deep Dive button gave no running signal** (PR #74)
   - Root cause: async action with no in-flight state on the trigger.
   - Fix: `_ddRunning` set + spinner button.
   - **Pattern P7 — async action with no loading/disabled state on its control.**

---

## Phase 2 — Search strategies per pattern

- **P1** (mobile-only model): grep mobile methods for `state.mobile*` writes and
  local arrays (`this.data.*`) that feed rendering but not the engine.
- **P2** (wrong aggregate): audit each KPI/summary read for gross-vs-net / clamped.
- **P3** (chart currency): every `new Chart(` in `HZMobile` — axis `callback` must be
  `fmtC`, and a `tooltip.callbacks.label` must convert too.
- **P4** (unpersisted state): every `this.data.X =` / `state.X =` in event handlers
  without a following `save()`/`persist()`.
- **P5** (responsive gate): any width-only media query / matchMedia controlling layout.
- **P6** (WebKit hardening): text-size-adjust, tap-highlight, overscroll, input zoom.
- **P7** (async no-signal): every `async` handler that calls a network fn without a
  spinner/disabled state on the button.
- **Baseline**: empty states, overflow at 375px, dead-end buttons, touch targets.

---

## Phase 3/4 — Discovered issues + fixes
(appended below as found)

### Discovered & fixed (this sweep)

D1. **Chart tooltips showed raw native kr, not the selected currency**
   - Where: `chartDash`, `chartForecast`, `chartSpend` (mobile).
   - Root cause: axes used `fmtC` but Chart.js default tooltips print the raw
     datapoint; `chartSpend` (doughnut) had no currency formatting at all.
   - Fix: added `tooltip.callbacks.label` routed through `fmtC` (with series /
     category name for multi-series). Verified: bar→"$1K", line→"Income: $1K",
     doughnut→"Groceries: $1K".
   - Pattern: **P3**. (Also confirmed the previously-fixed nest/mortgage/balance
     charts remain correct — no other mobile `new Chart(` lacks a converting tooltip.)

D2. **Inline × delete buttons were 9–13px wide (untappable)**
   - Where: trip remover (Fun Fund), pension/investment removers (Retirement).
   - Root cause: bare `font-size:16px` glyph buttons with no padding.
   - Fix: padding + line-height (negative margin to limit row growth) → ~27×34px,
     plus `aria-label`. Verified.
   - Pattern: **touch targets under ~44px.**

D3. **Orphaned `// PROPERTY IQ` comment** left after the tab removal — deleted (cosmetic).

### Verified clean (no fix needed)
- **Overflow**: all 10 tabs at 375px and 390px, with full data, empty data, and
  68-char names — zero horizontal overflow.
- **Dead ends**: every `data-act` (literal + `btn()`-generated) maps to a handler.
- **Overlays/sheets**: all 9 (More, Search, Plan/Edit Trip, Add/Edit Destination,
  View Report, New Journal, Bank) open, expose a close control, don't overflow,
  and dismiss.
- **Empty states**: Journal, Vault, Trips, Destinations, Pensions all show helpful
  copy; data tabs render zeros (not broken) with no data.
- **Light theme**: correct contrast (dark text on light bg), no unstyled defaults.
- **Async signals**: AI dashboard/spend reports, Deep Dive, and sync all show
  running/error states.
- **Console**: zero errors/warnings across all tabs except the environment-only
  FX-rate fetch (see DEFERRED).

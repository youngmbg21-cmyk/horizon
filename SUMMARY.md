# SUMMARY — Autonomous mobile UI/UX bug sweep

## Scope & method
Focused on the **mobile app** (`#hzApp` / the `HZMobile` class in `index.html`) —
the entire session's focus. Desktop was deliberately left alone (see DEFERRED #6).
No explicit bug list was supplied (the template placeholder came through empty),
so Phase 1 used the bugs already fixed earlier in this session, extracted their
patterns, and ran two full systematic-sweep iterations against those patterns plus
the baseline checklist. Verification was automated with Playwright at 375px and
390px, with full data, empty data, and edge (long-string) data.

## Bugs fixed

### Reported (fixed earlier this session, patterns drove the sweep)
Fun Fund trip model, net-of-trips KPIs, chart currency (nest/mortgage/balance),
tab-restore-on-refresh, Retire Anywhere rebuild, AI Deep Dive + running signal,
landscape→desktop fallback, landscape text inflation, Property IQ removal, ticker
removal. (All merged, PRs #63–#76.)

### Discovered in this sweep (new)
1. **Chart tooltips ignored the selected currency** — `chartDash`, `chartForecast`,
   `chartSpend` showed raw native kr in tooltips (spend had none). Fixed via
   `fmtC` tooltip callbacks. *(Same class as the earlier chart fixes — the pattern
   held true elsewhere, exactly as predicted.)*
2. **Tiny × delete buttons (9–13px)** on trips and retirement assets — enlarged to
   ~27×34px tap area with aria-labels.
3. **Orphaned code comment** from the Property IQ removal — deleted.

## Patterns found (and where they recurred)
- **P3 chart currency** → recurred in 3 more charts (fixed).
- **Touch targets <44px** → the × removers were the actionable offenders (fixed);
  other compact controls deferred as a design decision.
- **P1/P2/P4/P5/P6/P7** (mobile-only model, wrong aggregate, unpersisted state,
  responsive gate, WebKit hardening, async-no-signal) → **no new instances found**
  in the sweep; the earlier fixes appear to have been the only occurrences.

## Verified clean (2 iterations)
- Overflow: 0 across all 10 tabs × {375, 390}px × {full, empty, long-string}.
- Console: 0 errors/warnings except an environment-only FX fetch (DEFERRED #1).
- Overlays: all 9 sheets open / expose close / don't overflow / dismiss.
- Dead ends: none — every action is handled.
- Empty states, light theme, async loading/error states: all good.

## Deferred
See DEFERRED.md — FX warning (env-only), broad touch-target sizing (redesign),
input focus-visible, sheet scroll-lock, tap-highlight polish, desktop audit,
dead handlers.

## What to spot-check in the morning (on a real device)
1. **iOS landscape** (the two changes I couldn't reproduce in headless Chromium):
   rotate to landscape and back — the app should (a) stay in the mobile shell and
   (b) keep text at normal size (no inflation).
2. **AI Deep Dive** end-to-end with a real Claude key: run one, confirm the amber
   "Analyzing…" button state, the report sheet, and that it appears in the Vault
   on both mobile and desktop.
3. **Currency tooltips**: switch to USD/EUR in Settings, then tap bars/slices on
   the Dashboard, Forecast, Spend, Retirement, Fun Fund and Property-less charts —
   tooltips should show the selected currency.
4. **× delete buttons**: confirm the trip and asset removers are comfortable to tap.
5. General: tab-to-tab navigation, refresh-restores-tab, sync sign-in.

## Files
- `BUGLOG.md` — every entry (pattern-tagged).
- `DEFERRED.md` — intentional non-changes with reasoning.
- `SUMMARY.md` — this file.

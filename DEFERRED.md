# DEFERRED — items intentionally not changed in the mobile bug sweep

Each item is either bigger than a bug fix, ambiguous (could be intentional), or
environment-specific. Logged with reasoning per the run's rules.

1. **FX-rate fetch warning in offline/sandbox environments**
   - `fetchLatestRates()` logs `console.warn("fetchLatestRates failed …")` when the
     network request fails. In the test sandbox (no network) this fires on every
     load; in production with network it succeeds.
   - Why deferred: it degrades gracefully (falls back to stored/default rates) and
     is shared desktop code, not mobile-specific. Silencing a genuine network
     warning globally could hide real failures. Not a mobile bug.

2. **Touch targets on compact controls (32×32 header icons, 52×31 nav, 21–27px
   segmented/action buttons)**
   - Below the 44×44 guideline but these are established, deliberately dense
     controls; the critically-tiny ones (9–13px × buttons) were fixed.
   - Why deferred: uniformly enlarging every control is a visual redesign, which
     the run rules forbid. Worth a dedicated design pass if desired.

3. **Inputs use `outline:none` without a `:focus-visible` replacement**
   - `#hzApp input,select,textarea { outline:none }` removes the keyboard focus
     ring. Acceptable for a touch-first shell (inputs still have borders, and
     `maximum-scale=1` stops focus-zoom), but not ideal for keyboard/AT users.
   - Why deferred: adding focus-visible styling is an enhancement, not a broken
     behavior; low risk but out of "bug fix only" scope.

4. **Bottom-sheet does not scroll-lock the page behind it**
   - When a sheet is open the underlying body can still scroll on some browsers.
   - Why deferred: sheets are `max-height` and dismiss on backdrop tap; the effect
     is minor and fixing it (overflow lock + scroll restore) touches scroll state
     broadly. Candidate for a focused follow-up.

5. **`-webkit-tap-highlight-color` grey flash on tap (iOS)**
   - Cosmetic default highlight; the app already provides its own active states.
   - Why deferred: pure polish, not a defect.

6. **Desktop surface not audited**
   - This run was scoped to the mobile app (`#hzApp` / `HZMobile`), matching the
     entire session's focus. Desktop is a separate mature surface with its own
     chart-tooltip mechanism (shared HTML tooltip) and layout system.
   - Why deferred: auditing the full desktop app is a separate, much larger effort;
     doing it opportunistically here would risk unreviewed changes to stable code.

7. **A few now-dead event handlers** (`dream`, `pulse`, `costlevel`) remain after
   the cards that used them were removed.
   - Why deferred: harmless (no markup triggers them); removing is cleanup churn
     with no user-visible effect.

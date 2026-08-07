# Implementation Plan — Porting the Horizon AI Advisor to a Pricing Platform

Target: a SaaS platform where teams build a **pricing plan to launch a product into the
market**. The platform has no chatbot today. This plan describes how to build one that
works the way the Horizon AI Advisor does (see `AI-ADVISOR-DESIGN.md`), adapted to pricing.

---

## 0. Assumptions, and what to correct

The plan is written against these four assumptions. Each is isolated to a phase, so
correcting one doesn't invalidate the rest.

| # | Assumption | Where it bites | If wrong |
|---|---|---|---|
| 1 | Web SaaS: TypeScript front end (React or similar) + a Node/TypeScript API | Phases 1, 3–6 | Only the code snippets change; every contract, prompt, and phase stands |
| 2 | There is a server backend, so the LLM key lives server-side | Phase 1 | If it's a pure client app, you inherit Horizon's bring-your-own-key model — see §11 |
| 3 | The platform already computes its own forecasts/margins somewhere (even if the logic sits inside components) | Phase 2 | Phase 2 grows: extracting a calculation layer becomes the first real task |
| 4 | The pricing domain model is roughly §1's table | Phases 2, 5 | Swap the field names; the *shape* (scenarios, tiers, competitors, segments, forecast) is what the design depends on |

**Phase 0 exists to confirm all four against the real codebase before anything is built.**

---

## 1. Domain mapping — Horizon → Pricing Studio

The port is unusually clean because both products are "a model of a future you're
planning, with scenarios, line items, and a verdict."

| Horizon concept | Pricing platform equivalent |
|---|---|
| Retirement plan | The pricing plan for a product launch |
| Lean / Baseline / Comfortable scenario | **Conservative / Base / Aggressive** adoption scenario |
| Nest egg at retirement | Projected ARR / MRR at the end of the horizon |
| Coverage % + verdict ("On track") | **Margin health %** + verdict ("Viable / Tight / Underwater") |
| Runway — when does the money run out | **Break-even** — which month cumulative profit turns positive |
| Monthly income vs expenses | MRR vs fixed + variable cost |
| Investment accounts (each with its own growth + tax) | **Pricing tiers** (each with its own price, COGS, mix %) |
| Pension plans with start ages | **Contracted / committed revenue** with start dates |
| Retire Anywhere destinations, ranked | **Competitors**, ranked on a price ladder |
| Trips with budget / spent / remaining | **Launch initiatives** with budget / spent / remaining |
| Today's money vs nominal | **List price vs net (effective) price** after discounts |
| Display currency conversion | Same — plus **billing period** normalization (monthly vs annual) |
| The (A) vs (B) "expenses" ambiguity | The **price / margin ambiguity** — see §1.1 |
| Uploaded bank statement | Uploaded **usage data, win/loss data, or a WTP survey** |
| Journal entries | **Decision log** — pricing decisions and why they were made |
| Citizenship / home base | **Market, industry, business model** (B2B SaaS, marketplace, hardware…) |
| Simple / Expert voice | **Founder / Pricing analyst** voice |
| Retire Anywhere Deep Dive | **Competitor deep dive** or **segment deep dive** |
| Vault of saved reports | **Pricing memos**, versioned so you can diff month over month |

### 1.1 The ambiguities to hard-code into the prompt

This is the single highest-value thing to copy. Horizon's prompt spends ~600 words
disambiguating one overloaded word. Pricing has at least four:

1. **"Price"** — list price / net price after discount / realized ARPU / unit cost.
2. **"Margin"** — gross margin / contribution margin / net margin / margin *per unit* vs *blended*.
3. **"Customers"** — signups / activated / paying / retained-at-month-12.
4. **"Revenue"** — booked / billed / recognized / annualized run-rate.

Each gets a labelled block in the system prompt with routing rules ("on the Cost Model
screen, 'margin' means gross margin per unit; on the Forecast screen it means blended
contribution margin") and the same hard fallback: **when ambiguous, ask before quoting a
number.**

### 1.2 Two guardrails Horizon didn't need

Add these to the system prompt from day one — they are pricing-specific and non-optional:

- **No competitor collusion.** The advisor must never help coordinate prices with a
  competitor, interpret a competitor's signalling as an invitation, suggest exchanging
  pricing intent, or recommend a "market-wide" price move. It advises on *this* company's
  own independent pricing decisions only. If a user asks for anything that reads as
  coordination, it declines in one sentence and offers the independent-analysis version.
- **Facts vs assumptions.** The model has no live market data. It must label every
  external claim (competitor price, market size, typical conversion rate) as an
  assumption to verify, never state it as fact, and never invent a competitor price that
  isn't in the user's own data.

Also worth adding: no pricing differentiation on protected characteristics, and a
plain-language flag when a proposed structure touches regulated territory
(auto-renewal terms, price-increase notice periods).

---

## 2. Architecture

```
Browser                          Your API                     Anthropic
───────                          ────────                     ─────────
ChatPanel                        POST /api/advisor/chat
  │  message + threadId  ───────▶  auth → rate limit
  │                                build snapshot (calc layer)
  │                                assemble prompt (cached prefix)
  │                                                ──────────▶ messages.create
  │  ◀─── SSE token stream ──────  stream through   ◀────────── (streaming)
  │
  ├─ markdown renderer
  ├─ tone-marker pass
  └─ chart hydration ◀── reads live client state, NOT the response
```

Three decisions that follow from the design:

**Key server-side.** Pricing data is confidential business data. The browser never holds
the API key and never talks to Anthropic directly. This also gives you rate limiting,
per-workspace cost attribution, audit logging, and prompt-version pinning for free.

**Stream the response.** Horizon doesn't (it was a single-file client app); a new build
should. Thinking is on by default on the current models, so without streaming the user
watches a long pause before anything appears.

**Split the system prompt for caching.** This is the one place to deliberately *improve*
on Horizon. Horizon rebuilds the entire system prompt every turn, which is correct for
freshness but means nothing caches. Instead:

```
system: [
  { text: STABLE_PREFIX, cache_control: { type: 'ephemeral' } },   // identity, rules,
]                                                                  // chart schema, catalog
messages: [
  ...history,
  { role: 'system', content: volatileSnapshot },   // the numbers — regenerated each turn
  { role: 'user',   content: userMessage },
]
```

The stable prefix (identity, output rules, tone markers, chart contract, ambiguity
routing, the static half of the series catalog) is large and byte-identical across turns,
so it caches at ~0.1× read cost. The volatile snapshot sits *after* the cached prefix as a
mid-conversation `role: "system"` message — supported on the current Opus model with no
beta header — so it never invalidates the cache. Freshness is preserved: the snapshot is
still rebuilt on every single turn.

**Model and request shape:**

```ts
const stream = await client.messages.stream({
  model: 'claude-opus-5',
  max_tokens: 8000,                       // thinking + response share this budget
  output_config: { effort: 'medium' },    // sweep low→high per route in Phase 8
  system: [{ type: 'text', text: STABLE_PREFIX, cache_control: { type: 'ephemeral' } }],
  messages: [...history.slice(-8), snapshotSystemMessage, userMessage],
});
```

- `claude-opus-5` — $5/$25 per MTok. Use `claude-sonnet-5` ($3/$15) for the cheap
  background paths (statement classification, summarization). Decide per route in Phase 8.
- Thinking is on by default on this model, and `max_tokens` caps thinking + visible text
  together — size it with headroom, don't reuse a "response length" number.
- Check `stop_reason === 'refusal'` **before** reading `content`.
- Opt into `fallbacks: "default"` (beta header `server-side-fallback-2026-07-01`) so a
  declined request is re-served automatically instead of surfacing as an empty answer.

---

## 3. Data contracts

Define these first — everything else is written against them.

```ts
// The snapshot the advisor sees. Built ONLY from the shared calculation layer.
interface PricingSnapshot {
  product:   { name: string; category: string; market: string; launchDate: string };
  currency:  { display: 'USD' | 'EUR' | 'GBP' | …; rates: Record<string, number> };
  period:    'monthly' | 'annual';          // billing-period normalization basis
  scenario:  { active: 'conservative' | 'base' | 'aggressive'; multipliers: Record<string, number> };

  costs:     { fixedMonthly: number; cogsPerUnit: number; variablePctOfRevenue: number };
  tiers:     Array<{ id; name; listPrice; netPrice; cogsPerUnit; expectedMixPct; features: string[] }>;
  segments:  Array<{ id; name; sizeEstimate; wtpLow; wtpMedian; wtpHigh; cac; ltv; paybackMonths }>;
  competitors: Array<{ id; name; listPrice; effectivePrice; billingPeriod; featureScore; source; asOf }>;

  forecast:  { horizonMonths: number; mrr: number[]; customers: number[]; churnPct: number[];
               grossProfit: number[]; cumulativeCash: number[] };
  verdict:   { blendedGrossMarginPct: number; breakEvenMonth: number | null;
               ltvCacRatio: number; label: 'Viable' | 'Tight' | 'Underwater' };

  research?: { wtpSurvey?: VanWestendorpResult; winLoss?: WinLossSummary };
  decisions: Array<{ date: string; note: string; tag?: string }>;   // decision log, last 5
}

// What the model may emit for a chart. It picks; the client supplies data.
type ChartSpec =
  | { kind: 'breakeven' | 'revenueForecast' | 'priceLadder' | 'marginByTier'
        | 'wtpCurve' | 'sensitivity'; title?: string; params?: Record<string, unknown> }
  | { kind: 'quoted'; title: string; label: string; unit: string;
      items: Array<{ label: string; value: number }> }        // ONLY kind carrying values
  | { kind: 'custom'; title: string; stacked?: boolean;
      datasets: Array<{ series: SeriesKey; display?: 'line' | 'bar' | 'area';
                        label?: string; color?: string }> };

interface SeriesEntry {
  label: string;
  unit: 'currency' | 'percent' | 'count';
  xAxis: 'month' | 'tier' | 'competitor' | 'segment' | 'pricePoint';
  get(): { xValues: (string | number)[]; values: number[] };   // reads LIVE state
}
```

**One rule, enforced in code:** `PricingSnapshot` is produced by a single
`buildPricingSnapshot()` that reads only the shared calculation layer. If a number can
reach the model any other way, the design is broken.

---

## 4. The system prompt

### 4.1 Composition order

Stable prefix (cached), then volatile snapshot (fresh every turn):

**STABLE — cache this**
1. Identity: *"You are PRICING ADVISOR — a pricing-strategy assistant embedded in <Product>."*
2. Language directive.
3. Output contract: markdown subset, the four tone markers, "bold every price, %, and ratio."
4. Voice block (Founder or Analyst — two variants; picking one changes the cached prefix,
   so keep two cache entries rather than interpolating).
5. **Compliance guardrails** (§1.2) — antitrust, facts-vs-assumptions, no protected-class
   differentiation.
6. The four ambiguity blocks with routing rules (§1.1).
7. Chart contract: block format, allowed kinds, hard rules ("you pick the kind, the client
   owns the data; at most one chart; never invent a kind; always reference the chart in
   your narrative").
8. The static half of the series catalog.
9. Worked examples of chart blocks.

**VOLATILE — regenerate every turn, as a `role: "system"` message**
10. Current screen the user is on + focused section.
11. Currency and billing-period rules with the *exact* conversion rates to use.
12. Active scenario, marked, with guidance on when to use each of the three.
13. The snapshot: costs, every tier, every segment, every competitor with an `asOf` date,
    the forecast series summarized, the verdict, uploaded research if any.
14. The dynamic half of the series catalog (per-tier, per-competitor, per-segment keys
    generated from the user's actual data).
15. Closing instruction: *"Reference specific numbers from THIS snapshot — never recompute
    independently. Label every external claim as an assumption to verify. Give actionable advice."*

### 4.2 Teaching notes to embed in the snapshot

Horizon's best trick: inline explanations that prevent confidently-wrong answers. The
pricing equivalents:

- *"A negative contribution margin on a single tier does not mean the plan is broken — a
  loss-leader entry tier can be correct if it feeds upgrades. Check the blended figure and
  the upgrade rate before calling it a problem."*
- *"CAC payback longer than 12 months is common in enterprise and is not automatically a
  red flag; flag it only against this company's cash position."*
- *"Competitor prices in this snapshot were entered by the user on <date>. They may be
  stale and may be list rather than net. Say so when the answer turns on them."*
- *"WTP survey medians overstate willingness to pay — stated preference is not revealed
  preference. Treat the median as a ceiling, not a target."*

---

## 5. Charts

### 5.1 The kinds

| Kind | Draws | Use for |
|---|---|---|
| `revenueForecast` | MRR/ARR over the horizon, active scenario | "what does this plan produce" |
| `breakeven` | Cumulative cash, break-even month marked | "when do we make money" |
| `priceLadder` | Your tiers against competitor prices, horizontal bars | "where do we sit" |
| `marginByTier` | Stacked COGS + gross margin per tier | "which tier actually earns" |
| `wtpCurve` | Van Westendorp / demand curve from survey data | "what will they pay" |
| `sensitivity` | Revenue and margin across a price sweep | "what if we charge more" |
| `quoted` | Horizontal bars of values the model just stated | Anything derived in-narrative |
| `custom` | 1–6 catalog series, line/bar/area, optional stacking | Everything else |

### 5.2 Series catalog

Static keys (x-axis in brackets):

```
forecast.mrr, forecast.arr, forecast.customers, forecast.newCustomers,
forecast.churnedCustomers                                              [month]
costs.fixed, costs.variable, costs.total                               [month]
pnl.grossProfit, pnl.contributionMargin, pnl.cumulativeCash            [month]
tier.price, tier.netPrice, tier.grossMarginPct, tier.revenueShare      [tier]
competitor.listPrice, competitor.effectivePrice, competitor.featureScore [competitor]
segment.wtpMedian, segment.volume, segment.cac, segment.ltv,
segment.paybackMonths                                                  [segment]
sensitivity.revenue, sensitivity.units, sensitivity.margin             [pricePoint]
```

Dynamic keys, generated per user: `tier.<slug>.*`, `competitor.<slug>.*`,
`segment.<slug>.*`, and `upload.*` when research data is loaded.

### 5.3 Validation (port verbatim)

Reject before rendering: unknown series key, mixed x-axes in one chart, mixed units,
more than 6 datasets, any `data`/`values`/`labels` array in a non-`quoted` block. Each
failure renders as a small inline badge; the rest of the answer renders normally.

---

## 6. UI

Reuse Horizon's layout and interaction model; restyle to your design system.

| Element | Spec |
|---|---|
| Launcher | 52px circular FAB, bottom-right, brand accent gradient, unread dot+count badge |
| Panel | Right slide-in, ~460px, expandable to ~760px capped so the sidebar stays visible |
| Backdrop | **Transparent** — click-to-close, but the pricing model stays readable behind it |
| Header | Logo, title, subtitle "Aware of your pricing model", expand / clear / minimize / close |
| Voice toggle | Founder ↔ Analyst segmented control, persisted, with a one-line hint each |
| Status pills | `Base scenario` · `62% gross margin` · `Break-even mo 9` |
| Messages | User right (accent-tinted, radius 12/12/2/12), advisor left (surface, 12/12/12/2), 9px uppercase label |
| Typing | Three pulsing accent dots, staggered — replaced by real streamed text once tokens arrive |
| Charts | Card with title + uppercase mono subtitle, ~180px canvas |
| Chips | Per-screen suggestions + a dashed "Recent on <Screen>" row |
| Input | Auto-growing textarea 38→120px, Enter sends, Shift+Enter newline |
| Mobile | Full-screen, height tracked to `visualViewport` so the input stays above the keyboard, 16px font |

**Per-screen suggestion chips** — the single cheapest feature that makes it feel intelligent:

| Screen | Chips |
|---|---|
| Overview | Is this plan viable? · Biggest risk in my pricing · What should I fix first? · Sanity-check my margins |
| Cost model | What's my true unit cost? · Which costs scale? · Margin floor per tier · Where's the leverage? |
| Packaging | Are my tiers differentiated? · Am I leaving money on the table? · Should I add a tier? · Which feature drives upgrades? |
| Competitors | Where do I sit on price? · Am I priced to win or to lose? · Who's my real alternative? · Justify a premium |
| Research | What does my WTP data say? · Is this sample trustworthy? · Price point from this survey · What's missing? |
| Forecast | When do I break even? · Stress-test this forecast · What if churn doubles? · Conservative vs aggressive |
| Launch | Should I discount at launch? · Founding-customer pricing? · When do I raise prices? · Grandfathering plan |

---

## 7. Phase plan

Estimates assume 1–2 engineers. Each phase ends in something shippable behind a flag.

### Phase 0 — Foundations (3–5 days)
- Confirm the four assumptions in §0 against the real codebase.
- Map the real schema onto §1's table; rename fields in the contracts.
- Locate or spec the calculation layer. **If forecast/margin math lives inside UI
  components, extracting it is the first task and it blocks Phase 2.**
- Pick the chart library (whatever the platform already uses).
- Decide the workspace/tenant model for chat threads.

*Done when:* `PricingSnapshot` is a real TypeScript interface with real field names, and
there is one named module that owns every derived number.

### Phase 1 — Server proxy (3–4 days)
- `POST /api/advisor/chat` — auth, per-workspace rate limit, SSE passthrough.
- Key in secrets management. Never in client bundle, never in logs.
- Typed error mapping: 401 → "advisor unavailable, contact support", 429 → "busy, retry",
  else generic. **Errors are never persisted as assistant turns.**
- Handle `stop_reason: 'refusal'` before reading content; enable `fallbacks: "default"`.
- Structured request/response logging with prompt-version and token counts, **with the
  snapshot redacted** — it's customer financial data.

*Done when:* a hardcoded prompt round-trips end to end and streams into a test page.

### Phase 2 — The snapshot builder (5–8 days) ← *the highest-value phase*
- `buildPricingSnapshot()` on top of the calculation layer, nothing else.
- Every field formatted with units, scenario markers, and the teaching notes from §4.2.
- Competitor entries carry `source` and `asOf`.
- **Drift test:** a golden test asserting that every number in the snapshot equals the
  number the corresponding UI component renders, for three fixture workspaces (full data,
  sparse data, edge values). This test is what makes the advisor trustworthy — write it here.

*Done when:* the snapshot for a fixture workspace is byte-stable and drift-tested.

### Phase 3 — Chat shell (5–7 days)
- Panel, launcher, threads, persistence, unread badges, minimize, clear-active-thread.
- State-driven pending indicator (survives close/reopen).
- Streaming into the bubble; typing dots only until first token.
- Mobile: full-screen + visual-viewport height.

*Done when:* you can hold a plain-text conversation on desktop and phone, close the panel
mid-request, reopen, and see the answer land.

### Phase 4 — Output renderer (4–6 days)
- Markdown → HTML with escaping first and an allow-list on link schemes.
- Tone markers `{+}` `{-}` `{!}` `{~}` → coloured spans.
- Scope all styles under one class so AI output can never leak into app styling.
- Unit tests for the injection cases: `javascript:` links, HTML in model output, unclosed
  markers, markers inside code blocks.

*Done when:* a fixture response with every markdown feature and every tone marker renders
correctly and safely.

### Phase 5 — Live charts (8–12 days) ← *the largest phase*
- Series catalog with the static keys, then the dynamic generator.
- The 8 chart kinds; `custom` validated against the catalog.
- Three-pass extraction (correct fence → `json` fence → bare JSON) + orphan rescue.
- Scoped error badges; chart-instance registry with teardown on re-render and clear.
- Charts inherit the app's chart theme and currency formatter — **do not convert currency
  inside a chart recipe**; let the shared formatter do it once.

*Done when:* every kind renders from live data, and a deliberately malformed block renders
a badge without breaking the surrounding answer.

### Phase 6 — Context awareness (3–5 days)
- Current-screen injection; per-screen chips; per-screen recent-query history (dedup,
  cap 8 stored / 4 shown); status pills.

*Done when:* switching screens changes the chips and the model's framing of the same question.

### Phase 7 — Voice, currency, localization (3–4 days)
- Founder / Analyst toggle with two cached prefix variants.
- Display currency + billing-period normalization rules in the volatile block.
- Language directive if the platform is localized.

*Done when:* the same question in both voices produces recognizably different answers with
identical numbers.

### Phase 8 — Evals and tuning (5–8 days)
- Build a **40–60 question eval set** across three fixture workspaces. Each case asserts a
  behavior, not a wording:

| Category | Example assertion |
|---|---|
| Numeric fidelity | Every figure in the answer appears in the snapshot |
| Currency | No answer contains a currency symbol other than the display currency |
| Ambiguity | "What's my margin?" on the Forecast screen either asks or uses blended, never per-unit silently |
| Chart discipline | Never more than one chart; never an unknown kind; `quoted` values all appear in the text |
| Compliance | A coordination-flavoured prompt is declined and reframed |
| Hallucination | Asked for a competitor's price that isn't in the data, it says it doesn't have it |
| Voice | Founder mode contains no unglossed jargon from a banned list |
| Empty state | A near-empty workspace produces guidance, not a crash or invented numbers |

- Sweep `effort` (`low` / `medium` / `high`) per route against the eval set; pick per route.
- Consider `claude-sonnet-5` for chips-triggered lightweight questions if quality holds.
- Verify cache hits: `usage.cache_read_input_tokens` should be non-zero from turn two.

*Done when:* the eval set passes at ≥95% and the cache is confirmed hitting.

### Phase 9 — Structured reports + memo vault (6–10 days)
- A **Pricing Readiness Report**: four cards — *Where you stand* / *What's working* /
  *Risks* / *Recommendations* — each `**Takeaway:** → 4 bullets → **Bottom line:**`.
- Client-side bulletizer + word-budget enforcement so the four cards share a silhouette.
- Sanitizer stripping chart blocks from card content (cards can't hydrate charts).
- Save to a versioned **memo vault** so a workspace can diff this month against last.
- Any JSON-only background path (classifying an uploaded file, extracting survey results)
  uses **structured outputs** (`output_config.format` with a JSON schema) — never the chat
  system prompt, which would corrupt it with markdown and chart instructions.

*Done when:* a report generates, renders as four balanced cards, and saves to the vault.

### Optional Phase 10 — Collaboration (5–8 days)
Teammate threads with isolated persona prompts (never see the pricing snapshot) plus a
"share a snapshot" tray that drops a prose + chart card into the thread. Only worth it if
the platform already has multiplayer.

**Total: roughly 8–12 weeks for phases 0–9 with one engineer; 5–7 with two.**
A useful internal milestone lands at the end of Phase 4 (text-only advisor, fully grounded).

---

## 8. Cost model

Rough per-message estimate at `claude-opus-5` ($5 / $25 per MTok):

| Component | Tokens | Cost |
|---|---|---|
| Stable prefix, cached read | ~6,000 | ~$0.003 |
| Volatile snapshot | ~2,500 | ~$0.013 |
| History (8 messages) | ~2,000 | ~$0.010 |
| Output incl. thinking | ~1,200 | ~$0.030 |
| **Per message** | | **~$0.05–0.06** |

Without the cache split the prefix bills at full rate every turn, roughly +$0.03/message
(≈50% more). Cache writes cost 1.25×, so the split pays for itself from the second message
in a conversation.

Budget ~$0.50–1.00 per active user per day at moderate use. Report generation is a
separate, larger cost (~$0.15 each) — meter it.

**Instrument token usage per workspace from Phase 1.** Without it you can't tune anything
in Phase 8.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| No clean calculation layer exists → advisor and UI disagree | Phase 0 finds it; Phase 2's drift test enforces it. Do not skip the test. |
| Confidential pricing data sent to a third party | Server-side proxy, redacted logs, an explicit disclosure in the UI, and a workspace-level opt-out |
| Advisor invents competitor prices | Prompt rule + eval case + `asOf` dates on every competitor row |
| Antitrust exposure | §1.2 guardrail, eval coverage, and a legal review of the guardrail wording before GA |
| Model drift breaks chart blocks | Three-pass extraction, orphan rescue, scoped error badges (all ported from Horizon) |
| Scope creep in Phase 5 | Ship 4 chart kinds first (`breakeven`, `revenueForecast`, `priceLadder`, `quoted`), add the rest after |
| Cost surprise | Per-workspace token metering from Phase 1; effort sweep in Phase 8 |

---

## 10. Success metrics

- % of sessions that open the advisor
- Messages per session (≥3 means it's a tool, not a novelty)
- % of answers containing a chart, and chart error rate (target <1%)
- % of chip-initiated vs typed questions (validates the per-screen chips)
- Change in plan-completion rate for workspaces that use the advisor vs those that don't
- Cost per active workspace per week

---

## 11. Open decisions

These need a human answer before or during the phase noted:

1. **Backend or not** (Phase 1). No backend means Horizon's bring-your-own-key model,
   which is workable but shifts cost and trust to the user and rules out server-side
   logging and rate limits.
2. **Model tier per route** (Phase 8). Opus 5 everywhere is simplest; Sonnet 5 on light
   routes is ~40% cheaper if the evals hold.
3. **Data residency / retention** (Phase 1). Whether pricing snapshots may leave your
   region, and what your customer contracts already promise.
4. **Report cadence** (Phase 9). On demand only, or auto-generated monthly into the vault.
5. **Collaboration** (Phase 10). Only if the platform is already multiplayer.

---

## 12. If you only build three things

1. **The grounded snapshot** (Phase 2) with its drift test. This is what makes the advisor
   worth trusting; everything else is presentation.
2. **Client-owned charts** (Phase 5, first four kinds). The model picks; you supply the
   data. Hallucinated numbers become structurally impossible.
3. **The ambiguity and compliance blocks** (§1.1, §1.2). Cheap to write, and they prevent
   the two classes of answer that would actually damage a user: confidently wrong numbers,
   and advice that creates legal exposure.

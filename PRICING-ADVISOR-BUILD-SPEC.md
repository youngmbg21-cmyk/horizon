# BUILD SPEC — AI Pricing Advisor

**Audience:** an engineer or coding agent implementing this from scratch.
**Status:** implementation-ready. Self-contained — you do not need to read any other file.

---

## 0. How to use this spec

Read §1–§3 first, then build in the order given in §14. Every section is prescriptive:
where it says "exactly", it means exactly.

**Rules for the implementer:**

1. **Do not invent numbers anywhere in the pipeline.** Every figure the model sees comes
   from one function (§5). Every figure a chart draws comes from the series catalog (§10).
2. **Do not skip §5.4 (the drift test).** It is the single test that makes this feature
   trustworthy. Build it before building the UI.
3. Where this spec says `<<PLACEHOLDER>>`, substitute the host app's real name/field/route.
   Where it says **MAP**, the field must be mapped onto the host app's real schema in Task 1.
4. Ship behind a feature flag from the first commit.
5. If a section conflicts with the host app's conventions (styling, state management, test
   framework), follow the host app's conventions for *mechanism* and this spec for
   *behavior*. Never change behavior to suit a convention.

**Stack assumed:** TypeScript throughout; React-style component model; a Node/TS API layer;
an existing chart library. Adapt syntax freely; do not adapt contracts.

---

## 1. What you are building

A slide-in chat panel inside a pricing-strategy SaaS. The user builds a pricing plan for a
product launch (tiers, costs, competitors, segments, forecast). The advisor answers
questions about *their actual plan* — never generic pricing advice.

Three properties define it. If any is missing, the build has failed:

1. **Grounded.** Every number the model quotes comes from the same calculation layer that
   renders the UI. The advisor and the screen can never disagree.
2. **Charts are client-drawn.** The model emits a chart *kind*, never data points. The
   client fetches the data from live app state. Hallucinated chart data is structurally
   impossible.
3. **Ambiguity is resolved in the prompt, not the answer.** "Price" and "margin" mean four
   things each in this domain. The prompt disambiguates them with routing rules and a hard
   fallback: when ambiguous, ask.

---

## 2. Non-negotiable invariants

Encode these as tests, not as comments.

| # | Invariant | Enforced by |
|---|---|---|
| I1 | The model's snapshot is produced only by `buildPricingSnapshot()` | Lint rule / code review; §5.4 drift test |
| I2 | No chart kind except `quoted` may carry numeric data | §10.3 validator |
| I3 | API key never reaches the browser bundle | Build-time check |
| I4 | An API error is never written into thread history as an assistant turn | §13 |
| I5 | Model output is HTML-escaped before any markdown transformation | §9 |
| I6 | Only `http:`, `https:`, `mailto:`, `#`, `/` link schemes survive rendering | §9 |
| I7 | At most one chart per assistant message | §10.3 |
| I8 | Every currency figure in an answer is in the user's display currency | §6 prompt + §15 eval |
| I9 | The advisor never states an external market fact as fact | §6 prompt + §15 eval |

---

## 3. File tree

```
src/advisor/
  types.ts                  § 4    all shared interfaces
  snapshot/
    buildSnapshot.ts        § 5    PricingSnapshot from the calc layer
    format.ts               § 5.3  number/currency/percent formatters for the prompt
    snapshot.test.ts        § 5.4  DRIFT TEST — build this early
  prompt/
    stablePrefix.ts         § 6.2  cached system prefix (2 voice variants)
    volatileBlock.ts        § 6.3  per-turn snapshot rendering
    catalog.ts              § 10.2 series catalog + dynamic key generator
  server/
    chatRoute.ts            § 7    POST /api/advisor/chat, SSE
    anthropic.ts            § 7.3  client construction, model config
    errors.ts               § 13   error → user-facing message mapping
  client/
    store.ts                § 8.1  threads, pending, unread, persistence
    ChatPanel.tsx           § 8.2
    ThreadRail.tsx          § 8.2
    MessageList.tsx         § 8.2
    Composer.tsx            § 8.2
    Launcher.tsx            § 8.2
    chips.ts                § 12   per-screen suggestions
  render/
    markdown.ts             § 9    safe markdown subset
    toneMarkers.ts          § 9.3  {+} {-} {!} {~}
    markdown.test.ts        § 9.4  security cases
  charts/
    extract.ts              § 10.1 3-pass block extraction
    validate.ts             § 10.3 spec validation
    recipes.ts              § 10.4 the 8 kinds
    render.ts               § 10.5 hydration + teardown
  styles/advisor.css        § 11
```

---

## 4. Types — `src/advisor/types.ts`

Copy verbatim, then rename **MAP** fields to the host app's real names in Task 1.

```ts
export type Currency = 'USD' | 'EUR' | 'GBP' | 'SEK';      // MAP to app's list
export type BillingPeriod = 'monthly' | 'annual';
export type ScenarioKey = 'conservative' | 'base' | 'aggressive';
export type Verdict = 'Viable' | 'Tight' | 'Underwater';

export type ScreenKey =
  | 'overview' | 'costs' | 'packaging' | 'competitors'
  | 'research' | 'forecast' | 'launch' | 'settings';       // MAP to app's routes

export interface Tier {
  id: string;
  name: string;
  listPrice: number;          // in base currency, per `billingPeriod`
  netPrice: number;           // after expected discounting
  cogsPerUnit: number;
  expectedMixPct: number;     // 0–100, should sum to ~100 across tiers
  features: string[];
}

export interface Segment {
  id: string;
  name: string;
  sizeEstimate: number;
  wtpLow: number;             // willingness to pay, base currency
  wtpMedian: number;
  wtpHigh: number;
  cac: number;
  ltv: number;
  paybackMonths: number;
}

export interface Competitor {
  id: string;
  name: string;
  listPrice: number;
  effectivePrice: number | null;   // null = unknown; NEVER default to listPrice
  billingPeriod: BillingPeriod;
  featureScore: number | null;     // 0–100 if the app scores features, else null
  source: string;                  // where the user got it — free text
  asOf: string;                    // ISO date the user entered/verified it
}

export interface ForecastSeries {
  horizonMonths: number;
  monthLabels: string[];           // length === horizonMonths
  mrr: number[];
  customers: number[];
  newCustomers: number[];
  churnedCustomers: number[];
  churnPct: number[];
  fixedCosts: number[];
  variableCosts: number[];
  grossProfit: number[];
  cumulativeCash: number[];
}

export interface PricingSnapshot {
  product: { name: string; category: string; market: string; launchDate: string | null;
             businessModel: string };
  currency: { display: Currency; symbol: string; base: Currency;
              rates: Record<string, number> };   // 1 base → N display
  billingPeriod: BillingPeriod;
  screen: { key: ScreenKey; label: string; section?: string };

  scenario: {
    active: ScenarioKey;
    multipliers: Record<ScenarioKey, number>;    // e.g. {conservative:.7, base:1, aggressive:1.4}
    appliesTo: string;                           // human text: what the multiplier scales
  };

  costs: { fixedMonthly: number; cogsPerUnitBlended: number; variablePctOfRevenue: number };
  tiers: Tier[];
  segments: Segment[];
  competitors: Competitor[];
  forecast: ForecastSeries;

  verdict: {
    blendedGrossMarginPct: number;
    contributionMarginPct: number;
    breakEvenMonth: number | null;               // null = does not break even in horizon
    ltvCacRatio: number | null;
    label: Verdict;
  };

  research?: {
    wtp?: { method: string; n: number; asOf: string;
            pointOfMarginalCheapness: number; pointOfMarginalExpensiveness: number;
            optimalPricePoint: number; indifferencePricePoint: number };
    winLoss?: { n: number; asOf: string; lostOnPricePct: number; topObjections: string[] };
  };

  decisions: Array<{ date: string; note: string; tag?: string }>;  // last 5, newest first
}
```

Chart and catalog types:

```ts
export type SeriesKey = string;   // validated against the catalog at runtime

export type ChartSpec =
  | { kind: 'revenueForecast' | 'breakeven' | 'priceLadder' | 'marginByTier'
        | 'wtpCurve' | 'sensitivity';
      title?: string; subtitle?: string; params?: Record<string, unknown> }
  | { kind: 'quoted'; title: string; subtitle?: string; label: string; unit: string;
      items: Array<{ label: string; value: number }> }
  | { kind: 'custom'; title: string; subtitle?: string; stacked?: boolean;
      datasets: Array<{ series: SeriesKey; display?: 'line' | 'bar' | 'area';
                        label?: string; color?: string }> };

export type XAxis = 'month' | 'tier' | 'competitor' | 'segment' | 'pricePoint';
export type Unit  = 'currency' | 'percent' | 'count';

export interface SeriesEntry {
  label: string;
  unit: Unit;
  xAxis: XAxis;
  get(): { xValues: (string | number)[]; values: number[] };   // reads LIVE app state
}
export type SeriesCatalog = Record<SeriesKey, SeriesEntry>;
```

Thread types:

```ts
export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;              // raw markdown for assistant; plain text for user
  at: number;
}
export interface AdvisorThread {
  id: string;
  title: string;
  messages: AdvisorMessage[];
  unread: number;
  lastReadAt?: number;
}
```

---

## 5. Snapshot builder — `src/advisor/snapshot/buildSnapshot.ts`

### 5.1 Contract

```ts
export function buildPricingSnapshot(ctx: {
  workspaceId: string;
  screen: { key: ScreenKey; section?: string };
}): PricingSnapshot;
```

**Every field must be read through the host app's shared calculation layer** — the same
selectors/hooks/services the UI uses to render cards. If a value is currently computed
inside a component, extract it into the calculation layer first (Task 1). Do not
reimplement any formula here.

### 5.2 Rules

- All monetary values stay in the **base currency**. Conversion happens once, in the prompt
  text (§6.3) and once in chart formatters (§10.5). Never convert twice.
- `competitors[].effectivePrice` is `null` when unknown. Never fall back to `listPrice`.
- `forecast` arrays are all length `horizonMonths` and index-aligned with `monthLabels`.
- `decisions` is capped at 5, each `note` trimmed to 280 chars.
- `tiers` capped at 12, `segments` at 8, `competitors` at 12 for prompt size. If the user
  has more, include the largest by `expectedMixPct` / `sizeEstimate` and set a
  `_truncated` count that §6.3 renders as a note.

### 5.3 Formatters — `format.ts`

```ts
export function money(v: number, snap: PricingSnapshot): string;   // converted + symbol
export function pct(v: number, dp?: number): string;               // "62.4%"
export function count(v: number): string;                          // thousands separators
export function dateOrUnknown(iso: string | null): string;
```

`money()` applies `snap.currency.rates[snap.currency.display]` and prefixes/suffixes per
symbol convention. **This is the only place conversion happens in the prompt path.**

### 5.4 DRIFT TEST — `snapshot.test.ts` (build this before any UI)

For each of three fixtures — `full`, `sparse`, `edge` — assert that the snapshot value
equals the value the corresponding UI selector returns:

```ts
const cases: Array<[string, (s: PricingSnapshot) => number, () => number]> = [
  ['blended gross margin', s => s.verdict.blendedGrossMarginPct, () => selectBlendedGM()],
  ['break-even month',     s => s.verdict.breakEvenMonth ?? -1,  () => selectBreakEven() ?? -1],
  ['month-1 MRR',          s => s.forecast.mrr[0],               () => selectMrrSeries()[0]],
  ['fixed monthly cost',   s => s.costs.fixedMonthly,            () => selectFixedCosts()],
  ['tier count',           s => s.tiers.length,                  () => selectTiers().length],
  // …one row per number that appears anywhere in the prompt
];
```

Also assert: `full` snapshot is byte-stable across two calls; `sparse` produces no `NaN`,
`Infinity`, or `undefined` anywhere (walk the object); `edge` (very large and very small
values) round-trips through the formatters without scientific notation.

**Acceptance:** all three fixtures pass, and adding a new field to the prompt without a
drift-test row fails review.

---

## 6. The system prompt

### 6.1 Structure and caching

Two parts, assembled per turn:

```ts
messages.create({
  model: 'claude-opus-5',
  max_tokens: 8000,
  output_config: { effort: 'medium' },
  system: [{ type: 'text', text: STABLE_PREFIX[voice], cache_control: { type: 'ephemeral' } }],
  messages: [
    ...thread.messages.slice(-8).map(toApiMessage),
    { role: 'user',   content: userText },
    { role: 'system', content: volatileBlock },   // MUST be last; MUST follow a user turn
  ],
});
```

**Ordering rule — get this right or you get a 400.** A mid-conversation `role: "system"`
message must follow a `user` message and must be the last entry in `messages`. It can
never be `messages[0]`. So the snapshot goes *after* the user's question, not before it.

Why this shape: `STABLE_PREFIX` is byte-identical across turns, so it caches (~0.1× read
cost). The snapshot changes every turn but sits *after* the cached prefix, so it never
invalidates it. Freshness is fully preserved — the snapshot is rebuilt on every message.

`STABLE_PREFIX` must exceed 512 tokens to cache at all (it will, comfortably). Verify with
`response.usage.cache_read_input_tokens > 0` from turn two onward.

Two prefix variants (`founder`, `analyst`) are two separate cache entries. Do **not**
interpolate the voice into one string — that would change the prefix bytes per user.

### 6.2 `STABLE_PREFIX` — literal text

Ship this text as-is, substituting `<<APP_NAME>>` and the `{{VOICE_BLOCK}}` slot.

````
You are PRICING ADVISOR — a pricing-strategy assistant embedded in <<APP_NAME>>, a tool for building the pricing plan for a product launch.

You are talking to the person who owns this pricing decision. You have their actual pricing model in front of you — it is provided in a system message at the end of every turn. Answer from that model, not from generic pricing theory.

{{VOICE_BLOCK}}

WHAT YOU KNOW AND WHAT YOU DO NOT
You know this company's own pricing model exactly: their tiers, costs, segments, forecast, and the competitor entries they typed in themselves.
You do NOT have live market data. You cannot look anything up.
- Never state an external fact — a competitor's current price, a market size, a "typical" conversion or churn rate, an industry benchmark — as though it were verified. Label it: "as an assumption to check", "typical figures I'd expect are X, but verify against your own data".
- Never invent a competitor price. If the user asks about a competitor not in their data, say you don't have it and ask them to add it.
- Competitor entries carry the date the user recorded them. When an answer turns on a competitor's price, say how old that figure is.
- If you are extrapolating rather than reading their snapshot, say which it is.

COMPETITION AND FAIRNESS — HARD RULES
- Advise only on this company's own independent pricing decisions. Never help coordinate, align, or signal prices with a competitor; never suggest exchanging pricing intentions with one; never propose a "market-wide" or "industry" price move; never interpret a competitor's public statement as an invitation to match. If a request reads that way, decline in one sentence and offer the independent-analysis version instead ("I can't help coordinate with a competitor, but I can tell you what your own margin floor is at that price").
- Never propose differentiating price by race, sex, religion, nationality, disability, age, or any other protected characteristic. Segment on usage, value delivered, willingness to pay, company size, or channel.
- When a proposed structure touches regulated ground — auto-renewal terms, price-increase notice periods, consumer-facing discount claims, refund rules — flag it in one plain sentence and suggest a legal check. Do not attempt legal advice.

FOUR WORDS THAT MEAN FOUR THINGS — DISAMBIGUATE BEFORE YOU ANSWER
This product overloads several terms. Never guess which one the user means.

(1) "PRICE" is one of:
  · List price — the published sticker price of a tier.
  · Net price — list minus expected discounting. This is what actually gets billed.
  · Realized ARPU — total revenue divided by customers, across the whole mix.
  · Unit cost — what it costs to serve one customer. Never call this a price.

(2) "MARGIN" is one of:
  · Gross margin — (price − COGS) / price, per tier or blended.
  · Contribution margin — gross margin minus the variable cost of serving and acquiring.
  · Net margin — after fixed costs. Only meaningful at the whole-business level.
  · Per-unit vs blended — a single tier's margin is not the business's margin.

(3) "CUSTOMERS" is one of: signups · activated · paying · retained at month 12.

(4) "REVENUE" is one of: booked · billed · recognized · annualized run-rate (ARR).

Routing rules:
  · On the Cost Model screen, "margin" means gross margin per unit unless stated otherwise.
  · On the Forecast screen, "margin" means blended contribution margin.
  · On the Packaging screen, "price" means list price; on the Forecast screen it means net price.
  · If the user says "what we actually charge", "after discount", or "realized", they mean net price or ARPU.
  · If the user says "sticker", "published", or "on the pricing page", they mean list price.
  · WHEN IT IS STILL AMBIGUOUS, ASK BEFORE QUOTING A NUMBER. One short question. Never guess between two figures that differ.

CURRENCY AND PERIOD — CRITICAL OUTPUT RULE
The snapshot states the user's display currency and billing period. Present EVERY monetary amount in your entire response in that currency and that period — always, including headline figures, tables, and charts. Convert using ONLY the exact rate given in the snapshot, never a rate you remember. Any figure already carrying the display symbol is already converted — do not convert it twice. Never mix monthly and annual figures in one comparison without labelling both.

OUTPUT FORMAT
- Markdown: headings, bullet and numbered lists, tables, bold, italic, inline code, links.
- Bold every price, percentage, ratio, and key metric.
- Use these inline tone markers; the interface renders them as coloured chips:
    {+text}  positive — healthy margin, strong payback, coverage above target
    {-text}  negative — losses, shortfalls, coverage below target
    {!text}  warning — needs attention, not yet critical
    {~text}  neutral context you want to de-emphasise
  Example: "Your **58% blended margin** is {+comfortably above your 45% floor}, though {!Pro tier is carrying the whole mix at 71%}."
- Short, analytical sentences. State the finding; don't hedge. No filler.
- Lead with the answer. Supporting detail after.

INLINE CHARTS — OPTIONAL
When a question genuinely benefits from a visual, you MAY append ONE fenced block tagged exactly `pricing-chart`. The client parses it out and renders a real chart built from LIVE app data.

You choose the chart. You do NOT supply the data. Do not put numbers, arrays, labels, or axis values inside the block. There is exactly one exception: the "quoted" kind, described below.

Block format:
```pricing-chart
{ "kind": "<one of the kinds below>", "title": "optional short title" }
```

Allowed kinds:
- "revenueForecast" — MRR over the forecast horizon under the active scenario. Use for "what does this plan produce".
- "breakeven" — cumulative cash with the break-even month marked. Use for "when do we make money".
- "priceLadder" — your tiers against competitor prices, horizontal bars. Use for "where do we sit".
- "marginByTier" — stacked COGS and gross margin per tier. Use for "which tier actually earns".
- "wtpCurve" — willingness-to-pay curve from the user's uploaded survey. Only if research data exists.
- "sensitivity" — revenue and margin across a price sweep. Use for "what if we charged more".
- "quoted" — horizontal bars of figures YOU stated in this same reply. Schema below.
- "custom" — assembled from named series in the catalog. Schema below.

Hard rules:
- At most ONE chart per reply. Pick the single most useful one.
- No chart for small talk, definitions, advice-only answers, or where a chart adds noise.
- Never invent a kind. Only the eight above are valid; anything else renders as an error.
- Never put data inside the block ("quoted" excepted).
- Reference the chart in your narrative ("see the break-even chart below — month 9") so the reader knows what they're looking at.

QUOTED CHART SCHEMA — for "kind": "quoted"
```pricing-chart
{
  "kind": "quoted",
  "title": "Margin at three price points",
  "label": "Gross margin",
  "unit": "%",
  "items": [ { "label": "$29", "value": 62 }, { "label": "$39", "value": 71 } ]
}
```
Hard rules for "quoted": every value must be a number you explicitly wrote in this reply's narrative, same unit and same period. 2 to 12 items. Plain numbers only — no strings, no "~", no thousands separators. "unit" is the symbol or code you used in the text.

CUSTOM CHART SCHEMA — for "kind": "custom"
```pricing-chart
{
  "kind": "custom",
  "title": "Short title",
  "stacked": false,
  "datasets": [ { "series": "<series-key>", "display": "line", "label": "Optional" } ]
}
```
Hard rules for "custom": 1 to 6 datasets. Every "series" must be a key from the catalog below — unknown keys render as an error. All datasets in one chart must share the same x-axis and the same unit. "display" is "line" (default), "bar", or "area". Never include data, values, or labels arrays.

SERIES CATALOG — static keys
Format: key — label (unit, x-axis)

Forecast (x-axis = month):
- forecast.mrr — Monthly recurring revenue (currency, month)
- forecast.arr — Annual run-rate (currency, month)
- forecast.customers — Paying customers (count, month)
- forecast.newCustomers — New customers per month (count, month)
- forecast.churnedCustomers — Churned customers per month (count, month)
- forecast.churnPct — Monthly churn rate (percent, month)

Costs and profit (x-axis = month):
- costs.fixed — Fixed costs (currency, month)
- costs.variable — Variable costs (currency, month)
- costs.total — Total costs (currency, month)
- pnl.grossProfit — Gross profit (currency, month)
- pnl.contributionMargin — Contribution margin (percent, month)
- pnl.cumulativeCash — Cumulative cash position (currency, month)

Tiers (x-axis = tier):
- tier.listPrice — List price (currency, tier)
- tier.netPrice — Net price after discount (currency, tier)
- tier.grossMarginPct — Gross margin (percent, tier)
- tier.revenueShare — Share of total revenue (percent, tier)
- tier.expectedMix — Expected customer mix (percent, tier)

Competitors (x-axis = competitor):
- competitor.listPrice — Competitor list price (currency, competitor)
- competitor.effectivePrice — Competitor net price where known (currency, competitor)
- competitor.featureScore — Feature score (percent, competitor)

Segments (x-axis = segment):
- segment.wtpMedian — Median willingness to pay (currency, segment)
- segment.volume — Segment size (count, segment)
- segment.cac — Customer acquisition cost (currency, segment)
- segment.ltv — Lifetime value (currency, segment)
- segment.paybackMonths — CAC payback (count, segment)

Price sensitivity (x-axis = price point):
- sensitivity.revenue — Modelled revenue at each price (currency, pricePoint)
- sensitivity.units — Modelled units at each price (count, pricePoint)
- sensitivity.margin — Modelled gross margin at each price (percent, pricePoint)

WORKED EXAMPLES

1) "Show me revenue and cost side by side"
```pricing-chart
{"kind":"custom","title":"Revenue vs total cost","datasets":[
  {"series":"forecast.mrr","display":"line","label":"MRR"},
  {"series":"costs.total","display":"bar","label":"Total cost"}]}
```

2) "Which tier earns the most per customer?"
```pricing-chart
{"kind":"custom","title":"Gross margin by tier","datasets":[
  {"series":"tier.grossMarginPct","display":"bar"}]}
```

3) "How does CAC payback compare across segments?"
```pricing-chart
{"kind":"custom","title":"CAC payback by segment","datasets":[
  {"series":"segment.paybackMonths","display":"bar"}]}
```

4) "When do we break even?"
```pricing-chart
{"kind":"breakeven","title":"Path to break-even"}
```

CLOSING
Be concise, direct, specific. Reference actual numbers from the snapshot — never recompute the model's outputs independently. Label every external claim as an assumption to verify. Give the user something they can act on this week.
````

### 6.3 Voice blocks

```
{{VOICE_BLOCK}} = founder:
RESPONSE STYLE: FOUNDER. You are talking to someone who owns the business but is not a pricing specialist. Explain like a smart friend who has done this before. Avoid jargon, or define it in four to six words the first time. Short sentences. Plain paragraphs, not bullet soup. At most one number per idea and round generously. Skip hedging. If the honest answer is technical, give it in everyday language first, then add ONE optional sentence of depth at the end.

{{VOICE_BLOCK}} = analyst:
RESPONSE STYLE: ANALYST. You are talking to someone fluent in pricing and unit economics. Use the vocabulary — price elasticity, contribution margin, CAC payback, expansion revenue, discount leakage, blended vs cohort — without over-explaining. Be direct, quote percentages to one decimal, and reference specific line items from the snapshot. Prefer a short narrative followed by a bulleted breakdown. State the assumptions you are making.
```

### 6.4 Volatile block — `volatileBlock.ts`

```ts
export function renderVolatileBlock(snap: PricingSnapshot): string;
```

Emit sections in exactly this order. Every monetary value passes through `money()`.

```
CURRENT SCREEN
The user is looking at the "<screen.label>" screen<, focused on: section>. Answer for what is
visible here first, then widen if it helps.

CURRENCY AND PERIOD
Display currency: <display> (<symbol>). Billing period: <billingPeriod>.
[if display !== base]
  Snapshot figures below are already converted to <display> at 1 <base> = <rate> <display>.
  Quote them as written. Do not write "<base>" anywhere unless the user asks for it.
[else]
  Snapshot figures are already in <display>. Quote them as written.
Reference rates for any other currency the user asks about: <list>

PRODUCT
<name> · <category> · <market> · <businessModel> · launch <launchDate | "not set">

ACTIVE SCENARIO
Conservative (×<m>) · Base (×<m>) · Aggressive (×<m>)   ← ACTIVE: <label>
The multiplier scales <scenario.appliesTo>.
Guidance: Conservative = downside floor, use for "what's the worst case" and minimum-viable
pricing. Base = the user's own best estimate, the default for planning. Aggressive =
upside case, use for "what if this really works". When asked "will this work?", default to
Base. When asked "what's the minimum I need?", use Conservative.
The verdict figures below are all computed under the ACTIVE scenario.

COST STRUCTURE
Fixed costs: <money>/mo · Blended COGS per customer: <money> · Variable: <pct> of revenue

PRICING TIERS (<n> total<, N more not shown>)
  · <name>: list <money> | net <money> | COGS <money> | gross margin <pct> |
    expected mix <pct> | features: <first 4, comma-joined>
NOTE: a single tier's margin is not the business's margin. A negative or thin margin on an
entry tier can be correct if it feeds upgrades — check the blended figure and the upgrade
path before calling it a problem.

CUSTOMER SEGMENTS (<n> total)
  · <name>: size <count> | WTP <low>–<median>–<high> | CAC <money> | LTV <money> |
    payback <n> months
NOTE: stated willingness to pay overstates real willingness to pay. Treat a survey median
as a ceiling, not a target. CAC payback over 12 months is normal in enterprise — judge it
against this company's cash position, not a generic benchmark.

COMPETITORS (<n> total) — entered by the user, may be stale
  · <name>: list <money> (<billingPeriod>) | net <money | "not known"> |
    feature score <n | "not scored"> | source: <source> | recorded <asOf>
NOTE: these are the user's own records. Never treat them as current market truth, and never
add a competitor or a price that is not on this list.

FORECAST (<horizonMonths> months, ACTIVE scenario)
Month 1: MRR <money>, customers <count>
Month <mid>: MRR <money>, customers <count>
Month <last>: MRR <money>, customers <count>
Peak monthly gross profit: <money> (month <n>)
Cumulative cash at end of horizon: <money>

VERDICT (ACTIVE scenario)
Blended gross margin: <pct> · Contribution margin: <pct>
Break-even: month <n> | does not break even within <horizonMonths> months
LTV:CAC: <ratio | "not computable — CAC or LTV missing">
Overall: <label>

[if research.wtp]
WILLINGNESS-TO-PAY RESEARCH
<method>, n=<n>, collected <asOf>. Marginal cheapness <money> · marginal expensiveness
<money> · optimal price point <money> · indifference point <money>.
You CAN and SHOULD use this when the user asks what to charge. To visualise it, emit a
"wtpCurve" chart rather than quoting the numbers into a "quoted" chart.

[if research.winLoss]
WIN/LOSS DATA
n=<n>, collected <asOf>. <pct> of losses cited price. Top objections: <list>.

RECENT PRICING DECISIONS (<n> total, 5 latest)
  · <date> [<tag>]: <note>
Reference these when the user asks about past decisions. Never invent one that is not listed.

SERIES CATALOG — dynamic keys for this workspace
Per tier (x-axis = tier):
  · tier.<slug>.grossMarginPct — <name> gross margin (percent, tier)
  … one per tier, per competitor, per segment …
Use only keys that appear here or in the static catalog. Do not invent keys.
```

If any collection is empty, print `(none yet)` and add a one-line note about what the user
should add — never omit the section silently.

---

## 7. Server — `src/advisor/server/chatRoute.ts`

### 7.1 Endpoint

```
POST /api/advisor/chat
Body: {
  threadId: string,
  message: string,                       // ≤ 4000 chars, rejected above
  voice: 'founder' | 'analyst',
  screen: { key: ScreenKey, section?: string },
  history: Array<{ role: 'user'|'assistant', content: string }>   // client sends last 8
}
Response: text/event-stream
```

SSE events emitted to the client:

```
event: delta   data: {"text":"…"}          // one per text delta
event: done    data: {"usage":{…}}          // normal completion
event: error   data: {"code":"…","message":"…"}   // terminal; see §13
```

### 7.2 Handler steps, in order

1. Authenticate; resolve `workspaceId`. Reject if the user cannot read that workspace.
2. Rate limit per workspace (suggested: 20 messages/min, 400/day). 429 → `error` event.
3. Validate body. `message` non-empty and ≤4000 chars. `history` ≤8 entries, each ≤8000 chars.
4. `const snap = buildPricingSnapshot({ workspaceId, screen })`.
5. `const volatile = renderVolatileBlock(snap)`.
6. Call Anthropic (§7.3), streaming.
7. **Before streaming any content, check `stop_reason`.** On `'refusal'`, emit an `error`
   event with code `refused` and stop — do not emit partial content as a normal answer.
8. Pipe text deltas as `delta` events.
9. On completion emit `done` with token usage.
10. Log: `workspaceId`, `threadId`, prompt version, `usage.*`, latency, `stop_reason`.
    **Never log `volatile`, the user message, or the response body** — customer financial data.

### 7.3 Anthropic call — `anthropic.ts`

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();   // reads ANTHROPIC_API_KEY from env

export function streamAdvisor(args: {
  voice: 'founder' | 'analyst';
  history: Anthropic.MessageParam[];
  userText: string;
  volatile: string;
}) {
  return client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 8000,                         // covers thinking + visible text
    output_config: { effort: 'medium' },      // sweep in Task 14
    system: [{
      type: 'text',
      text: STABLE_PREFIX[args.voice],
      cache_control: { type: 'ephemeral' },
    }],
    messages: [
      ...args.history,
      { role: 'user',   content: args.userText },
      { role: 'system', content: args.volatile },   // last; follows a user turn
    ],
  });
}
```

Notes:
- Thinking is **on by default** on this model and shares `max_tokens` with the answer.
  8000 leaves comfortable headroom; do not drop it to "expected answer length".
- Do not send `temperature`, `top_p`, `top_k`, or `budget_tokens` — all rejected.
- `output_config.effort` accepts `low | medium | high | xhigh | max`. Start at `medium`.
- Optional hardening: use `client.beta.messages.stream` with
  `betas: ['server-side-fallback-2026-07-01']` and `fallbacks: 'default'` so a safety
  decline is re-served automatically rather than surfacing as an empty answer. Add this
  only after the plain path works.
- For the background JSON paths (§14 Task 16), use `output_config.format` with a JSON
  schema and a **separate minimal system prompt** — never `STABLE_PREFIX`, which would
  corrupt JSON with markdown and chart instructions.

---

## 8. Client

### 8.1 Store — `store.ts`

State:

```ts
{
  open: boolean;
  expanded: boolean;
  minimized: boolean;
  voice: 'founder' | 'analyst';
  activeThreadId: string;
  threads: Record<string, AdvisorThread>;
  pendingThreadIds: Set<string>;         // NOT a DOM flag — survives close/reopen
  errorByThreadId: Record<string, string>;   // transient; cleared on next send
  recentByScreen: Record<ScreenKey, string[]>;   // ≤8 each
}
```

Persist `threads`, `voice`, `expanded`, `activeThreadId`, `recentByScreen`. Do **not**
persist `pendingThreadIds` or `errorByThreadId`.

Actions: `send`, `switchThread`, `clearActiveThread`, `setVoice`, `toggleExpanded`,
`minimize`, `close`, `markRead`.

`send(text)` sequence:
1. Push the user message. Push `text` to `recentByScreen[currentScreen]` (dedup, cap 8).
2. Add `threadId` to `pendingThreadIds`; clear any error for it. Persist.
3. Open the SSE connection. Append deltas to a streaming buffer rendered live.
4. On `done`: commit the buffer as an assistant message, remove from `pendingThreadIds`,
   persist. If the panel is closed / minimized / on another thread, `unread += 1` and light
   every launcher badge.
5. On `error`: remove from `pendingThreadIds`, set `errorByThreadId[threadId]`. **Never
   push an assistant message.**

### 8.2 Components

| Component | Responsibility |
|---|---|
| `Launcher` | FAB + unread badge; hidden while the panel is open |
| `ChatPanel` | Shell, backdrop, header, voice toggle, status pills |
| `ThreadRail` | Horizontal pill row, active state, per-thread unread |
| `MessageList` | Renders from state (not append-only), hydrates charts, shows typing/streaming, shows transient error |
| `Composer` | Chips + auto-growing textarea + send |

`MessageList` must re-render the whole thread from state on: thread switch, panel open,
message commit, clear. Destroy all chart instances before replacing DOM (§10.5).

Status pills read from a live selector, not the snapshot: `Base scenario` ·
`<blendedGrossMarginPct>% margin` · `Break-even mo <n>` (or `No break-even`).

---

## 9. Markdown renderer — `render/markdown.ts`

### 9.1 Contract

```ts
export function renderAdvisorMarkdown(raw: string): string;   // returns HTML
```

Pipeline, in this exact order:

1. `extractChartBlocks(raw)` → `{ text, blocks }` (§10.1)
2. HTML-escape **all** of `text` — `& < > " '`
3. Block-level parse on the escaped text
4. Inline parse (inline code first, so its contents are not reprocessed)
5. `applyToneMarkers(html)` (§9.3)
6. `inlineChartPlaceholders(html, blocks)` (§10.1)

### 9.2 Supported subset

Block: paragraphs, `#`–`######`, `-`/`*`/`1.` lists with nesting, `>` blockquote, `|` tables
with a separator row, `---` rule, fenced and indented code.
Inline: `**bold**`, `__bold__`, `*em*`, `_em_`, `~~strike~~`, `` `code` ``, `[text](url)`.

**Link scheme allow-list:** `http:`, `https:`, `mailto:`, `#`, `/`. Anything else renders
as the link's plain text, never as an `<a>`. All external links get
`target="_blank" rel="noopener"`.

Scope all output under a single class (e.g. `.adv-md`) so AI-generated markup cannot
inherit or leak app styles.

### 9.3 Tone markers — `toneMarkers.ts`

Runs on the **HTML** produced by the markdown pass (curly braces are not markdown syntax,
so they survive it).

```ts
html.replace(/\{([+\-!~])\s*([^{}]*?)\s*\}/g, (_, sym, body) =>
  `<span class="adv-tone adv-tone--${MAP[sym]}">${body}</span>`);
// MAP: '+' → 'pos', '-' → 'neg', '!' → 'warn', '~' → 'dim'
```

Nested formatting inside a marker must survive: `{+ **+12pt** margin}` → a positive span
containing a `<strong>`.

### 9.4 Required tests — `markdown.test.ts`

| Input | Expected |
|---|---|
| `[x](javascript:alert(1))` | renders as text `x`, no `<a>` |
| `[x](data:text/html,<script>)` | renders as text `x`, no `<a>` |
| `<img src=x onerror=alert(1)>` | escaped, renders literally |
| `` `<b>not bold</b>` `` | inside `<code>`, escaped |
| `{+ **12%** up}` | one `.adv-tone--pos` span containing `<strong>12%</strong>` |
| `{unclosed` | rendered as literal text |
| `` `{+not a marker}` `` | literal inside code, no span |
| A 3-column table with alignment row | valid `<table>` |
| `- a\n  - b\n- c` | nested `<ul>` |

---

## 10. Chart pipeline

### 10.1 Extraction — `charts/extract.ts`

```ts
export function extractChartBlocks(raw: string, msgId: string):
  { text: string; blocks: Array<{ chartId: string; payload: ChartSpec | null; parseError: string | null }> };
```

Three passes, in order. Each match is replaced with a sentinel token surrounded by blank
lines (so the markdown pass makes it its own paragraph):

1. **Correct fence:** `/```\s*pricing[-_ ]?chart\s*\n?([\s\S]*?)```/gi`
2. **Wrong language tag:** `/```(?:json|JSON|js|javascript)?\s*\n?(\{[\s\S]*?\})\s*```/g` —
   only substitute when the body contains `"kind"\s*:\s*"(<known kinds>)"`.
3. **No fence at all:** loop up to 10 times matching a balanced-ish object containing
   `"kind":"<known kind>"` on the plain text.

Sentinel: `PRICINGCHARTPLACEHOLDER<chartId with dashes removed>`.

`inlineChartPlaceholders(html, blocks)` replaces both `<p>SENTINEL</p>` and a bare
`SENTINEL` with `<div class="adv-chart-slot" data-chart-id="…"></div>`.

**Orphan rescue:** after `innerHTML` is set, query `pre[data-lang="pricing-chart"]` and
hydrate those too. The user must never see raw JSON.

### 10.2 Catalog — `prompt/catalog.ts`

```ts
export function buildSeriesCatalog(): SeriesCatalog;         // static + dynamic
export function renderDynamicCatalogText(cat: SeriesCatalog): string;   // for §6.4
```

Static keys exactly as listed in §6.2. Dynamic keys generated per entity:
`tier.<slug>.grossMarginPct`, `tier.<slug>.netPrice`, `competitor.<slug>.listPrice`,
`segment.<slug>.paybackMonths`, etc. `slug` = lowercased name, non-alphanumerics → `-`,
deduplicated with a numeric suffix.

Every `get()` reads live app state at render time — never a cached snapshot.

### 10.3 Validation — `charts/validate.ts`

```ts
export function validateChartSpec(spec: unknown, cat: SeriesCatalog): ChartSpec;  // throws
```

Reject with a readable message:

| Condition | Message |
|---|---|
| `kind` missing or unknown | `Unknown chart kind: "<x>"` |
| `custom` with 0 or >6 datasets | `Custom charts take 1–6 datasets` |
| `custom` series not in catalog | `Unknown series: "<key>"` |
| `custom` datasets with differing `xAxis` | `Cannot mix <a> and <b> on one chart` |
| `custom` datasets with differing `unit` | `Cannot mix <a> and <b> units on one chart` |
| any non-`quoted` spec containing `data`/`values`/`labels` | `Chart data is supplied by the app, not the model` |
| `quoted` with <2 or >12 items | `Quoted charts take 2–12 items` |
| `quoted` item value not a finite number | `Quoted values must be plain numbers` |

Caller enforces **one chart per message**: render the first valid block; replace any
subsequent block with the badge `Only one chart per reply.`

### 10.4 Recipes — `charts/recipes.ts`

```ts
export const RECIPES: Record<ChartSpec['kind'], (spec: ChartSpec) => ChartConfig | null>;
```

Each returns a chart config for the host chart library, or `null` when there is not enough
data (renders an empty card, not an error). Each sets `_title` and `_subtitle`, stripped
before instantiation.

| Kind | Shape |
|---|---|
| `revenueForecast` | Line: `forecast.mrr` over `monthLabels`. Subtitle: scenario + horizon. |
| `breakeven` | Line `pnl.cumulativeCash` + a marker at `verdict.breakEvenMonth`; line goes green after crossing, red before. Subtitle: `Break-even month <n>` or `No break-even in <n> months`. |
| `priceLadder` | Horizontal bars: your tiers (accent) + competitors (muted), sorted by price. Uses `listPrice` unless `params.net === true`. |
| `marginByTier` | Stacked bars per tier: COGS + gross margin. |
| `wtpCurve` | Van Westendorp four-line chart from `research.wtp`. Returns `null` if absent. |
| `sensitivity` | Dual axis: `sensitivity.revenue` (bars) + `sensitivity.margin` (line). |
| `quoted` | Horizontal bars from `spec.items`, verbatim, unit from `spec.unit`. |
| `custom` | Assembled from validated series. |

**Currency rule:** recipes return values in the **base currency**. The shared axis/tooltip
formatter converts once to display currency. Converting inside a recipe double-converts —
this was a real bug in the source implementation.

### 10.5 Rendering — `charts/render.ts`

```ts
export function renderChartBlocks(root: HTMLElement, blocks: Block[]): void;
export function destroyAdvisorCharts(): void;
```

Per block: find the slot → validate → build config → replace the slot with a card + canvas
→ instantiate → register in a module-level map keyed `advchart-*`.

Failure handling, each scoped to that one chart only:
`parseError` → badge · unknown kind → badge · validation throw → badge with the message ·
recipe returns `null` → empty card "Not enough data to draw this yet" · library throws →
badge. **The surrounding answer always renders.**

`destroyAdvisorCharts()` runs before every full re-render and on clear.

---

## 11. Styles — `styles/advisor.css`

Use the host app's design tokens. Where none exists, use these values.

| Element | Spec |
|---|---|
| Launcher FAB | 52px circle, `bottom:28px; right:28px`, accent gradient, `box-shadow:0 4px 24px <accent>59`, hover `scale(1.08)` |
| Unread badge | 18px pill, top-right `-4px`, danger colour, white 11px/700 text, 2px ring in page bg, `scale(0)→scale(1)` 0.3s pop |
| Panel | `position:fixed; top:0; right:0; bottom:0; width:460px; z-index:600`, surface bg, 1px left border, `box-shadow:-8px 0 40px rgba(0,0,0,.5)`, `transform:translateX(100%)` → `0`, `transition:transform .28s cubic-bezier(.4,0,.2,1), width .26s` |
| Expanded | `width:min(760px, calc(100vw - 260px))` |
| Backdrop | `position:fixed; inset:0; background:transparent; z-index:599` — click-to-close, **no tint, no blur** |
| Header | Elevated surface, 12/14px padding, 1px bottom border |
| Voice toggle | Inline segmented control, 3px padding, 6px radius; active = filled accent, 10px uppercase mono |
| Status pills | 5px-gap row, small mono chips |
| Thread rail | Horizontal scroll, 3px scrollbar, avatar + name pills |
| Message list | `flex:1; overflow-y:auto; padding:14px; gap:12px; display:flex; flex-direction:column` |
| User bubble | Right, accent-tinted gradient, 1px accent border, `border-radius:12px 12px 2px 12px`, `max-width:88%` |
| Assistant bubble | Left, elevated surface, 1px border, `border-radius:12px 12px 12px 2px`, 12px/1.75 |
| Role label | 9px, 700, `letter-spacing:.1em`, uppercase, accent |
| Typing dots | Three 6px accent dots, 1.2s pulse, delays 0 / .2s / .4s |
| Chart card | Elevated surface, 8px radius, 10px padding; title 12px/700; subtitle 9px uppercase mono; canvas wrap 180px |
| Chart error badge | 10px mono, danger colour, dashed danger-tinted border, 4px radius |
| Chips | 10px mono, `background:var(--surface-3)`, 4px radius; hover → accent border + tinted bg |
| Recent chips | Same, dashed border, muted text, `↺ ` prefix, ellipsis at 42 chars |
| Textarea | Auto-grow 38→120px, accent focus border |
| Send button | 36px square, 8px radius, accent gradient |
| Tone chips | `.adv-tone{display:inline;padding:1px 4px;border-radius:3px;font-weight:600}` — pos/neg/warn/dim map to success / danger / warning / muted, each on its own dim background |

**Mobile (`max-width:768px`):**

```css
#advisor-panel {
  width: 100vw !important; border-left: none !important;
  top: var(--adv-vv-top, 0px) !important; bottom: auto !important;
  height: var(--adv-vvh, 100dvh) !important;
}
#advisor-panel .adv-textarea { font-size: 16px !important; max-height: 96px !important; }
#advisor-panel .adv-input-area { padding-bottom: calc(env(safe-area-inset-bottom,0px) + 8px); }
#advisor-panel .adv-messages { overscroll-behavior: contain; min-height: 0; }
#advisor-panel .adv-expand-btn { display: none !important; }
```

Set `--adv-vv-top` / `--adv-vvh` from the `visualViewport` API on `resize` and `scroll`.
**Top-anchoring is required** — on iOS the layout viewport does not shrink for the
keyboard, so a `bottom:0` anchor buries the input underneath it.

---

## 12. Chips — `client/chips.ts`

Shown only when the active thread is empty. Below them, a divider, the label
`Recent on <Screen>`, and up to 4 dashed recent-query chips from
`recentByScreen[currentScreen]`.

```ts
export const CHIPS: Record<ScreenKey, string[]> = {
  overview:    ['📊 Is this pricing plan viable?', '⚠️ Biggest risk in my pricing',
                '🎯 What should I fix first?', '💰 Sanity-check my margins'],
  costs:       ['📊 What is my true unit cost?', '📈 Which costs scale with customers?',
                '⚠️ My margin floor per tier', '💡 Where is the cost leverage?'],
  packaging:   ['🎯 Are my tiers differentiated enough?', '💰 Am I leaving money on the table?',
                '💡 Should I add or cut a tier?', '📊 Which feature drives upgrades?'],
  competitors: ['📊 Where do I sit on price?', '🎯 Am I priced to win or to lose?',
                '🔍 Who is my real alternative?', '💡 How do I justify a premium?'],
  research:    ['📊 What does my WTP data say?', '⚠️ Is this sample trustworthy?',
                '💰 Price point from this survey', '🔍 What is missing from my research?'],
  forecast:    ['🎯 When do I break even?', '⚠️ Stress-test this forecast',
                '📉 What if churn doubles?', '📊 Conservative vs aggressive'],
  launch:      ['💰 Should I discount at launch?', '🎯 Founding-customer pricing?',
                '📈 When do I raise prices?', '⚠️ Do I need a grandfathering plan?'],
  settings:    ['⚙️ Review my assumptions', '🔍 Explain my scenario multipliers',
                '💡 Am I using sensible defaults?', '🎯 What should I tune?'],
};
```

Chip text is carried in a `data-` attribute and read via `dataset`. **Never splice chip or
history text into an inline handler string** — persisted chat history is untrusted input.

---

## 13. Errors — `server/errors.ts` + client

| Condition | SSE code | Message shown |
|---|---|---|
| 401 from Anthropic | `auth` | `The advisor is unavailable right now. Please contact support.` |
| 429 from Anthropic | `rate_limited` | `The advisor is busy. Try again in a moment.` |
| Local rate limit | `throttled` | `You've hit the message limit. Try again shortly.` |
| `stop_reason === 'refusal'` | `refused` | `I can't help with that one. Try rephrasing, or ask about your own pricing model.` |
| 5xx / overloaded | `upstream` | `Something went wrong reaching the advisor. Try again.` |
| Network drop mid-stream | `interrupted` | `The connection dropped. Try again.` |
| Validation failure | `bad_request` | `That message couldn't be sent.` |

Client rules:
- Render as a transient red line in the thread, styled as system text, **not** as a message
  bubble. Cleared on the next send.
- **Never write an error into thread history.** An error persisted as an assistant turn
  gets re-sent as context on every later message and poisons the conversation.
- On `interrupted` with partial text already streamed: discard the partial, show the error.

---

## 14. Build order

Each task ends with a verifiable acceptance criterion. Do them in order.

| # | Task | Acceptance |
|---|---|---|
| 1 | Map §4 types onto the real schema; locate/extract the calculation layer | `PricingSnapshot` compiles against real selectors; every derived number has exactly one owner |
| 2 | `buildPricingSnapshot()` | Returns a populated snapshot for the `full` fixture |
| 3 | **Drift test (§5.4)** | Passes on all three fixtures; no `NaN`/`undefined` in `sparse` |
| 4 | `format.ts` | Converts correctly for all currencies; no scientific notation on `edge` |
| 5 | `STABLE_PREFIX` + voice blocks | Token count > 512; both variants render |
| 6 | `renderVolatileBlock()` | Golden-file test per fixture; empty collections print `(none yet)` |
| 7 | Server route + streaming | A hardcoded question streams into `curl` end to end |
| 8 | Cache verification | `usage.cache_read_input_tokens > 0` on the second message of a thread |
| 9 | Store + panel + composer (text only) | Full conversation on desktop and phone; close mid-request, reopen, answer lands |
| 10 | Markdown renderer + tone markers | All §9.4 tests pass |
| 11 | Series catalog (static, then dynamic) | Every key returns aligned `xValues`/`values` arrays |
| 12 | Extraction + validation | Malformed blocks produce badges; correct blocks produce specs |
| 13 | Recipes `breakeven`, `revenueForecast`, `priceLadder`, `quoted` | All four render from live data; currency correct in axes *and* tooltips |
| 14 | Recipes `marginByTier`, `sensitivity`, `wtpCurve`, `custom` | Render; `custom` rejects bad specs with readable badges |
| 15 | Chips, recent history, status pills, voice toggle | Chips change with screen; both voices differ in wording, not numbers |
| 16 | Eval set (§15) + effort sweep | ≥95% pass; effort chosen per route |
| 17 | Report + memo vault (optional) | Four balanced cards; saved and diffable |

**Interim milestone worth shipping internally: end of Task 10** — a text-only advisor that
is fully grounded. Charts are polish on top of a correct foundation.

---

## 15. Eval set — `src/advisor/evals/`

40–60 cases across three fixture workspaces. Each asserts a *behavior*, not wording.
Run against a recorded transcript; assertions are programmatic.

| Category | Cases | Assertion |
|---|---|---|
| Numeric fidelity | 8 | Every number in the answer appears in the snapshot (allow rounding to 1dp) |
| Currency | 4 | No currency symbol other than the display currency; no `SEK`/`USD` string when display differs |
| Period | 3 | Monthly and annual figures are never compared without both being labelled |
| Ambiguity | 6 | "What's my margin?" on Forecast either asks, or uses blended and says so |
| Chart discipline | 6 | ≤1 chart; no unknown kind; every `quoted` value appears in the narrative |
| Hallucination | 5 | Asked about a competitor not in the data → says it doesn't have it |
| Assumption labelling | 4 | Any industry benchmark is labelled as an assumption |
| Compliance | 4 | Coordination-flavoured prompts declined and reframed; regulated topics flagged |
| Voice | 4 | Founder answers contain no unglossed term from a jargon list |
| Empty state | 4 | Near-empty workspace produces guidance, not invented numbers |
| Robustness | 4 | 8-turn conversation stays consistent; a mid-thread scenario switch is reflected |

Effort sweep: run the full set at `low`, `medium`, `high`. Pick the lowest tier that holds
pass rate; consider `claude-sonnet-5` for chip-initiated questions if quality holds.

---

## 16. Do not do these

1. **Do not let the model supply chart data** for any kind except `quoted`.
2. **Do not convert currency inside a chart recipe.** The shared formatter converts once.
3. **Do not persist errors as assistant messages.**
4. **Do not put the snapshot before the user message** in `messages` — the mid-conversation
   system message must follow a user turn and be last, or the API returns 400.
5. **Do not interpolate the voice, the date, a user ID, or a workspace ID into
   `STABLE_PREFIX`.** It would change the cached bytes on every request and kill caching.
6. **Do not send `temperature`, `top_p`, `top_k`, or `budget_tokens`.** All rejected on this model.
7. **Do not size `max_tokens` to the expected answer length.** Thinking shares that budget.
8. **Do not use `STABLE_PREFIX` for JSON-only background calls.** Use a minimal prompt plus
   `output_config.format`.
9. **Do not splice model or history text into inline event handlers.** `data-` attributes only.
10. **Do not skip the orphan-rescue pass.** Without it, a mis-fenced block shows the user raw JSON.
11. **Do not log the snapshot, the user message, or the response body.**
12. **Do not add a tint or blur to the backdrop.** The user needs to read their pricing model
    while asking about it.

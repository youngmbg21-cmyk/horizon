# Horizon AI Advisor — Design & Behaviour Spec

A complete description of how the Horizon AI Advisor chatbot works, written so the
same experience can be rebuilt on another platform (React Native, a different web
stack, a native app, a different LLM provider).

Everything described here lives in `index.html`. Key entry points:

| Piece | Where |
|---|---|
| Panel markup | `index.html` (search `id="ai-panel"`) |
| Panel styles | `#ai-fab`, `#ai-panel`, `.aip-*`, `.ai-msg*`, `.ai-chart-*` |
| Chat surface / threads | `_seedChatThreads`, `aipRenderActiveThread`, `switchChatThread` |
| Send loop | `aipSend` → `sendToAI` |
| The prompt | `buildAIContext`, `buildPersonalContext`, `langDirective` |
| Markdown renderer | `mdParse`, `_enhanceAIMarkup`, `_sanitizeAIMarkdown` |
| Inline charts | `AI_CHART_RECIPES`, `buildSeriesCatalog`, `_extractAIChartBlocks`, `_renderAIChartBlocks` |
| Shared snapshots | `SNAPSHOT_RECIPES`, `shareSnapshot` |

---

## 1. What it is in one paragraph

A slide-in chat panel that sits over the app and always knows exactly what the user
is looking at and exactly what their numbers are. Every question is answered against
a freshly-built snapshot of the user's real financial state, in the currency and
language they've selected, in one of two voices they choose (Simple or Expert). The
answer comes back as rich formatted text with colour-coded numbers, and — when it
helps — a **real chart drawn from live app data**, not from numbers the model made up.

---

## 2. The three design principles that matter most

If you port nothing else, port these. They are what make the output trustworthy.

### 2.1 One source of numeric truth

Every number in the prompt is read through the app's shared financial engine (`FE`),
the same engine that renders the on-screen cards. The model never sees a number the
user can't also see on screen. There is no separate "AI data path", so the advisor
and the UI can never disagree.

> Port rule: build the AI context from your existing view-model / selectors, never
> from raw storage and never with its own maths.

### 2.2 The client owns the data; the model only owns the *choice*

When the advisor wants to show a chart, it does **not** emit data. It emits a tiny
JSON block naming a chart *kind* (or a *series key*), and the client builds the chart
from live state:

````
```horizon-chart
{ "kind": "runway", "title": "Will my money last?" }
```
````

The prompt says this explicitly: *"You MUST NOT include any data points, labels, axis
values, or numbers inside the block. You only pick a kind."*

This makes hallucinated chart data structurally impossible. There is exactly one
exception, `"kind": "quoted"`, where the model supplies values — and it is only
allowed to plot numbers it already wrote in the same reply, so the chart can never
contradict its own narrative.

### 2.3 Guard the ambiguities in the prompt, not in the answer

The app has two different things called "expenses" (today's household budget vs.
planned retirement spending). Rather than hope the model guesses right, the prompt
contains a labelled **(A) vs (B)** section plus explicit routing rules ("if the user
is on the Retirement panel and says 'expenses', they mean (B)…") and a hard fallback:
*"When ambiguous, ASK before quoting a number. Never guess."*

> Port rule: enumerate your product's overloaded words and disambiguate them in the
> system prompt with routing rules.

---

## 3. Feature list

### Conversation
- **Slide-in panel** from the right (460px), expandable to ~760px, full-screen on phones.
- **Threads.** The AI advisor and any friend chats share one surface. AI thread is
  pinned first; a thread rail across the top switches between them with unread badges.
- **Persistent history.** Threads live in app state and survive reload.
- **Answers wait for you.** If a reply lands while the panel is closed, minimized, or
  on another thread, the thread is marked unread and a red dot+count lights up on
  every launcher (desktop FAB, minimized tab, mobile FAB).
- **Pending state is state-driven,** not a DOM node — the typing indicator survives
  closing and reopening the panel mid-request.
- **Clear** wipes only the active thread.
- **Minimize** collapses to a small tab showing "N messages · click to expand".
- **Non-blocking backdrop.** Clicking outside closes the panel, but the backdrop is
  fully transparent — the app stays readable while you chat with it.

### Context awareness
- **Current view.** The prompt states which panel (and sub-section) the user is on:
  *"Tailor your answer to what's visible on this screen first, then zoom out."*
- **Suggestion chips per panel.** Empty threads show 4 starter questions tailored to
  the current tab (Retirement → *"Can I retire 2 years earlier?"*, Fun Fund → *"Can I
  afford my trips?"*, etc.), plus a **"Recent on <Panel>"** row of the user's own last
  queries on that panel (dashed chips, `↺` prefix, de-duplicated, capped at 8 stored / 4 shown).
- **Status pills** in the header: `Age 41 → 60` · `On track` · `78% funded`.
- **Uploaded bank/card statements.** If the user imported transactions, an aggregated
  summary of *all* of them is added to the prompt, and dedicated `spend.*` chart series
  become available.

### Voice
- **Simple / Expert toggle** in the header, persisted. It swaps a `RESPONSE STYLE`
  block in the system prompt:
  - *Simple* — "explain like you're talking to a smart friend new to personal finance",
    no jargon, short sentences, plain paragraphs, one number per idea, round generously.
  - *Expert* — assumes literacy, uses domain vocabulary (sequence-of-returns risk, real
    vs nominal, tax drag, basis points), quotes percentages to one decimal, short
    narrative + bulleted breakdown, calls out its own assumptions.
  - Hint text under the toggle: "Plain-language answers, no jargon." / "Full technical depth + assumptions."
- **Language.** A `LANGUAGE:` directive is prepended to every AI prompt in the app.
  Swedish mode instructs full Swedish output with correct financial vocabulary while
  the snapshot data stays English for stability.

### Output
- Rich markdown (headings, lists, tables, bold, links, code) via a custom safe parser.
- **Tone markers** — `{+good}` `{-bad}` `{!warning}` `{~muted}` render as coloured chips.
- **Inline live charts** — 7 chart kinds, plus a catalog of ~30 named data series
  (including per-account, per-pension, per-category series generated from the user's
  actual data).
- Graceful failure at every step (see §7).

### Privacy
- The Claude API key is entered in Settings, stored locally, never synced.
- Friend threads use a completely separate persona prompt and **never** receive the
  financial context. The empty-state literally says: *"Your financial snapshot is
  never shared with friends."*
- To share a number with a friend, the user taps a **Share a snapshot** chip, which
  drops a pre-built prose + chart card into the thread — deliberate, not automatic.

---

## 4. Visual design

### Tokens (dark theme; a light "clay" theme swaps the same names)

```
--bg0 #05080f   --bg1 #090d18   --bg2 #0d1220   --bg3 #111828   --bg4 #18243a
--border #1a2640   --border2 #263850
--text #e4ecf7   --text2 #7a8fb0   --text3 #3d506e
--green #00e8a0   --amber #f5a623   --red #ff4d6d   --violet #8b5cf6
--ff/--fb 'DM Sans'   --fm 'JetBrains Mono'   --fs 'Fraunces' (serif display)
```

The advisor's signature accent is **amber → orange** (`linear-gradient(135deg,#f5a623,#FF6B00)`)
— used on the FAB, the send button, the minimized tab, and the bot's name label. Green
is "positive/live data", red is "error/shortfall".

### Layout

| Element | Spec |
|---|---|
| Launcher FAB | 52px circle, bottom-right 28px, amber→orange gradient, `0 4px 24px rgba(255,184,0,.35)`, hover `scale(1.08)` |
| Unread badge | 18px red pill, top-right of launcher, `scale(0)→scale(1)` pop, 2px ring in page bg |
| Panel | fixed right, 460px, `--bg2`, 1px left border, `-8px 0 40px rgba(0,0,0,.5)`, slides in with `transform .28s cubic-bezier(.4,0,.2,1)` |
| Expanded | `min(760px, calc(100vw - 260px))`, animated width, capped so the sidebar stays visible |
| Backdrop | transparent, `z-index:599`, click-to-close only — **no tint, no blur** |
| Header | `--bg3`, ✦ logo, title "Horizon AI Advisor", sub "Aware of your financial context", then ⛶ expand / 🗑 clear / ▼ minimize / ✕ close |
| Mode toggle | inline segmented control; active Simple = green fill, active Expert = blue fill, 10px uppercase mono |
| Pills | 5px-gap row of small mono chips (age range, verdict, % funded) |
| Thread rail | horizontal scroll of avatar+name pills, 3px scrollbar, active pill highlighted |
| Messages | column, 12px gap, 14px padding |
| User bubble | right-aligned, amber-tinted gradient, 1px amber border, radius `12 12 2 12`, max-width 88% |
| Bot bubble | left-aligned, `--bg3`, 1px border, radius `12 12 12 2`, 12px/1.75 text |
| Bot label | 9px, 700, `.1em` tracking, uppercase, amber — "HORIZON AI" |
| Typing | three 6px amber dots, staggered 1.2s pulse (0 / .2s / .4s) |
| Chart card | `--bg3`, 8px radius, title (12px bold) + uppercase mono subtitle, 180px canvas |
| Chart error | 10px red mono text on a dashed red-tinted badge |
| Chips | 10px mono, `--bg4`, hover turns amber; recent chips are dashed and turn green |
| Input | auto-growing textarea 38→120px, amber focus border, 36px gradient send button |
| Empty state | large faded ✦, "Your AI Financial Advisor", one line of guidance |

### Mobile

Same panel, re-skinned by media query:
- Full width, no left border, expand button hidden.
- **Keyboard-safe height**: the panel is top-anchored to `--hz-vv-top` with height
  `--hz-vvh`, both fed from the `visualViewport` API — because on iOS the layout
  viewport doesn't shrink for the keyboard, so a `bottom:0` anchor buries the input.
- 16px input font (stops iOS auto-zoom), max-height capped at 96px.
- `env(safe-area-inset-bottom)` padding, `overscroll-behavior:contain` on the list.

---

## 5. The system prompt

Rebuilt from scratch on **every single turn** (`buildAIContext()`), so any state change
shows up on the very next message. Sections in order:

1. **Identity** — "You are HORIZON AI — a personal finance and life planning assistant
   embedded in Horizon Finance OS."
2. **Language directive.**
3. **Personal context** — citizenship and home base (for tax/visa/pension-portability
   reasoning), plus optional profile fields the user chose to fill in (salary, marital
   status, household income, and *verbatim* stated goals), plus the 5 most recent
   journal entries. Missing fields are simply omitted — a blank profile adds no noise.
4. **Current view** — which panel/section is open.
5. **Uploaded spend statement** (only if present) — aggregated transactions + a nudge
   to chart them with `spend.*` series rather than quoting numbers into a chart.
6. **Response style** — the Simple or Expert block.
7. **Value basis** — everything is in *today's money*; nominal figures must be labelled
   as such and never used as the headline.
8. **Currency output rule** — states the user's display currency, gives the *exact*
   conversion rate to use ("never a market/training-data rate"), a worked example, a
   double-conversion guard, and reference rates for every other currency.
9. **The (A) vs (B) expenses disambiguation** + routing rules (§2.3).
10. **The snapshot** — current month cash flow; the three retirement scenarios
    (Lean ×0.75 / Baseline ×1.0 / Comfortable ×1.3) with the active one marked and
    guidance on when to use each; line items tagged `[fixed]`/`[variable]`; ages and
    horizon; nest egg real *and* nominal; effective withdrawal tax rate; gross and net
    retirement income split by portfolio vs pension; coverage % and verdict; growth
    rates (nominal and real, accumulation and drawdown); depletion age; every investment
    account with its own growth rate and tax treatment; every pension with its start age
    and an explicit **gap warning** if it starts after retirement; planned trips with
    budget/spent/remaining; feasible retirement destinations.
11. **Chart instructions** — block format, the 7 allowed kinds and when to use each,
    hard rules (at most one chart, no invented kinds, no data inside the block, always
    reference the chart in the narrative, no charts for small talk).
12. **The series catalog** — every legal `series` key with its label, unit
    (currency/percent) and x-axis (age/month/destination/trip/property), including a
    **dynamically generated** section listing the user's actual accounts, pensions,
    expense categories and uploaded-spend series.
13. **Nine worked examples** of custom chart blocks.
14. **Closing instruction** — "Be concise, direct, insightful. Reference specific
    numbers from THIS snapshot — never recompute independently. Give actionable advice."

Inline teaching notes are sprinkled through the snapshot, e.g. a negative Fun Fund is
explicitly explained as *not* a deficit, with instructions on how to frame it; and
pension payouts carry an inflation-indexing caveat the model is told to raise when
relevant. These are worth copying — they prevent a whole class of confidently wrong,
alarming answers.

### Request shape

```js
POST https://api.anthropic.com/v1/messages
{ model: 'claude-opus-4-6',
  max_tokens: 900,                 // 600 originally; raised for chart headroom
  system: buildAIContext(),        // rebuilt every turn
  messages: thread.messages.slice(-8) }   // rolling 8-message window
```

Non-streaming — the reply arrives whole, then renders. HTTP status is checked *before*
parsing (401 → "Invalid API key", 429 → "Rate limited", else "API error N"); errors are
shown as a transient red bubble and **never** written into the thread as an assistant
turn, so a failure can't poison later context.

---

## 6. Output rendering pipeline

For every bot message:

```
raw markdown
  → _extractAIChartBlocks()   pull out chart specs, leave text sentinels
  → mdParse()                 safe markdown → HTML
  → _enhanceAIMarkup()        {+}{-}{!}{~} → coloured spans
  → _inlineAIChartPlaceholders()  sentinels → chart card divs
  → _renderAIChartBlocks()    instantiate Chart.js against live data
```

### The markdown parser (`mdParse`)

Hand-written, not a library, and deliberately small: paragraphs, headings h1–h6,
ul/ol with nesting, blockquotes, tables, `---` rules, fenced and inline code, bold,
italic, strikethrough, and links. Security-relevant behaviour to preserve:

- All text is HTML-escaped **first**; inline rules then run on escaped text.
- Link schemes are allow-listed (`http(s):`, `mailto:`, `#`, `/`). Anything else —
  `javascript:`, `data:` — renders as plain text, never as a live href.
- Chip/quick-reply text is passed through `data-` attributes, not spliced into inline
  `onclick` strings (persisted chat history is untrusted input).

Rendered output is scoped to a `.md` class so AI styling can never leak into the app.
Headings get an intentional hierarchy: h1 with a rule under it, h2 in green, h3 in
uppercase mono cyan, and list markers in green.

### Tone markers

The prompt teaches four inline markers; a post-pass converts them to coloured,
tinted-background spans:

| Marker | Meaning | Colour |
|---|---|---|
| `{+text}` | positive — surpluses, strong savings, coverage above target | green |
| `{-text}` | negative — shortfalls, deficits, overspend | red |
| `{!text}` | warning — needs attention, not critical yet | amber |
| `{~text}` | neutral context to de-emphasise | muted |

They survive the markdown pass (curly braces aren't markdown syntax) and support
nested formatting: `{+ **+12%** growth}` works.

### Inline charts

Seven kinds:

| Kind | What it draws |
|---|---|
| `runway` | Nest-egg longevity — balance line over stacked withdrawal/pension/shortfall bars |
| `nestEgg` | Projection to retirement, real, optional nominal overlay |
| `expense12mo` | Next 12 months of expenses |
| `cashflow12mo` | Income vs expenses with a surplus line |
| `retireAnywhere` | Destinations ranked by monthly surplus (green/amber/red = feasible/conditional/infeasible) |
| `quoted` | **The only kind where the model supplies values** — horizontal bars of figures it already stated in the same reply, 2–12 items, plain numbers only |
| `custom` | Assembled from 1–6 named series from the catalog, `line`/`bar`/`area`, optional stacking |

`custom` is validated against the catalog before rendering: unknown keys, mixed x-axes
(age vs month), and mixed units (currency vs percent) all throw readable errors that
surface as an inline badge instead of a broken chart.

Charts inherit the app's chart preset, so tooltips and axes format in the user's
selected currency automatically. (A past bug worth avoiding: recipes keep values in
the base currency and let the shared formatter convert — pre-converting inside the
recipe made every AI chart convert twice.)

---

## 7. Robustness — designed around the model misbehaving

This is a large part of the design and the least obvious part to port.

**Three-pass chart extraction.** Pass 1 catches the correct ` ```horizon-chart ` fence
(case- and whitespace-tolerant). Pass 2 catches ` ```json ` / ` ```js ` fences whose body
looks like a chart spec — a common drift. Pass 3 scans for **bare inline JSON** where
the model forgot the fence entirely, looping up to 10 times.

**Orphan rescue.** Anything that still slips through lands as a `<pre data-lang="horizon-chart">`
after parsing; the renderer finds those and hydrates them too. The user never sees raw JSON.

**Sanitizer for non-chat surfaces.** Analysis cards (which can't hydrate charts) strip
chart fences, chart-shaped JSON fences, and bare chart-spec objects before rendering —
applied at cache time, so old cached reports get cleaned by newer releases too.

**Structural post-processing.** The dashboard report asks for a fixed
`**Takeaway:** → 4 bullets → **Bottom line:**` shape so the four cards share a visual
silhouette. When the model writes prose instead, a client-side bulletizer splits the
middle zone into bullets — idempotent, and it bails out rather than guessing if the
structure is ambiguous. A 230–250 word budget is enforced per section, with a single
follow-up call for offenders and a deterministic truncate as the guaranteed floor.

**Every failure is scoped.** A parse error, an unknown kind, a build error or a Chart.js
error each replaces only that one chart with a small badge; the rest of the reply
renders normally. Not-enough-data returns an empty card ("Not enough data to render this
chart yet"), not a crash.

**Canvas hygiene.** Chart instances register in a shared map keyed `aichart-*` and are
destroyed before every re-render and on clear, so switching threads can't leak canvases.

---

## 8. Sibling AI surfaces (same output language)

The advisor's rendering stack is shared by the rest of the app's AI, which is why
porting the renderer once pays off four times:

- **Dashboard AI report** — a four-card executive brief (Current position / What's going
  well / Areas of concern / Recommendations), colour-coded per card, with mini-visuals
  and a coverage ring. Every recommendation bullet must start with an imperative verb
  and be actionable *this month*.
- **Retire Anywhere Deep Dive** — a long structured report per destination (cost of
  living, healthcare, visa & residency, tax, climate, real estate, pros & cons),
  personalised by citizenship and home base, cached because it takes 20–40s.
- **Property IQ full report** — same markdown rendering, report layout.
- **The Vault** — saved AI reports, badged by type, so the user can compare month over month.
- **Spend Insights** — the one caller that passes its **own minimal system prompt**,
  because it needs JSON only and `buildAIContext()`'s markdown/tone/chart instructions
  would corrupt it. Worth keeping that escape hatch in the port.

---

## 9. Port checklist

**Tier 1 — without these it isn't the same product**
1. Context builder wired to your shared calculation layer, rebuilt every turn.
2. Display-currency + real-vs-nominal enforcement in the prompt.
3. The overloaded-term disambiguation section with routing rules and "ask if ambiguous".
4. Simple/Expert voice toggle.
5. Client-owned charts: model picks a kind/series, client supplies data.
6. Safe markdown renderer with escaped text and allow-listed link schemes.
7. Tone markers + coloured spans.
8. Status-checked API calls; errors never persisted into thread history.

**Tier 2 — what makes it feel finished**
9. Per-panel suggestion chips + "Recent on <Panel>" history.
10. Persistent threads, state-driven pending indicator, unread badges on every launcher.
11. Transparent backdrop (app stays readable).
12. Keyboard-safe mobile panel via visual-viewport height.
13. Multi-pass chart extraction + orphan rescue + scoped error badges.
14. Series catalog with dynamically generated per-account/per-category keys.

**Tier 3 — depth**
15. Localisation directive on every prompt.
16. Journal + profile injection.
17. Structured-report template with client-side bulletizer and word-budget enforcement.
18. Friend threads with isolated persona prompts and explicit snapshot sharing.
19. Report vault with cache-time sanitisation.

**Platform notes.** The current build calls the API directly from the browser with the
user's own key (`anthropic-dangerous-direct-browser-access`) and stores it locally. On a
platform with a backend, move the key server-side — nothing else in this design changes.
Chart.js is assumed; any charting library works as long as the client, not the model,
supplies the data. `mdParse` is dependency-free and portable, but on React/RN you'd
likely swap it for a markdown renderer plus a custom node type for chart blocks — keep
the escaping and scheme allow-listing either way.

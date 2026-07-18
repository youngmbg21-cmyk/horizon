# scan.json — data contract

Write EXACTLY this shape to `.codemap/scan.json`. The bundled renderer reads it
verbatim; `scripts/build.mjs` validates it and fails loudly on mistakes.

```json
{
  "version": 1,
  "project": {
    "name": "string (<=48)",
    "slug": "lowercase-dashed (<=48)",
    "tagline": "one line (<=80, optional)",
    "iconDomain": "favicon domain, e.g. acme.com (optional)",
    "date": "YYYY-MM-DD (use today)"
  },
  "stats": { "agents": 0, "models": 0, "tools": 0, "integrations": 0,
             "bugs": 0, "simplify": 0, "improve": 0 },
  "topModels":       [ { "id": "gpt-4o", "label": "GPT-4o", "domain": "openai.com" } ],
  "topTools":        [ { "id": "exa", "label": "Exa", "domain": "exa.ai" } ],
  "topIntegrations": [ { "id": "stripe", "label": "Stripe", "domain": "stripe.com" } ],
  "graph": {
    "nodes": [
      { "id": "chat", "label": "Dashboard chat", "kind": "entry", "sub": "/api/chat" },
      { "id": "agent", "label": "Support agent", "kind": "agent", "sub": "streamText",
        "sourceRef": "src/agents/support.ts:42", "group": "Support",
        "detail": "Answers tickets with order lookups (<=200, optional)" },
      { "id": "gpt4o", "label": "GPT-4o", "kind": "model", "domain": "openai.com" },
      { "id": "billing", "label": "Billing service", "kind": "service",
        "sourceRef": "src/services/billing.ts" },
      { "id": "pg", "label": "Postgres", "kind": "store", "domain": "postgresql.org" }
    ],
    "edges": [
      { "from": "chat", "to": "agent", "kind": "triggers" },
      { "from": "agent", "to": "gpt4o", "kind": "calls" },
      { "from": "billing", "to": "pg", "kind": "writes", "label": "charges on trial end" }
    ]
  },
  "findings": [
    { "id": "f1", "kind": "bug", "severity": "high", "confidence": "med",
      "nodeId": "billing", "sourceRef": "src/services/billing.ts:88",
      "title": "Trial-end charge isn't saved atomically",
      "plain": {
        "what": "When a free trial ends, the app charges the card and then records the charge as two separate steps.",
        "impact": "If the second step fails, the customer is billed but the app has no record of it — so they look unpaid and may be billed again.",
        "fix": "Make 'charge the card' and 'record it' happen together as one all-or-nothing action so they can never disagree."
      },
      "tech": {
        "what": "The Stripe charge and the DB write in chargeOnTrialEnd() are not wrapped in a single transaction.",
        "impact": "If the charge succeeds but the DB write throws, the user is charged with no persisted record; a retry double-charges.",
        "fix": "Wrap charge+write in one transaction, or persist an idempotency key before charging and reconcile on retry."
      }
    }
  ]
}
```

## Graph rules (keep every map consistent and readable)
- Caps: `topModels` <= 3, `topTools` <= 10, `topIntegrations` <= 10,
  `graph.nodes` <= 60, `graph.edges` <= 120, `findings` <= 40. One map holds
  everything — AI flows AND business logic. Aim for 20-40 nodes on a substantial
  codebase; rich, not sparse, but every node earns its place.
- `kind` (node) is one of: `entry` (trigger/route/page/CLI), `cron` (scheduled
  job), `agent`, `model`, `tool`, `service` (internal business-logic module the
  app owns), `store` (DB/cache/index), `external` (3rd-party API).
- Give each distinct agent its own node when there are <= 10; merge only when
  numerous and near-identical (say so in `sub`, e.g. "12 near-identical scrapers").
  Chain agents with agent->agent edges when one feeds the next.
- `group` (optional, <=24): tag related nodes with a shared name so the renderer
  clusters them. Group by feature/domain a team would say ("Billing",
  "Ingestion"), not by folder. Use 2-3 groups of 3-6 nodes; leave hubs ungrouped.
- Labels: node `label` <= 28, `sub` <= 40, edge `label` <= 24.
- Edge `kind` (optional): `calls` | `reads` | `writes` | `triggers`. Prefer
  setting it. Add an edge `label` only when a phrase says more ("charges on trial
  end" — put business logic on edges).
- `domain`: favicon host, no scheme (openai.com, stripe.com, clickhouse.com). Add
  it to anything a recognizable company/product owns; omit for internal nodes.
  Use the product domain for models (gemini.google.com, claude.ai).
- `detail` (<=200) and `sourceRef` (repo path plus `:line`, <=120): add to
  internal nodes so a teammate can jump to code.
- Every edge `from`/`to` must reference an existing node id; all ids unique.

## Findings rules (honest, useful, and readable to BOTH audiences)
- `kind`: `bug` | `simplify` | `improve`.
- `severity`: `high` | `med` | `low` — impact if left as-is.
- `confidence`: `high` | `med` | `low` — how sure you are it's real. Be candid;
  a med/low-confidence bug is fine to report, but label it so.
- `title` <= 80: a short, mostly-plain headline.
- `nodeId` (optional): the graph node this sits on, so the map badges it.
  `sourceRef`: the `file:line` to look at — always include when you can.
- EVERY finding has two views, `plain` and `tech`, each with the SAME three
  fields, each <= 200 chars, 1-2 short sentences:
  - `what`   — what the issue (or enhancement) is.
  - `impact` — what it does / why it matters. For an enhancement, the benefit.
  - `fix`    — what needs to be done about it.
- `plain` is for a NON-technical reader: no jargon (avoid transaction, async,
  regex, parse, null, race condition, API, function names). Explain the cause in
  everyday words and the impact in terms of what a USER of the app would actually
  see or experience ("some bank statements won't show your income"). The fix says
  what should happen, not how to code it.
- `tech` is for a developer: precise. Name the function/mechanism, the exact
  failure mode, and a concrete code-level fix.
- Both views describe the SAME issue and must not contradict each other.
- De-duplicate: one finding per distinct issue; if a pattern recurs, say so in
  the detail ("same in 3 other handlers") rather than listing each.
- Rank most-severe / most-confident first. Prefer correctness bugs over style.
- Do not fabricate. If an area looks clean, report nothing there.

## stats
Set `agents`/`models`/`tools`/`integrations` to the true totals you found (not
just the `top*` shown). Set `bugs`/`simplify`/`improve` to the counts of each
finding kind. The renderer shows `bugs` in the header and derives the rest.

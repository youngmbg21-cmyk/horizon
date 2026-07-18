---
name: map
description: >-
  Build an interactive, self-contained HTML map of how a CODEBASE works plus a
  review layer flagging likely bugs, simplifications, and improvements — each
  pinned to a box on the map and the exact file:line, written in BOTH plain
  language and technical detail. Invoke on the explicit command "/map codebase"
  (or "/map" in a repo). Also use whenever the user wants to understand, map,
  diagram, visualize, audit, health-check, or review an app or repository — e.g.
  "how does this app work", "what does this use AI for", "find bugs / what can be
  simplified", "explain my app in plain English", "review this repo", or auditing
  an app built by a contractor or by AI. Trigger even without the words "map" or
  "review" when the user clearly wants an overview of an unfamiliar or large
  codebase or a read on its quality. SOURCE CODE only — NOT for geographic/GIS
  maps, mind maps, sitemaps, data/coordinate mapping, or Array.map questions.
  Produced as local files; nothing is uploaded.
---

# Codebase Map + Review

Turn any repository into two local files:
1. `.codemap/scan.json` — the data (architecture map + review findings).
2. `.codemap/scan.html` — a single self-contained interactive page that draws it.

The renderer is already built and bundled (`assets/renderer.html`) — you produce
the DATA and inject it with the build script. Do not hand-write HTML/CSS/JS.

## Why this shape
The value is a map a whole team can read *and act on*: the architecture shows how
the app fits together, and the findings sit on top of it so a bug is seen in the
context of the box it lives in. Two views (plain + technical) let a non-technical
owner and a developer read the same finding. Keeping it local (no upload) means
it's safe to run on private code.

## Workflow

### 1. Investigate the repo
Map the architecture and, as you read, collect review findings.

Architecture — find and trace:
- Entry points: routes, pages, webhooks, CLIs, queue/cron handlers.
- Core logic: internal services/pipelines the product owns (auth, billing,
  ingestion, workers, domain services).
- Data: databases, caches, indexes, file/blob stores.
- Integrations: third-party APIs and SDKs.
- If the app uses AI: where models run (generateText/streamText/generateObject,
  `@ai-sdk/*`, or direct provider HTTP like api.anthropic.com / api.openai.com),
  which models/providers, the tools models can call, and any agent loops. Treat
  agents, models, and tools as their own boxes.
- Flows: what triggers what, what reads/writes which store, which service calls
  which integration.

Review — as you read, note candidate findings:
- `bug`: logic errors, unhandled failures, races, wrong assumptions, missing
  null/empty/error handling, misused APIs, security smells.
- `simplify`: duplicated logic, dead code, needless complexity, over-broad state.
- `improve`: performance, safety, clarity, resilience, missing tests on risky spots.
Only report what you can point to in the code. Prefer fewer, higher-confidence
items over a long speculative list. Do not invent findings to fill a quota.

**For a large file or repo, split the review by subsystem and run several focused
reviewers in parallel** (e.g. "AI call paths", "data & sync", "core logic/math",
"input parsing"), then merge and de-duplicate. One pass under-finds; parallel
reviewers with narrow scope find far more. Give each a strict output schema so
their results merge cleanly.

### 2. Write `.codemap/scan.json`
Follow `references/data-contract.md` EXACTLY — read it before writing. It has the
full schema plus the graph rules and the two-view findings rules. Get the
findings' `plain` vs `tech` split right; that is the point of this skill.

### 3. Build the HTML
Inject the data into the bundled renderer:
```bash
node <skill>/scripts/build.mjs .codemap/scan.json
```
This validates the contract (unique ids, edge endpoints exist, caps, every
finding has plain+tech with what/impact/fix) and writes `.codemap/scan.html`. Fix
any reported error in `scan.json` and re-run — don't edit the HTML.

### 4. Verify it renders
The output is the deliverable, so confirm it actually works before handing it
over. Open `.codemap/scan.html` headless (Playwright + the pre-installed Chromium)
and assert: rendered `.node` count == `graph.nodes` length; rendered edge count ==
`graph.edges` length; findings listed == `findings` length; the Plain/Technical
toggle swaps the finding text; clicking a node opens the detail panel; clicking a
finding highlights its node; console errors == 0. Fix and re-verify on any
mismatch. See `references/verify.md` for a ready-to-run check.

### 5. Keep it local and deliver
Add `.codemap/` to `.gitignore` so the artifacts aren't committed unless the user
asks. Then give the user `.codemap/scan.html` — it renders in any browser, fully
offline. Nothing is uploaded.

## What the renderer gives the user (so you know what the data drives)
- Force-directed map, color-coded by node kind, with a legend that filters kinds.
- Drag nodes, scroll to zoom, pan; hover/select highlights a node's edges and
  dims the rest; click a node for a detail panel (label, sub, domain, detail,
  sourceRef, and its edges in words).
- A "N findings" button opens a panel; nodes with findings show a severity badge
  (high=red, med=amber, low=blue). A **Plain language ⇄ Technical** toggle
  (defaults to Plain) re-renders every finding, each shown as three labeled
  blocks: **What it is / What it does / How to fix**. Clicking a finding centers
  and highlights its node.
- Light/dark theme aware with a manual toggle.

## Honesty
An AI review surfaces *candidate* issues, not proven ones — some will be false
positives, and it won't catch bugs that only appear when the app runs. Label
confidence honestly and, for high-impact items, tell the user to verify before
acting. Do not oversell the findings.

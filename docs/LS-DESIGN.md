# THE LEGORA + STRIPE WAY (L+S) — the design rules for this app

Paste this whole file into the project's CLAUDE.md (or save it as `docs/LS-DESIGN.md` and point CLAUDE.md at it).
It is the agreed look and feel for every page. When building or changing anything a person sees, follow it.
Where an old page does not match it, the page is wrong, not the rule.

---

## 1. What L+S is, in one paragraph

**Stripe's frame with Legora's reading.** The frame comes from Stripe: calm white pages, one clear table per
page, tabs with counts, status as a soft coloured badge, filter chips, lots of white space, one accent colour,
and a side panel that explains the chosen row. The reading comes from Legora: nothing boxed that does not need
a box, every fact shows where it came from (the source's own words, quoted, with its reference number), the
work is answered right in its row, and there is one ask box for the assistant at the foot of the side panel.
The result: a page you can scan in two seconds, where every row tells you what it is, what state it is in,
and what to do next, without opening anything.

## 2. The four ways (always draw all four before building a new page)

Every design question is answered by drawing the same part of the page four ways, named for their idea
(never A/B/C), then the owner picks ONE by name. Only that one is built.

| Way | The idea | When it wins |
|---|---|---|
| **The SAP way** | White header band, labelled filters, a quiet list, details in a side panel | Dense admin data; people who want every control labelled |
| **The Legora way** | Nothing boxed, one quiet list; each fact shows where it was read (number + quoted words); work answered in its row; one ask box; tabs and chips | Careful reading of documents |
| **The Stripe way** | A calm table, numbers right-aligned, status a soft badge, "+ filter" chips, tabs with counts, white space, ONE accent; side panel with a small graphic and a timeline; figure cards ONLY on a "how are we doing?" page | Fast scanning of many records |
| **The Legora + Stripe way** | Stripe's frame with Legora's reading: each row carries the source's own words and their reference, work answered in the row, one ask box | The default. Usually the recommendation |

Every new page is drawn with L+S among its options.

## 3. The page anatomy (L+S)

From top to bottom, every list or work page has the same parts, in this order:

1. **The top bar** (app-wide): back arrow ‹, app name, where you are. Dark or white, one per app.
2. **The page head** — ONE row: the page's title (serif, calm), then tabs with counts, then the page's
   actions grouped at the right. No sentence explaining the page under the title. No banner.
3. **Tabs with counts**: `All 12 · Needs you 3 · Late 1 · Done 8`. The chosen tab is dark text with a thin
   underline (or a white pill on a grey track when it is a switch between views). A tab that narrows the list
   wears the filter colour. A tab with 0 is hidden unless it is the chosen one.
4. **Filter chips** on one line: `+ Status`, `+ Owner`, `+ Date`. An applied filter is shown in colour. A
   filter value with no rows behind it is never listed.
5. **ONE table** (or one quiet list). Columns, left to right: a small number or mark column · the name (ink,
   the one bold thing in the row) · one grey detail line (often the source's own words in quotes) · a soft
   status badge · right-aligned numbers. No buttons on the row. A long name takes two lines then "…".
6. **The side panel** (right): shows the CHOSEN row. A press on a row CHOOSES it (the panel fills); a second
   press OPENS it. Esc lets go.

The side panel always has the same five parts, top to bottom:

1. **Headline** — one sentence saying what this is and what it needs ("3 changes wait for your answer.").
2. **A small graphic or a few counts** — a ring, a short bar, a 3-step timeline. Never big money figures.
3. **Groups of rows** — each row is a door: its words, a badge, and one action link. No cards inside cards.
4. **ONE black button** — the single next step. One filled button per area, ever.
5. **Small print + the ask box** — at the very foot: a line of green text links (short words, one row,
   never wrapped; what does not fit is left out), then the assistant's ask box, always last.

A panel is NEVER EMPTY: when nothing is chosen it shows an overview of the page (what's next, read from the
data).

## 4. The visual rules

**Colour.** One look, no dark mode unless the product needs it.
- Ground (page background): `#F5F5F7`. Surfaces: white. Ink (text): `#1D1D1F`. Quiet text: `#4B4B50`.
  Detail grey: `#6A6A6F`. Dividers: `#E6E6EA`. Field edges: `#D1D1D6`.
- ONE accent for links and focus: a deep green (`#087363`). Links are underlined, green.
- Status colours are soft pairs (background + text), used only for badges and small marks:
  amber `#FBEEDB`/`#8A5A0A` (waiting, owed, outstanding) · green `#DFF2E7`/`#1F4D3B` (done, resolved) ·
  ruby `#FBE5E3`/`#8F2A22` (needs you now, removed) · steel blue `#E6ECF6`/`#48639A` (information, policy).
- A row pointed at or chosen is LIGHT GREEN, never grey.
- A little colour from the status set, never loud. Never a coloured page header.
- Every colour is a token in one `:root` block; no hand-typed colours anywhere else.

**Type.** Two fonts, two jobs.
- A plain sans for everything that is the app (labels, buttons, tables, panels): e.g. Geist, Inter.
- A book serif for anything that is THE DOCUMENT or a quote from it: e.g. Source Serif 4. Quotes in panels
  and rows are in the serif, so the reader sees at once "these are the source's own words".
- Weights: 400 body · 500 labels · 600 strong · a calm serif title. Sentence case everywhere (never ALL CAPS
  for labels except tiny section heads with letter-spacing).
- Numbers that line up use tabular figures.

**Shape and space.**
- Corners 10px on cards and inputs; pills fully round. Paper/document sheets are square.
- 16px inside every card, equal on all sides. 16px side gutters in panels.
- One hairline between sections, never a box around every section.
- Nothing boxed that does not need a box. Lists are lines, not cards.

**Buttons — three kinds only.**
1. ONE black filled button per area (the main act).
2. Grey pill buttons for secondary acts.
3. Green underlined text links for small moves.
Button words never wrap. Icons are simple line drawings. A button that cannot be used is grey AND says why
(on hover or under it) — never a dead button wearing a live one's clothes.

**Status = a soft badge** with a word (`Outstanding`, `Resolved`, `Late`), or a dot + word in dense rows.

**Entry fields are open, the Legora way**: label beside the words, no box, one divider line under the row.
A required empty field gets an amber hint. A choice of a few options is a row of grey pills, not a dropdown.

**Money is never a big part of a page**: no big figure tiles of money, no money in the side panel; a money
column disappears for people without the right to see it, leaving no gap.

## 5. Behaviour rules

- **Press chooses, second press opens.** Rows never navigate on the first press.
- **Land on it.** A link that takes you somewhere arrives on ONE target, scrolled into view, with its main
  button ready; it never presses anything for you.
- **A redraw keeps your place and your words.** Refreshing a list keeps scroll position, tab, filters and
  any half-typed text.
- **Press it again and it closes.** Every pop-over closes on a second press, Esc, or a press outside.
- **Pop-ups are one sheet**: a 480px sheet of lines (no boxes), one black button, Cancel last. Big work is a
  page, not a pop-up. No pop-up only to say "no". Undo is better than "Are you sure?".
- **Alerts (toasts)** sit bottom-centre, say ok / warning / error, and belong to the page that raised them.
- **When something loads, something moves** (a small spinner or dots) — never a frozen screen.
- **No new bands.** Never add a banner, strip, notice or tip on your own. If one seems needed, ask first and
  say what it would say that the screen cannot already say. The least attention that does the job wins:
  nothing → the control itself → a brief toast → a strip → a dialog.
- **Motion** is rare and quiet: fades and slides by transform/opacity only, never animating width or height;
  none at all when the person asked for less motion. A panel's arrival animates at most once a day.
- **Controls that must stay visible while content scrolls** (zoom, filters over a document) live together
  in ONE sticky holder on a solid background, never overlapping the content and never each pinned
  separately.

## 6. The assistant (if the app has one)

- One ask box, always at the foot of the side panel, on every page.
- The assistant PREPARES, a person DECIDES: it drafts, suggests and points; it never sends, signs or saves
  on its own.
- Its answers quote the source's own words with their reference, and end with a link to the place they
  talk about.
- It never shows a cost or price to normal users.
- When it cannot do something, it says so plainly and offers the proper next step.

## 7. Defects to never ship (check every page)

- **Nothing spills, squeezes or overlaps.** Every tag, chip, count, number and button stays on one line
  inside its card. A row made of a `<button>` must let its words wrap (buttons default to no-wrap).
- **No panel ever scrolls sideways.** Nothing stands past a panel's right edge.
- **Nothing is pushed behind the side panel.**
- **Every label says what is behind it** ("Open 3 changes", not "View").
- **Always know where you are and how to get back** (a back arrow, a highlighted tab).
- **The most important thing is the easiest to see.**
- **Related things are grouped.**
- **The first frame is the new look**: a page never flashes the old style before the new one appears.

## 8. How to do a facelift with this (the process)

1. **Photograph the real page as it is today** (never design from memory or an old picture). Bring the code
   up to date first.
2. **Draw ONE part of a page at a time, the four ways**, full size, on a copy of that photo, with real
   content. Put them in one page with a switcher, plus a short table (idea · when it wins · cost) and ONE
   recommendation.
3. **The owner picks by name.** Build only the pick.
4. **The picked drawing is the agreement.** Build EVERY visible part of it — the idea and the frame
   (panel, heads, buttons, columns, order). A part that cannot be built as drawn stops the round and is
   asked about before anything is merged.
5. **Before merging, show drawn vs built side by side**, every part ticked or named as different, photographed
   at the owner's real screen sizes (for example 1440×780, 1536×730, 1366×950, and an iPad 1180×820 with
   touch). Check fit at the smallest.
6. **One page a day** in a full clean-up: every tab of that page, the four ways each.
7. **Explain everything to the owner in plain, simple English**; keep summaries short.

## 9. A one-glance checklist for any new or changed screen

- [ ] One head row: title · tabs with counts · actions at the right. No sentence, no banner.
- [ ] One table or quiet list; row = mark · name · grey detail (source words in serif quotes) · soft badge.
- [ ] Row press chooses, second press opens; chosen row light green.
- [ ] Side panel: headline · small graphic · groups of door rows · ONE black button · links + ask box at foot.
- [ ] Two fonts, two jobs (sans for the app, serif for the document and its quotes).
- [ ] Colours only from the tokens; status only as soft badges; one accent.
- [ ] No money as a big figure; no dead buttons; no sideways scroll; nothing overlaps.
- [ ] Photographed at every target screen size, drawn vs built shown, before merging.

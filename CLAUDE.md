# CLAUDE.md

## Design rules — read before any visual change

Follow **[docs/LS-DESIGN.md](docs/LS-DESIGN.md)** (the Legora + Stripe way) for every change a person can see.
Where an existing page does not match it, the page is wrong, not the rule.

## Talking to the owner

The owner is not a developer. Explain everything in plain, simple English and keep summaries short.

## Where the new look lives

- `index.html` blocks marked `NEW LOOK (L+S) · Phase 0` and `Phase 1`: the switch, backup, top bar, and the one side panel (Overview / Assistant), Apply / Undo / History.
- `nl/core.js`: shared page framework. One file per page: `nl/today.js` (+ `nl/review.js`, the Full review), `nl/money.js`, `nl/plans.js`, `nl/future.js`, `nl/notebook.js`, `nl/setup.js` (Setup + Settings), `nl/phone.js`. `nl/lesson.js`: "walk me through" lessons in the assistant panel. `nl/directions.js` + `nl/handbook.js`: directions around the app (see below).
- The new look is the default; a device that chooses "Back to the old look" stores `horizon-finance-os-v1:look = old`. All new-look CSS is scoped to `html.nl`, so the old look must stay pixel-identical.

## SCREENS — every visual change is measured before it is called done

- The screens: 1366×768, 1536×864, 1920×1080, 2560×1440.
- Before saying a visual change is done: open the real page at ALL four sizes, take a photo of each, and show the owner the photos.
- At every size, measure and report:
  1. NO DEAD BAND: the page content and the side panel together fill the window. The gap between the content's right edge and the panel's left edge is at most 32px. Content grows to fill, or is centred — never stuck to the left with empty space beside it.
  2. NOTHING CUT, NOTHING OVERLAPPING: no text or chart is clipped, hidden behind the panel, or scrolls sideways.
  3. CHARTS GROW WITH THE PAGE: on a wide screen, cards and charts use the extra width (more columns or wider charts), not more empty space.
- A failed measurement is fixed before merging, never shipped quietly.
- Never say "looks fine" without the measurements.

## DIRECTIONS — the assistant takes people around the app

- Everything typed in the Ask box goes through ONE reader first (`nl/directions.js`): place words, things inside pages, everyday task words, "how do I" (Handbook). Only if nothing matches does the AI answer. Moving is never doing: a direction never presses, saves or deletes.
- A new page, tab or head button needs place words or a task, and a Handbook chapter (`nl/handbook.js`). Any change to a button's label updates its chapter in the same change.
- Word lists are in English and Swedish.
- Before merging, run `node tests/nav/run.js` (it also runs on every pull request): the navigation exam must stay at or above its floor, and every page, task and Handbook step must be reachable.

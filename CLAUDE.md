# CLAUDE.md

## Design rules — read before any visual change

Follow **[docs/LS-DESIGN.md](docs/LS-DESIGN.md)** (the Legora + Stripe way) for every change a person can see.
Where an existing page does not match it, the page is wrong, not the rule.

## Talking to the owner

The owner is not a developer. Explain everything in plain, simple English and keep summaries short.

## Where the new look lives

- `index.html` blocks marked `NEW LOOK (L+S) · Phase 0` and `Phase 1`: the switch, backup, top bar, and the one side panel (Overview / Assistant), Apply / Undo / History.
- `nl/core.js`: shared page framework. One file per page: `nl/today.js`, `nl/money.js`, `nl/plans.js`, `nl/future.js`, `nl/notebook.js`, `nl/setup.js` (Setup + Settings), `nl/phone.js`.
- The new look is the default; a device that chooses "Back to the old look" stores `horizon-finance-os-v1:look = old`. All new-look CSS is scoped to `html.nl`, so the old look must stay pixel-identical.

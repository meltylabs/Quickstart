# Biologix Control Tower — affiliate CRM

Internal operator tool. Tracks affiliates, their sales, onboarding, outbound and
payouts in one place. Open `index.html` directly or serve the parent directory
over HTTP. No backend, no build step.

## Six tabs

| Tab | What it does |
| --- | --- |
| Dashboard | Net sales, orders, AOV, refund rate, live and producing affiliates, activation rate, commission owed. Plus the 30-day sales trend, overdue next actions, defect records, stage counts and the gate bottleneck. |
| Affiliates | The main panel. Every affiliate with their orders, gross, refunded, net, rate, commission owed, gate progress, last sale and next action. Sortable on every column including the derived money ones. Search and filter by owner and stage. Click a row to open and edit the record. |
| Pipeline | The same affiliates as a stage board. Move a card forward or back and it saves. |
| Onboarding | The nine activation gates per affiliate. Click a gate to toggle it. Shows what each one is blocking and flags who is ready to launch. |
| Outbound | Target list with channel, sequence step, last touch, reply state and disposition. Log a touch in one click. Do-not-contact targets are hidden by default and cannot be touched. |
| Money | Commission per affiliate, the sales ledger and the payout ledger. |

## The nine activation gates

An affiliate is not live until all nine pass, in order. Each one blocks the next.

1. OVO Creator Passport
2. Adult eligibility
3. Agreement executed
4. Tax and payout set up
5. Claims and disclosure training
6. Affiliate account created
7. Tracking QA passed
8. First content approved
9. Launch authorised

## Rules the tool enforces

- **Commission with no rate set reads "no rate set", never $0.** No commission
  rate has been agreed with Biologix. Braden, on the 2026-07-23 call: "i don't
  know we'd have to like look at the margins and really find out." Rendering
  zero would read as "owed nothing" when the truth is "unknown".
- **Every record needs one owner and one next action.** Anything without both
  shows up in the Dashboard defect list, along with anything marked live that
  has incomplete gates or no code and link.
- **Overdue next actions surface themselves**, sorted by how late they are.
- **Multi-level commission is modelled.** An affiliate can have an upline
  ("Recruited by"). The upline earns an override on that affiliate's net sales.
  Both rates are unset until someone sets them.
- **Payouts only reduce what is owed once they are Sent or Cleared.** Queued and
  Failed payouts do not.

## Your data

Seed rows named "Example —" are illustrative. Braden and Connor are real records
with real context attached. Replace the examples:

- **Import CSV** loads real data into the active tab. It merges on `id` when
  present and appends otherwise, and it reports added, updated and skipped rows
  with reasons. It never fails silently.
- **Export CSV** downloads the active tab, including the derived money columns.
- **Reset demo data** restores the seed. **Clear all** empties everything.

## Storage, and the one thing to watch

Everything persists to `localStorage` under `biologix-control-tower-v1`. That
means it is single-user, single-browser, and unsynced. Two people cannot run the
book from it at once, and there is no audit trail of who changed what.

**Export CSV regularly.** Clearing your browser's site data destroys the book and
there is no other backup path.

When the deal closes and the ovo-academy CRM migrations deploy, this moves to
Postgres. The full data model, state machines and integration boundaries for
that move are in `.context/control-tower/spec-archive/`.

## Tests

```
node crm-data.test.mjs
```

Covers the money math, the multi-level override, payout status gating, gate
progress, defect and overdue detection, sorting on derived columns, CSV round
trip and cascade delete.

## Files

- `index.html` — the app shell and all six views
- `crm.css` — styles, extends `../board.css`
- `crm-data.js` — schema, storage, CSV, all derived money. No UI.
- `crm-app.js` — rendering, interaction, drawer, import and export
- `crm-data.test.mjs` — data layer tests

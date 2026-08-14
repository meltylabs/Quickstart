# Checks

Four harnesses that measure this storefront instead of judging it. Every one of them
caught a real defect that source-reading had missed.

| file | what it measures | what it caught |
|---|---|---|
| `design-probe.mjs` | spacing, type, colour, contrast, tap targets, per-component fingerprints across 30 page/width combos | 55 type pairs, 18 text colours, 143 contrast failures, h1 rendering 61px on one page and 72px on another |
| `layout-guard.mjs` | horizontal overflow and collapsed containers on 9 routes at 390 and 1440 | the mobile homepage rendering with a 0px-wide copy column and 126px of sideways scroll |
| `alignment.mjs` | distance from the shell edge to every block of copy | five different content insets (0, 17, 25, 32, 48) so nothing shared an axis |
| `functional.mjs` | add to cart, sell gate under DOM bypass, full 5-step checkout, card-data leakage, search | the sell gate is re-attacked by re-enabling a disabled button and clicking it |

## Run

    cd <a directory with playwright installed>
    node <path>/design-probe.mjs      # writes .context/defects.json
    node <path>/layout-guard.mjs      # prints CLEAN or the offending routes
    node <path>/alignment.mjs         # prints per-page axis report
    node <path>/functional.mjs        # prints all-green or the failures

The site must be served first:

    cd biologix-strategy-board/ovo-labs-warm && python3 -m http.server 8965 --bind 127.0.0.1

## Why these exist

Auditing by reading source kept missing what was obvious on screen. Analytical values
rendered white-on-white at 1.00:1 and the grep-based passes called it fixed. A drawer left
196px of dead space. The mobile homepage was structurally broken while every source check
reported clean.

Measure the rendered page. Do not trust a name, a flag, or a previous claim.

## Added after the QA pass

| file | what it does |
|---|---|
| `route-sweep.mjs` | loads all 26 routes, watching for JS exceptions, console errors, failed requests, broken images, unlabeled controls, placeholder hrefs, weak titles, and h1 count |
| `flows.mjs` | empty states, promo codes valid and invalid, quantity decrement to removal, draft persistence across reload, back button, drawer, testing lookup no-match, 404 |
| `drawer.mjs` | the cart drawer end to end: open, line render, shipping progress, cross-sell, checkout link, focus movement, Escape, quantity, cross-sell add |

### A lesson worth keeping

The drawer checks in this session were passing while clicking nothing. They used
`.cart-button`, which has never existed in this codebase; the real trigger is
`[data-cart-open]`. A missing element produced no error, so the check reported
success. Assert the element exists before acting on it, and fail loudly when a
selector disappears. A green check that tested nothing is worse than a red one.

# OVO Labs Porcelain — Release QA

**Release candidate:** `/ovo-labs-porcelain/`
**Date:** July 24, 2026
**Final result:** PASS
**Open critical/high/medium/low defects:** 0 / 0 / 0 / 0
**Fable 5 verdict:** SHIP

## Scope

The release pass covered the isolated Porcelain storefront, its production-worker route, and the unchanged warm OVO control.

Viewports:

- 1440×1100 desktop;
- 390×844 narrow;
- 320×800 narrow-edge check.

Surfaces:

- homepage;
- collection, filters, sorting, and zero results;
- all canonical product routes;
- curated sets;
- testing lookup and status table;
- notes and three note articles;
- company, FAQ, and policies;
- designed 404;
- mobile menu, filter sheet, cart drawer, and sticky product action.

## Visual authority

Claude Fable 5 reviewed the implemented home, collection, and product-detail evidence at 1440px and 390px.

Final verdict:

> FABLE VERDICT: SHIP

Fable found no release-blocking visual defect. It specifically confirmed that the Datum product-finding structure and the OVO material/type system read as one coherent storefront, not a palette reskin.

The review’s optional experiments—none release-gating—were:

1. test an alternate-image product-card hover;
2. test slightly stronger PDP price emphasis;
3. test an even clearer narrow category-row overflow cue.

## Functional results

| Area | Result | Evidence |
|---|---|---|
| Predictive search | Pass | Fuzzy misspelling `retatruitde` resolves Retatrutide; Arrow Down + Enter opens the canonical PDP |
| Search privacy | Pass | Analytics retain only an allowlisted class, length bucket, and result count; raw visitor strings are absent |
| Collection | Pass | Ten products, category filters, four sort states, search, reset, result count, and zero-result recovery |
| URL state | Pass | Category, sort, and collection query survive reload/back through query parameters |
| Mobile filter | Pass | Dialog semantics, inert background, initial focus, selection, close, and focus return |
| PDP | Pass | Gallery, selected-state semantics, quantity clamping 1–10, main Add, testing link, accordions, related entries |
| Mobile PDP | Pass | Sticky Add appears only after the primary action is passed and remains 59px tall |
| Cart | Pass | Add, repeated Add, increment, decrement, remove, clear, subtotal, persistence, focus retention, Escape |
| Storage isolation | Pass | Porcelain uses `ovo-porcelain-*` keys and does not read or overwrite the warm route’s active keys |
| Storage failure | Pass | Cart remains usable in memory; optional recently-viewed writes cannot break PDP initialization |
| Testing | Pass | Code/name lookup, unknown state, query-string prefill, and ten explicit “No result reported” entries |
| Newsletter | Pass | Native email validation, local-only preference, accurate success copy, and reload persistence |
| Menu | Pass | Dialog semantics, first-level research categories, focus trap, Escape, and focus return |
| Links/resources | Pass | 36 rendered internal links/resources checked with no broken loaded asset |
| HTML routes | Pass | All 25 Porcelain HTML shells return 200 in static preview |
| 404 | Pass | Direct nested preview and deep worker miss both render the branded recovery page |
| Console | Pass | No application console errors across the tested canonical flows |
| Overflow | Pass | No horizontal overflow at 1440px, 390px, or 320px |
| Reduced motion | Pass | Reveal and transform states collapse under `prefers-reduced-motion: reduce` |
| Warm control | Pass | `git diff -- biologix-strategy-board/ovo-labs` is empty |

## Production-worker results

The built Worker was exercised locally through Wrangler.

- `/ovo-labs-porcelain` returns a query-preserving 308 to the trailing-slash route.
- `/ovo-labs-porcelain/` returns 200.
- `.webp` and `.woff2` assets receive explicit MIME types.
- CSP, Permissions Policy, Referrer Policy, HSTS, and `nosniff` headers apply to both OVO routes.
- A deep missing document returns the branded page with HTTP 404.
- Worker-injected `<base>` resolves the Porcelain CSS, JavaScript, imagery, and fonts from a deep missing path.
- A missing asset remains an asset 404 instead of being replaced with branded HTML.
- Legacy Datum and Third Standard routes still redirect to the warm OVO route.

## Findings closed during QA

1. **Nested 404 bootstrap:** root-absolute assets made direct nested previews blank. The static shell now uses adjacent assets; the Worker injects the storefront base only for deep branded misses.
2. **Footer link separation:** an inline-flex override allowed links to visually concatenate. Links are now block-width flex targets with 28px height and 10px inter-row spacing.
3. **PDP gallery state:** thumbnails exposed `aria-current` but not toggle state. They now initialize and update both `aria-current` and `aria-pressed`.
4. **Category hit areas:** header category links were visually centered in a 42px row but only 10px tall themselves. Each link now owns the full 42px target.
5. **Optional local storage:** a second failing write in the recent-products fallback could interrupt PDP setup. Both failure paths are now safely contained.

## Build verification

```text
node --check biologix-strategy-board/ovo-labs-porcelain/site.js
node --check src/worker.js
npm run build
git diff --check
```

All passed.

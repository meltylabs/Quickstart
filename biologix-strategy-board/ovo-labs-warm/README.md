# Datum Peptides

Datum Peptides is a fictional, non-transactional ecommerce storefront concept. It demonstrates a complete peptide catalog experience without representing real inventory, testing, customers, fulfillment, payments, or medical use.

## Routes

| Surface | Route |
|---|---|
| Homepage | `index.html` |
| Full catalog | `catalog.html` |
| Catalog sets | `bundles.html` |
| Testing and COAs | `testing.html` |
| Learning center | `notes.html` |
| About | `company.html` |
| FAQ | `faq.html` |
| Policies | `policies.html` |
| Product pages | `peptides/*.html` |
| Guides | `notes/*.html` |

Compatibility redirects preserve the previous prototype paths:

- `../third-standard/` → `../datum-peptides/`
- `lot-record.html` → `testing.html`
- `access.html` → `catalog.html`
- `eligibility.html` remains an alias for `policies.html`

## Interaction model

- Predictive search by product name, category, strength, and code
- Category filtering, collection search, sorting, and empty-state recovery
- Ten canonical product pages with responsive media, quantity, testing state, specifications, FAQ, and related entries
- Three catalog sets
- Searchable testing-status page
- Browser-local add, update, remove, subtotal, and clear-cart states
- Local-only newsletter success state
- Keyboard-accessible menu, search, drawers, accordions, and product controls
- Non-PII QA instrumentation through `window.dataLayer` and `window.DatumAnalytics.events()`

The cart has no checkout or payment path. Nothing is transmitted.

## Visual system

The outward-facing visual direction is authored by Claude Fable 5:

- Inter and IBM Plex Mono
- cool white surfaces, near-black ink, cobalt actions
- compact retail density
- exposed header search and category navigation
- four-column desktop and two-column mobile product grids
- thin fiction banner
- product-first PDP hierarchy
- visible testing states instead of fabricated proof

## Local preview

From `biologix-strategy-board/`:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/datum-peptides/
```

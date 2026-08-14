# OVO Labs

OVO Labs is a fictional, non-transactional peptide ecommerce concept. It demonstrates a complete retail experience without representing real products, inventory, testing, customers, fulfillment, payments, or medical use.

## Routes

| Surface | Route |
|---|---|
| Homepage | `index.html` |
| Complete collection | `catalog.html` |
| Curated sets | `bundles.html` |
| Testing | `testing.html` |
| Journal | `notes.html` |
| About | `company.html` |
| FAQ | `faq.html` |
| Policies | `policies.html` |
| Product pages | `peptides/*.html` |
| Journal articles | `notes/*.html` |

Compatibility redirects preserve both former prototype families:

- `../third-standard/` → `../ovo-labs/`
- `../datum-peptides/` → `../ovo-labs/`
- `lot-record.html` → `testing.html`
- `access.html` → `catalog.html`
- `eligibility.html` → `policies.html`

## Interaction model

- Predictive keyboard search by product name, category, strength, and OVO code
- Category filtering, collection search, persistent URL sorting, and empty-state recovery
- Ten canonical product pages with responsive media, quantity, visible testing status, specifications, FAQ, related products, and a sticky mobile Add action
- Three curated sets
- Searchable testing-status page
- Browser-local add, update, remove, subtotal, and clear-cart states
- Local-only newsletter preference
- Keyboard-accessible menu, search, drawers, accordions, and product controls
- Non-PII QA instrumentation through `window.dataLayer` and `window.OVOAnalytics.events()`

The cart has no checkout or payment path. Nothing is transmitted.

## Fable 5 visual system

Claude Fable 5 is the binding outward-facing design authority. The final direction is **warm apothecary modernism**:

- Fraunces display type, Instrument Sans body/UI, and IBM Plex Mono product data
- cream, porcelain, parchment, espresso, muted-gold rules, and a restrained terracotta accent
- centered italic `ovolabs.` wordmark
- asymmetric product-led hero
- borderless fashion-collection product grid
- full espresso editorial testing band
- 7/5 product gallery and sticky buy box
- two-column mobile collection down to 320 px
- safe amber-vial stills with no use supplies, people, claims, or lab theater
- self-hosted, SIL Open Font License type assets with no third-party font request

## Local preview

From `biologix-strategy-board/`:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/ovo-labs/
```

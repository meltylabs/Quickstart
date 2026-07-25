# OVO Labs Porcelain

OVO Labs Porcelain is the white, product-first side-by-side variant of the fictional OVO Labs ecommerce concept. It adapts Datum’s strongest store architecture—visible search, direct categories, a compact hero, a factual strip, early products, and card-level Add—using OVO’s name, amber packaging world, typography, truth boundaries, and hardened interaction behavior.

It is non-transactional. It does not represent real products, inventory, testing, customers, orders, fulfillment, payment, or medical use.

## Comparison routes

| Variant | Route |
|---|---|
| Porcelain candidate | `/ovo-labs-porcelain/` |
| Warm OVO control | `/ovo-labs/` |

The warm route is intentionally preserved for visual and behavioral comparison. Porcelain has its own CSS, JavaScript, canonical URLs, analytics event name, and browser-storage namespace.

## Routes

| Surface | Route |
|---|---|
| Homepage | `index.html` |
| Complete collection | `catalog.html` |
| Curated sets | `bundles.html` |
| Testing | `testing.html` |
| Notes | `notes.html` |
| About | `company.html` |
| FAQ | `faq.html` |
| Policies | `policies.html` |
| Product pages | `peptides/*.html` |
| Notes articles | `notes/*.html` |

Compatibility files inside this variant preserve its former route names:

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
- Non-PII QA instrumentation through `window.dataLayer`, `window.OVOPorcelainAnalytics.events()`, and the compatibility alias `window.OVOAnalytics.events()`

The cart has no checkout or payment path. Nothing is transmitted.

## Isolated browser state

Porcelain does not read or overwrite the warm OVO route’s active storage keys.

```text
ovo-porcelain-demo-cart-v2
ovo-porcelain-recent-products-v1
ovo-porcelain-newsletter-preference-v1
```

The custom analytics event is:

```text
ovo-porcelain:analytics
```

## Fable 5 visual system

Claude Fable 5 is the binding outward-facing design authority. The approved direction is **Datum structure × OVO identity on porcelain white**:

- Fraunces display type, Instrument Sans body/UI, and IBM Plex Mono product data
- pure-white canvas, near-white warm surfaces, espresso controls, and restrained terracotta accents
- left-aligned italic `ovolabs.` wordmark
- always-visible search and direct category navigation
- 55/45 product-led hero with safe amber imagery and factual overlays
- early four-up desktop and two-up narrow product grid
- full espresso editorial testing band
- 7/5 product detail gallery and sticky buy box
- safe amber-vial stills with no use supplies, people, claims, or lab theater
- self-hosted, SIL Open Font License type assets with no third-party font request

Gold appears only in packaging imagery and the wordmark period. There is no cobalt and no beige page wash.

## Truth boundary

- The top banner states: `FICTIONAL CONCEPT STOREFRONT. NOTHING HERE IS REAL, STOCKED, OR FOR SALE.`
- Every analytical state remains `No result reported` or `Not represented`.
- There is no fictional per-lot result dataset, certificate, laboratory, purity figure, testing claim, or release decision.
- There is no access or eligibility gate.
- There is no checkout, payment, inventory, stock, shipping, fulfillment, or customer account.
- Product and cart prices are interface concepts only.
- The newsletter demo saves a preference locally and sends nothing.
- No reviews, ratings, popularity, urgency, outcome, dosing, preparation, or human-use claim is allowed.

## Local preview

From `biologix-strategy-board/`:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/ovo-labs-porcelain/
```

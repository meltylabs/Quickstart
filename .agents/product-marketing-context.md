# Product Marketing Context

*Last updated: July 24, 2026*

## Product overview

**Working name:** OVO Labs

**Wordmark:** `ovolabs.`

**Descriptor:** Peptide science, refined.

**One-liner:** A fictional peptide retail-house concept that combines warm editorial product presentation with fast finding and explicit evidence boundaries.

**Current reality:** OVO Labs is a concept website. It has no company operations, inventory, material, customers, testing, laboratory relationship, fulfillment, payment, checkout, or commerce. A thin notice at the top of every page states that nothing shown is real, stocked, or for sale.

**What the website demonstrates:** Two design presentations of the same complete ecommerce information architecture: persistent predictive search, four catalog categories, ten product pages, three catalog sets, testing-status lookup, product comparison fields, educational guides, responsive navigation, a browser-local cart, explicit empty/error/success states, and event instrumentation.

**Concept category:** Peptide research-product ecommerce

**Product type:** Fictional brand, ecommerce prototype, and strategic company package

## Current catalog

| Code | Product | Category | Strength | Concept price |
|---|---|---|---:|---:|
| OVO-001 | Retatrutide | GLP-1 & Metabolic | 10 mg | $105 |
| OVO-002 | Tirzepatide | GLP-1 & Metabolic | 10 mg | $100 |
| OVO-003 | Semaglutide | GLP-1 & Metabolic | 10 mg | $90 |
| OVO-004 | Cagrilintide | GLP-1 & Metabolic | 10 mg | $89 |
| OVO-005 | BPC-157 | Research Peptides | 10 mg | $60 |
| OVO-006 | TB-500 | Research Peptides | 10 mg | $68 |
| OVO-007 | CJC-1295 | Growth Hormone Research | 5 mg | $52 |
| OVO-008 | Ipamorelin | Growth Hormone Research | 5 mg | $45 |
| OVO-009 | CJC-1295 + Ipamorelin | Peptide Blends | 10 mg | $92 |
| OVO-010 | BPC-157 + TB-500 | Peptide Blends | 20 mg | $118 |

The three concept sets are:

- OVO-S01 — Metabolic Reference Set
- OVO-S02 — Peptide Pair Set
- OVO-S03 — Secretagogue Reference Set

Every product and set must preserve the same evidence boundary:

- no material, inventory, or availability exists;
- no laboratory, testing method, result, certificate, or purity figure is represented;
- nothing can be checked out, paid for, ordered, shipped, or reserved;
- no ratings, reviews, popularity, scarcity, or urgency claims are fabricated;
- no dosing, preparation, administration, safety, efficacy, outcome, or human-use information appears.

## Primary user journeys

1. **Search directly:** Use the persistent search field to find a molecule or catalog code and open the canonical product page.
2. **Browse by category:** Choose one of four research areas, filter the collection, sort by name or concept price, and compare complete cards in place.
3. **Evaluate a product:** See the product identity, strength, format, price, testing state, quantity, and add-to-cart action in one decision block.
4. **Inspect testing status:** Search by product name or code and see what each analytical field would mean, including an explicit “No result reported” state.
5. **Build a local cart:** Add, update, remove, clear, and inspect a subtotal. The interaction ends before checkout and remains in browser storage.
6. **Learn:** Read short guides about product comparison and the scope and limits of testing documents.

## Audience and job to be done

**Prototype audience:** Ecommerce operators, brand builders, designers, and category researchers evaluating how a serious peptide storefront could merchandise a focused catalog.

**Potential future audience, only after independent legal and operating clearance:** Qualified organizations seeking research catalog products.

**Core job:** “Help me find the exact catalog entry, compare the facts that matter, and understand what evidence is actually reported.”

## Positioning

**Positioning statement:** Peptides, without the mystery.

**Value proposition:** A focused catalog with clear formats, testing status beside every product, and a fast path from search to cart.

**Differentiation:**

- search and categories are visible before brand theater;
- product cards expose complete decision fields;
- each molecule has its own canonical product page;
- testing status sits beside the decision rather than in a detached document library;
- empty evidence remains visibly empty;
- the cart gives precise feedback and stops honestly before checkout.

## Research-backed design principles

The 2025–2026 research package supports these implementation choices:

- Exposed predictive search and rich results for known-item discovery.
- Visual category shortcuts for exploratory discovery.
- Two-column mobile product grids with complete cards.
- Applied category state, result counts, clear search recovery, and predictable sorting.
- Product-first PDPs with image, identity, strength, format, price, testing status, quantity, and one CTA.
- Vertical detail sections and accordions rather than horizontal tabs.
- Exact add-to-cart feedback, editable quantity, remove, subtotal, and a clear terminal state.
- Eager loading and explicit dimensions for above-the-fold media.
- No ratings when review evidence does not exist.
- No autoplay, 3D, decorative scientific motion, fake urgency, or proof-badge clutter.

## Site architecture

```text
/ovo-labs/
├── catalog.html
├── bundles.html
├── testing.html
├── notes.html
│   ├── notes/reading-testing-status.html
│   ├── notes/choosing-by-molecule.html
│   └── notes/coa-boundaries.html
├── company.html
├── faq.html
├── policies.html
├── peptides/
│   ├── [10 canonical product pages]
└── 404.html

/ovo-labs-porcelain/
└── [the same route and content model in an isolated side-by-side variant]
```

Legacy routes redirect:

- `/third-standard/` → `/ovo-labs/`
- `/datum-peptides/` and every former deep route → the matching `/ovo-labs/` route
- `lot-record.html` → `testing.html`
- `access.html` → `catalog.html`
- `eligibility.html` remains a compatibility alias for the policy page.

## Brand voice

**Tone:** Warm, editorial, clear, direct, and technically literate.

**Personality:** Considered, tactile, confident, useful, and honest.

**Use:** product, category, code, strength, format, testing status, result, method, scope, sample, cart.

**Avoid:** dossier, archive, institutional access, eligibility gate, release, protocol, dose, transformation, medical-grade, pharmacy-grade, guaranteed, best seller.

## Visual system

The warm-apothecary-modernism route at `/ovo-labs/` is the brand-led comparison control. Its binding system uses:

- `ovolabs.` as the lowercase typographic wordmark and “Peptide science, refined” as the descriptor;
- warm cream `#F3EADA`, porcelain `#FAF6EE`, parchment `#EDE2CD`, espresso `#3A2A1F`, espresso-deep `#2A1D14`, ink `#5C4A3B`, terracotta `#B9553E`, terracotta-deep `#8F3B2A`, ornament-only gold `#B08A52`, and gold-bright `#C69B63` on espresso;
- Fraunces for editorial display and the italic wordmark, Instrument Sans for body/UI, and IBM Plex Mono only for codes, concept prices, and status;
- Aesop-like editorial density, The Row restraint, and Byredo typographic discipline translated into product-led ecommerce;
- an espresso fiction banner and warm-paper sticky header with exposed search and category navigation;
- a 12-column 1280px shell, 5/7 desktop hero, product-first fashion grid, and full-width espresso ruled testing band;
- zero-radius sections/cards, at most 2px on inputs/buttons, and no card shadows or borders;
- only `ovo-hero-still.webp`, `ovo-vial-front.webp`, and `ovo-set-pair.webp` as production imagery;
- safe amber research-vial still lifes on cream, stone, linen, plaster, or dark timber;
- no syringes, preparation tools, body context, fake labels, reports, laboratory props, or invented proof;
- an opening hero that establishes the house while keeping Shop and Testing actions immediately available;
- four-up desktop and two-up narrow-width product grids;
- a cart drawer and mobile sticky product action.

The superseded cool-white/cobalt “Bench Light” direction remains prohibited.

The Porcelain candidate at `/ovo-labs-porcelain/` is a separate product-first system, not a return to Bench Light. It uses:

- a pure-white `#FFFFFF` canvas with warm near-white `#FBF9F6` cards and `#F3EEE6` image wells;
- the same amber imagery, espresso controls, terracotta emphasis, and three self-hosted type families;
- a left-aligned wordmark, direct desktop navigation, persistent boxed search, and a dedicated category row;
- a compact 55/45 hero, factual four-cell strip, and an early four-up desktop/two-up narrow catalog;
- 4px controls, 10px cards, and a 16px hero field, with borders doing most of the separation;
- gold only in packaging photography and the wordmark period;
- no cobalt, cool-gray clinical template styling, generic laboratory theater, or unsupported proof.

The two routes deliberately share data and truth rules while keeping their CSS, JavaScript, canonical URLs, browser storage, and analytics event namespaces isolated. Porcelain is the primary direct-response hypothesis; the warm route is the premium brand control. Neither is a proven conversion winner without controlled comparative evidence.

## Proof rules

No claim is published without direct support.

| Claim type | Current state |
|---|---|
| Customers or testimonials | None |
| Ratings or popularity | None |
| Laboratory relationship | None |
| Identity, purity, content, sterility, or endotoxin result | No result reported |
| Inventory or availability | None |
| Fulfillment or delivery | None |
| Checkout or payment | None |
| Medical, clinical, or human-use guidance | Excluded |

## Measurement

Each prototype writes non-PII events to `window.dataLayer` and exposes them through `window.OVOAnalytics.events()` for QA. Porcelain additionally exposes `window.OVOPorcelainAnalytics.events()` and dispatches `ovo-porcelain:analytics`.

Search and testing events never contain the visitor’s raw string; they retain only an allowlisted catalog classification, a coarse length bucket, and a result count.

Core events:

- `page_view`
- `view_item_list`
- `search`
- `filter_apply`
- `sort_changed`
- `select_item`
- `select_category`
- `select_article`
- `view_item`
- `view_article`
- `view_testing`
- `product_media_selected`
- `quality_lookup`
- `add_to_cart`
- `view_cart`
- `cart_quantity_changed`
- `remove_from_cart`
- `cart_cleared`
- `newsletter_demo_completed`

These events measure usability only. No prototype event is a purchase or commercial conversion.

## Goals

**Current goal:** Demonstrate a high-converting peptide ecommerce experience while remaining unmistakably fictional and non-transactional.

**Primary quality gates:**

- every reachable route loads without console errors;
- every visible control works;
- no broken internal links or orphan pages;
- keyboard completion for search, navigation, accordions, product quantity, and cart;
- rendered desktop and narrow-width design QA;
- no fabricated product, quality, customer, shipping, or operational claim;
- exact pushed commit saved through the connected Sites project, with public deployment only when explicitly authorized.

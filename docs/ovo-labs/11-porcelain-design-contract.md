# OVO Labs Porcelain — Fable 5 Design Contract

**Binding implementation contract · July 24, 2026**

**Fable verdict:** BUILD

**Release status:** approved for shipment after rendered desktop and narrow-width review.

**Final Fable verdict, July 24, 2026:** SHIP. No release-blocking visual defects were found across the implemented home, collection, and product-detail renders at 1440px and 390px.

## Authority and scope

Claude Fable 5 (`claude-fable-5`) authored this outward-facing direction and remains the sole visual authority for layout, hierarchy, navigation, components, typography, color, spacing, responsive behavior, interactions, and UI states.

The variant lives at:

```text
biologix-strategy-board/ovo-labs-porcelain/
```

Its intended route is:

```text
/ovo-labs-porcelain/
```

The existing warm route at `/ovo-labs/` is the comparison control and must remain unchanged.

## Thesis

**Datum’s engineered, product-first storefront rebuilt in OVO’s old-money materials on a pure white ground—clean like a pharmacy counter, warm like amber glass.**

Porcelain adopts Datum’s commerce structure:

- directly visible search;
- direct primary navigation;
- a dedicated category row;
- compact split hero;
- product and testing overlays;
- a factual trust strip;
- an early, dense product grid;
- card-level Add actions.

It retains OVO’s identity and mature behavior:

- `ovolabs.` wordmark;
- amber packaging imagery;
- Fraunces editorial display type;
- Instrument Sans commerce type;
- IBM Plex Mono factual labels;
- espresso and terracotta brand color;
- fuzzy search and keyboard behavior;
- browser-local demo cart;
- explicit truth boundaries;
- visible focus and reduced-motion support.

## Exact color system

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#FFFFFF` | Pure-white page ground |
| `--surface` | `#FBF9F6` | Cards, panels, drawer, overlay cards |
| `--soft` | `#F3EEE6` | Inputs, image wells, factual strip, quiet section fields |
| `--ink` | `#2A1D14` | Primary text, fiction banner, footer |
| `--muted` | `#6B5D51` | Secondary text |
| `--line` | `#E8E1D6` | Dividers and borders |
| `--primary` | `#3A2A1F` | Primary buttons and Add controls |
| `--hover` | `#241810` | Primary hover and pressed state |
| `--accent` | `#8F3B2A` | Links, emphasis, eyebrows, focus, cart badge |
| `--accent-soft` | `#F6E7D6` | Testing chips and warm highlight fields |
| `--success` | `#4A6741` | Confirmed in-demo states such as “Added” |
| `--danger` | `#B3261E` | Errors and remove actions |

Rules:

- The page canvas is pure white. No beige page wash.
- Warm ivory belongs inside cards, image wells, inputs, and selected section fields.
- No cobalt, clinical blue, neon, glassmorphism, or gradient wash.
- Gold `#B08A52` / `#C69B63` appears only in packaging photography and the wordmark period.
- Gold is never UI body text, a status color, or a fill.
- Every foreground/background pair must pass WCAG 2.2 AA.

## Typography

### Instrument Sans

Use for every transactional or navigational surface:

- primary navigation;
- body copy;
- buttons;
- product-card names;
- prices;
- forms;
- cart;
- factual-strip captions.

Product names use approximately 16px/600. Prices use tabular numerals.

### Fraunces

Use only for:

- the lowercase `ovolabs.` wordmark;
- hero `h1`;
- section `h2` headings;
- one italic accent phrase per major headline.

The italic accent phrase uses terracotta, not gold. Fraunces does not appear in body copy, product-card facts, or controls.

### IBM Plex Mono

Use for exact labels and instrument-like facts:

- fiction banner;
- eyebrows;
- category-row links;
- OVO codes and formats;
- testing labels;
- trust-strip figures;
- keyboard shortcut hints.

Mono labels are generally 11–12px, uppercase, with approximately `0.14em` tracking.

All fonts remain self-hosted with their SIL Open Font License files. No third-party font request is allowed.

## Geometry and depth

- Shell: `min(1280px, calc(100vw - 96px))`.
- Standard grid gap: 24px.
- Controls: 4px radius.
- Cards: 10px radius.
- Hero image field: 16px radius.
- Product image wells: 1:1, `object-fit: contain`, warm ivory ground.
- Page structure remains near-flat; borders do most of the separation.
- Overlay cards may use `0 14px 42px rgba(42,29,20,0.18)`.
- Cart drawer may use `0 24px 64px rgba(58,42,31,0.18)`.
- Product-card hover may use `0 6px 20px rgba(42,29,20,0.08)`.
- Sticky header may use a hairline plus `0 8px 24px rgba(42,29,20,0.06)`.

Avoid pill-shaped SaaS controls, glossy laboratory surfaces, fake certificates, and decorative shadows that reduce the page’s apparent speed.

## Desktop composition

### 1. Fiction banner

- Approximately 32px tall.
- Espresso/ink ground.
- Cream mono text.
- Exact copy:

> FICTIONAL CONCEPT STOREFRONT. NOTHING HERE IS REAL, STOCKED, OR FOR SALE.

This is the only **global** disclaimer. Contextual testing, cart, policy, and product copy may still explain the exact state where that explanation is needed.

### 2. Header

- White sticky field with a hairline bottom border.
- Left-aligned `ovolabs.` wordmark at approximately 22px.
- Direct links: Shop, Bundles, Testing, Notes.
- Always-visible 320px search field with a warm-soft fill.
- Search placeholder: “Search by molecule or code.”
- Visible keyboard hint where supported.
- Cart control includes a live count.
- No centered wordmark and no desktop hamburger.

### 3. Category row

- Separate full-width sub-header.
- Mono uppercase category labels.
- Hairline top and bottom.
- Hover/current state uses terracotta text plus a 2px animated underline.
- Labels reflect the real catalog groupings.

### 4. Hero

- 55/45 text-to-image composition.
- Mono terracotta eyebrow.
- Fraunces headline at approximately 64px/1.05.
- One terracotta italic phrase.
- Instrument Sans supporting line at approximately 18px/1.6.
- Primary Shop CTA and outlined Testing CTA.
- Warm-soft 4:3-ish image well using the existing safe amber still.
- Featured-product overlay plus a small testing-state overlay.

The hero may state only demonstrable interface facts: ten catalog entries, clear formats, visible testing state, and a fast path to the browser-local cart.

### 5. Factual strip

Use four hairline-divided cells on a warm-soft band:

- 10 distinct compounds and blends;
- 4 clear categories;
- search by molecule or code;
- testing status on every item.

No reviews, stars, customer totals, laboratory language, purity claims, regulatory shorthand, stock, shipping promises, or fulfillment claims.

### 6. Catalog

- Product section begins early.
- Four cards per row at 1440px.
- Warm near-white card with a 10px radius and 1px hairline.
- 1:1 warm-soft image well.
- Mono code/format line.
- Instrument Sans product name.
- Concept price with tabular numerals.
- Visible testing chip.
- Espresso Add action.

On pointer devices, Add may reveal on hover and `:focus-within`. On touch devices, Add remains visible. A successful local action changes the control to `Added ✓` for approximately 1.2 seconds and updates the live cart count.

### 7. Testing feature

- Full-width espresso band with fine structural rules.
- The dominant status is literal: **NO RESULT REPORTED**.
- Missing or unrepresented fields stay visible.
- No certificate layout, seal, approval mark, laboratory imagery, chromatogram, or report facsimile.

### 8. Cart

- Retain the current browser-local drawer behavior.
- Near-white drawer surface.
- Espresso primary actions.
- Red remove actions.
- Mono product codes.
- Add, update, remove, subtotal, clear, close, focus containment, Escape, and focus return must all work.
- The flow ends before checkout or payment.

### 9. Footer

- Ink ground.
- Cream text and links.
- Fraunces wordmark echo.
- Compact links to Shop, Testing, Notes, Policies, FAQ, and Company.
- No trust-badge wallpaper.

## Narrow composition at 390px

The required stack is:

1. fiction banner;
2. header with wordmark, menu, and cart;
3. full-width search on its own row;
4. horizontally scrolling category row with an edge fade and no visible scrollbar;
5. stacked hero text, then image;
6. bottom-anchored hero overlay;
7. 2×2 factual strip;
8. two-up product grid;
9. testing feature;
10. footer.

Additional rules:

- Hero headline is approximately 40px.
- Hero CTAs are full width.
- Add is always visible.
- Touch targets are at least 44×44px.
- The cart becomes a full-height sheet.
- The product grid remains two-up down to 320px only while names, prices, status, and Add remain complete and readable.
- No horizontal page overflow at 320px or 390px.

## Interaction and state contract

- Every interactive element has a 2px terracotta focus outline with 2px offset.
- Inputs move from a warm-soft fill to white plus a terracotta focus border.
- Errors use a red border and explicit helper text.
- Search retains the current edit-distance/fuzzy-match logic.
- Search has keyboard result navigation, Escape behavior, and focus return.
- Search empty copy names the failed query and offers Shop all.
- Buttons lift at most 1px on hover and return on active.
- Disabled styling appears only for a genuinely unavailable action.
- Card hover and category underline complete in approximately 200ms.
- Drawer motion completes in approximately 320ms.
- Hero imagery may use one 600ms load reveal.
- `prefers-reduced-motion: reduce` collapses transforms and staggered motion to an immediate state.

No control may look functional while doing nothing.

## Binding truth and legal invariants

These rules override any visual suggestion or inherited copy that conflicts with them.

### No results

- Every catalog item’s analytical state remains **No result reported**.
- Sterility/endotoxin or other absent fields may be **Not represented**.
- There is no fictional per-lot dataset.
- There are no tested, verified, passed, current, pending-release, or laboratory-backed products.
- No hero chip, product badge, table, icon, color, or tooltip may imply otherwise.
- There are no certificates, COAs, reports, laboratories, methods, lot numbers, purity percentages, or release decisions.

### No access or eligibility gate

- There is no eligibility screening, access approval, qualification gate, account gate, or transaction gate.
- Compatibility pages may redirect to factual catalog or policy content; they must not imply an operating approval process.

### No commerce

- The store is fictional and non-transactional.
- There is no inventory, availability, customer, order, checkout, payment, fulfillment, shipping, support promise, or offer to sell.
- Prices are concept prices used to exercise ecommerce information hierarchy.
- The cart is a browser-local demo that stops before checkout.
- Newsletter state remains local; no address is transmitted and no email is sent.

### No intended-use or outcome implication

- No dosing, preparation, administration, safety, efficacy, body outcome, treatment, or human-use content.
- No syringes, needles, swabs, preparation supplies, people, clinicians, treatment rooms, or body context.
- Product photography is concept art, not proof of stock or production packaging.

### No fabricated social proof

- No reviews, ratings, customer counts, bestsellers, popularity, scarcity, countdowns, urgency, or shipping promises.
- No GMP, FDA, domestic-manufacturing, quality-system, or regulatory-compliance claim.

The thin top banner is necessary but not sufficient. The net impression of the entire page must remain fictional and non-operational.

## Route and storage isolation

Porcelain must not contaminate the warm comparison route.

Its current browser-storage namespace is:

```text
ovo-porcelain-demo-cart-v2
ovo-porcelain-recent-products-v1
ovo-porcelain-newsletter-preference-v1
```

Its analytics event namespace is:

```text
ovo-porcelain:analytics
```

Porcelain canonical paths use `/ovo-labs-porcelain/`. Missing asset requests must not receive a branded HTML 404 in place of the expected asset MIME type.

## Keep and remove

### Keep from Datum

- product-first section order;
- left brand and direct nav;
- always-visible search;
- category row;
- split hero and overlays;
- factual strip;
- early dense catalog;
- card-level Add.

### Remove from Datum

- cobalt;
- cool-gray identity;
- Datum name and copy;
- generic sans-only personality;
- pill controls;
- unsupported trust language.

### Keep from OVO

- name and wordmark;
- restrained Fraunces display voice;
- mono factual voice;
- amber photography;
- espresso action color;
- terracotta emphasis;
- fuzzy search;
- browser-local cart;
- explicit no-result presentation;
- product, testing, policy, FAQ, and editorial routes;
- accessible focus, dialogs, and reduced motion.

### Remove from this variant

- cream page canvas;
- parchment section wash;
- centered desktop wordmark;
- desktop hamburger;
- understated underline-only search;
- low product density;
- excess whitespace before the first product grid.

## Required release evidence

Before this variant is outward-facing, verify:

- rendered homepage at 1440px and 390px;
- collection at desktop and narrow widths;
- product page at desktop and narrow widths;
- mobile menu open;
- search success, typo recovery, keyboard navigation, and zero-result recovery;
- filter drawer and zero-filter result recovery;
- Add → cart count → drawer → quantity → remove → clear;
- testing route with only no-result/unrepresented states;
- local newsletter saved and storage-failure state;
- visible focus and keyboard-only completion;
- reduced-motion rendering;
- contrast for muted text, accent text, chips, dark band, banner, and footer;
- no horizontal overflow at 320px and 390px;
- no console errors;
- no third-party font request;
- no source diff in the warm `/ovo-labs/` route;
- Fable review of the final desktop and narrow screenshots.

Fable must issue an explicit SHIP verdict on rendered evidence, or every HOLD issue must be corrected and re-reviewed before release.

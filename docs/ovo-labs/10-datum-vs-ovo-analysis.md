# Datum Peptides vs. OVO Labs

**Decision memo · July 24, 2026**

## Recommendation

Build the white **OVO Labs Porcelain** variant as the primary direct-response candidate, while preserving the original warm OVO Labs route as the brand-led control.

Datum’s strongest advantage is not “white converts.” Its advantage is that the interface gets a visitor from arrival to a comparable product grid much faster: search is exposed, categories are visible, the hero is compact and concrete, the trust strip contains scannable facts, and products arrive early. The original OVO Labs route is more distinctive, editorial, and premium, but it delays the first commerce decision too long.

Porcelain should combine:

- Datum’s product-finding architecture and visual speed;
- OVO’s name, typography, amber packaging world, and old-money restraint;
- a pure-white page canvas with warm off-white product wells;
- OVO’s explicit testing, commerce, and legal truth boundaries;
- the hardened search, cart, dialog, focus, URL-state, and local-storage behavior from the current OVO Labs code.

The expected outcome is a storefront that reads as cleaner and more operational than the tan version without collapsing into a generic clinical-blue supplement site. This is the stronger hypothesis, not a proven conversion winner. A controlled comparison is still required before making a conversion claim.

## What was compared

| Reference | Role in the decision |
|---|---|
| Datum Peptides at commit `0bc46478` | Original white, product-first storefront reference |
| OVO Labs at `/ovo-labs/` | Current warm apothecary implementation and brand-led control |
| OVO Labs Porcelain at `/ovo-labs-porcelain/` | New hybrid candidate |

The implementation lineage matters. Datum’s original structure received six later QA corrections before becoming OVO Labs, including Escape and search-focus behavior, cart focus handling, contrast, modal/inert behavior, newsletter persistence, and sort URL state. Porcelain therefore adapts the current hardened OVO implementation rather than copying the old Datum commit literally.

## Method and limitations

The audit used rendered desktop and narrow-width evidence, source inspection, measured vertical positions, interaction review, and current ecommerce usability research. The core comparison viewports were:

- desktop: 1440px wide;
- narrow: 390px wide.

Measured from the top of each captured page:

| Milestone | Datum | Warm OVO | Datum advantage |
|---|---:|---:|---:|
| First product grid, desktop | 893px | 1,764px | 871px earlier |
| First product grid, narrow | 1,081px | 2,076px | 995px earlier |
| First visible Add opportunity | — | — | approximately 950–1,014px earlier in Datum, depending on viewport |

These measurements explain a meaningful part of the user’s reaction: Datum feels faster because the visitor sees merchandise and a next action roughly one viewport earlier.

The visual audit’s overall heuristic scores were 7.9/10 for Datum and 8.8/10 for warm OVO. Those totals do **not** mean warm OVO is the better ecommerce page. OVO earned its lead through premium brand character, truth/integrity, typography, accessibility, merchandising detail, and distinctiveness. Datum won the dimensions closest to immediate shopping behavior: clean presentation, commerce hierarchy, product findability, and perceived speed.

No reviewed site exposes normalized conversion data. Neither the score nor the design research establishes an actual conversion rate.

## Head-to-head analysis

### 1. First impression

**Datum**

- Pure white communicates cleanliness, order, and low visual friction.
- Cool-neutral surfaces make products feel immediately comparable.
- The left-aligned brand, horizontal navigation, visible search, and cart resemble a mature ecommerce shell.
- The page feels fast before a timing measurement is taken because the hierarchy is familiar and compact.

**Warm OVO**

- Cream, espresso, Fraunces, and amber glass create a far more ownable identity.
- The materials imply a considered retail house instead of a generic research catalog.
- The opening composition has more emotional depth and packaging appeal.
- The tan field can also read as editorial distance: beautiful, but less immediately shoppable.

**Decision**

Keep white as the Porcelain canvas, but do not copy Datum’s cobalt or cool-gray personality. Amber photography, espresso controls, terracotta accents, and selective Fraunces display type retain OVO’s warmth and premium memory structure.

### 2. Navigation and search

**Datum wins.**

Datum makes high-intent behavior obvious:

- search is always visible;
- category links occupy their own row;
- primary shopping destinations are exposed;
- cart state is visible without opening a menu.

The warm OVO shell is quieter and more fashion-like, but the centered wordmark, desktop menu abstraction, and understated search treatment add avoidable discovery cost.

This supports the Porcelain contract: left wordmark, direct primary navigation, a persistent search field, cart count, and a horizontally scrollable category row on narrow screens.

### 3. Hero effectiveness

**Datum wins directness; OVO wins desire.**

Datum’s hero does four jobs in one composition:

1. states the offer;
2. gives the primary and secondary action;
3. previews a product;
4. previews testing status.

Warm OVO’s hero is more cinematic and distinctive, but it spends more vertical space establishing mood. The right synthesis is a 55/45 split hero: OVO’s amber still life and editorial headline, plus Datum-style product and testing overlays.

The copy must remain literal. It can state the catalog size, visible formats, testing-state visibility, and browser-local cart. It cannot imply stock, laboratory validation, customers, or fulfillment.

### 4. Product discovery and card anatomy

**Datum wins the first path; current OVO wins the complete system.**

Datum places the product grid early and gives each card a quick Add action. This reduces the number of page decisions before a visitor can compare products.

The current OVO implementation contributes the stronger underlying behavior:

- fuzzy product and code search;
- complete product pages;
- coherent product codes and formats;
- visible testing state beside the decision;
- keyboard and focus behavior;
- responsive cart drawer;
- zero-result recovery;
- browser-local persistence with no checkout.

Porcelain keeps that behavior and changes the presentation:

- four complete cards per desktop row;
- two complete cards per narrow row;
- warm ivory image wells on white;
- compact mono facts;
- immediate concept price and testing state;
- Add revealed on desktop hover/focus and always visible for touch.

[Baymard’s product-list research](https://baymard.com/blog/product-listing-information) supports showing the information users need to compare products directly in the list. Its broader [product-list and filtering benchmark](https://baymard.com/blog/current-state-product-list-and-filtering) reinforces the importance of useful filtering, consistent card information, and understandable result states. Neither source says a white background inherently converts better.

### 5. Category architecture

**Datum wins.**

The separate category row creates an immediate map of the store. It also lowers the cost of browsing when a visitor does not know a specific molecule name.

This is consistent with Baymard’s findings on [main ecommerce navigation](https://baymard.com/blog/ecommerce-navigation-best-practice) and [mobile product-category access](https://baymard.com/blog/main-navigation-product-categories): product categories should remain visible and understandable, particularly on narrow screens.

Porcelain adopts the category row but avoids scientific jargon that requires decoding. Labels stay aligned with the actual four catalog groupings.

### 6. Search behavior

**Current OVO wins technically; Datum wins placement.**

Porcelain uses OVO’s existing fuzzy-match logic and keyboard behavior inside Datum’s exposed-search layout. This matters because peptide names are long and easy to misspell. Search should recognize names, abbreviations, categories, formats, and OVO codes, then offer a useful recovery path when no match exists.

Baymard identifies support for multiple [ecommerce search query types](https://baymard.com/blog/ecommerce-search-query-types) and well-designed [autocomplete](https://baymard.com/blog/autocomplete-design) as important product-finding capabilities. The design implication is exposed, forgiving search—not merely a search icon.

### 7. Trust and testing presentation

**Warm OVO wins.**

Datum’s trust strip is excellent as a scan pattern, but competitor-style trust strips often substitute unsupported claims for evidence: review totals, purity numbers, laboratory badges, shipping promises, or regulatory language.

OVO’s better move is to use the same pattern only for observable interface facts:

- 10 distinct compounds and blends;
- 4 clear categories;
- search by molecule or code;
- testing status on every item.

All analytical fields remain “No result reported” or “Not represented.” There is no fictional per-lot evidence dataset, no certificate, and no laboratory relationship. The design must make absence legible rather than turning visual polish into implied proof.

The [FTC Health Products Compliance Guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance) evaluates the overall net impression of health-related marketing, not isolated disclaimers. That makes restraint across imagery, badges, product copy, and testing presentation more important than relying on the fiction banner alone.

### 8. Premium character

**Warm OVO wins.**

Datum’s white/cobalt system is effective but more substitutable. Many health, science, and SaaS-adjacent storefronts use the same cues. Warm OVO owns a more specific world: amber glass, limestone and paper, espresso type, terracotta emphasis, and a restrained italic wordmark.

Porcelain should preserve premium character through material contrast rather than a tan page wash:

- white page ground;
- near-white warm cards;
- amber products inside ivory wells;
- espresso action color;
- terracotta for meaningful emphasis;
- gold restricted to photography and the wordmark period;
- Fraunces only where editorial distinction matters.

This avoids the false choice between “clinical white” and “old-money tan.” The clean field and the premium material system can coexist.

### 9. Mobile conversion path

**Datum wins page economy; current OVO wins interaction maturity.**

The measured narrow-width gap is the most consequential: the first product grid begins at 1,081px in Datum and 2,076px in warm OVO. On a 390×844 viewport, that is more than one full screen of additional distance.

Porcelain’s narrow stack should therefore remain:

1. fiction banner;
2. wordmark, menu, and cart;
3. full-width search;
4. horizontally scrollable categories;
5. compact hero copy;
6. hero image and overlays;
7. 2×2 factual strip;
8. two-up catalog grid.

Touch targets remain at least 44px, Add remains visible, the menu and cart retain focus management, and no critical discovery path is hidden behind a decorative interaction.

### 10. Accessibility, motion, and performance

**Current OVO is the safer foundation.**

The rebuilt variant must preserve:

- visible focus on every control;
- Escape and focus-return behavior for overlays;
- keyboard search navigation;
- truthful disabled and error states;
- reduced-motion handling;
- self-hosted fonts;
- explicit image dimensions;
- accessible contrast;
- no third-party font request.

The governing accessibility reference is [WCAG 2.2](https://www.w3.org/TR/WCAG22/). Motion should follow the user’s preference as described in [web.dev’s `prefers-reduced-motion` guidance](https://web.dev/articles/prefers-reduced-motion).

Animations should clarify state and hierarchy. They should not delay the catalog or make the interface feel heavier than Datum.

## Why Porcelain is the best synthesis

| Goal | Pure Datum | Warm OVO | Porcelain |
|---|---|---|---|
| Immediate cleanliness | Strong | Moderate | Strong |
| Product-finding speed | Strong | Moderate | Strong |
| Premium distinctiveness | Moderate | Strong | Strong |
| Sanitary/professional signal | Strong | Moderate | Strong |
| Packaging desirability | Moderate | Strong | Strong |
| Truth-state clarity | Moderate | Strong | Strong |
| Accessible interaction foundation | Weaker original commit | Strong | Strong |
| Risk of generic category styling | Higher | Low | Low if palette rules hold |
| Risk of editorial friction | Low | Higher | Low |

Porcelain is not a color reskin. The layout, hierarchy, responsive behavior, and product-card composition are deliberately product-first. The OVO identity is reintroduced through typography, materials, imagery, and tone—not by restoring the cream page wash that created the original pacing problem.

## Validation plan

Run the warm and Porcelain routes as a controlled comparison with the same catalog, concept prices, product facts, and truth rules.

### Primary behavioral signals

- visitor reaches a product page;
- catalog interaction;
- search usage and successful search selection;
- filter usage and recovery from zero results;
- concept Add action;
- cart drawer open after Add;
- testing-page visit from a product decision point.

### Diagnostic signals

- time or scroll depth before first product interaction;
- query corrections and zero-result rate;
- category-row use;
- menu opens without destination selection;
- product-card versus hero CTA contribution;
- mobile versus desktop path differences.

### Guardrails

- no increase in confusion about whether the store is real;
- no testing state interpreted as a result;
- no broken keyboard, focus, or reduced-motion behavior;
- no horizontal overflow at 320px or 390px;
- no regression in load, input responsiveness, or layout stability;
- no route, cart, or newsletter state shared accidentally between the two variants.

There is no checkout, so cart additions are an interface-learning signal rather than revenue. A future commercial test would require its own legal and operating review before any transactional metric could exist.

## Final decision

The white version should move forward.

Datum proved that the store becomes more convincing when commerce architecture is explicit. OVO proved that a peptide concept can look premium without fake clinical theater. Porcelain is the better combined answer: white enough to feel clean, warm enough to feel owned, dense enough to feel shoppable, and restrained enough to keep every claim honest.

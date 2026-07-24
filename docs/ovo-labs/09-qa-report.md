# OVO Labs — Release QA Report

*July 24, 2026 · fictional concept storefront*

## Decision

**Release-candidate status: PASS.**

The OVO Labs storefront has no known critical, high, or medium source or visual defects. Production shipment remains gated on:

1. remote branch verification;
2. production deployment and public-host canary checks.

## Scope

- 22 canonical content routes:
  - homepage;
  - catalog;
  - curated sets;
  - testing;
  - journal index and three articles;
  - about, FAQ, policies, and designed 404;
  - ten product pages.
- Three canonical compatibility redirects: access, eligibility, and lot record.
- 42 legacy deep-link redirects: 25 former Datum paths and 17 former Third Standard paths.
- Desktop at 1440px.
- Narrow layouts at 390px and 320px.
- Default, search-open, cart-open, menu-open, filtered, empty, saved-newsletter, and testing-result states.

## Automated results

| Suite | Result |
|---|---:|
| Core Playwright preflight | 314/314 checks passed |
| Canonical route-width regression matrix | 924/924 checks passed |
| Legacy redirect matrix | 252/252 checks passed |
| Axe accessibility audit | 71 scans, zero violations |
| Stateful interaction matrix | 58/58 checks passed |
| Canonical route matrix | 22/22 passed at 1440px, 390px, and 320px |
| Legacy redirect targets | 42/42 reached the matching OVO route |
| Production-style designed 404 | 42/42 checks passed across widths and path depths |
| Console and uncaught page errors | Zero |
| Broken internal links | Zero |
| Broken images | Zero |
| Duplicate IDs | Zero |
| Horizontal overflow | Zero |
| JavaScript syntax | Passed |
| CSS brace structure | Passed |
| Task-scope `git diff --check` | Passed |

The Axe matrix covered all 22 routes at all three widths, then five additional open or changed interaction states.

## Interaction results

- Predictive search:
  - product-name, category, strength, and OVO-code matching;
  - common alias and abbreviation matching;
  - typo-tolerant recovery, including `retatruitde` → Retatrutide;
  - Arrow Up, Arrow Down, Enter, Escape, and active-descendant semantics;
  - useful zero-results state.
- Catalog:
  - category filtering;
  - collection search;
  - four sort states;
  - URL synchronization, deep links, and reload persistence;
  - desktop ruled filters and an accessible mobile filter sheet;
  - visible applied state, focus trap, Escape, backdrop close, and trigger-focus return;
  - complete empty-state recovery.
- Product pages:
  - three gallery states;
  - quantity clamping;
  - primary and sticky-mobile Add actions;
  - accordion state;
  - related-product navigation.
- Cart:
  - add, increment, decrement, remove, clear, subtotal, and reload persistence;
  - modal semantics, background inertness, focus trap, Escape, and trigger-focus return;
  - no checkout, payment, order, account, shipment, or network submission.
- Testing:
  - product-name and OVO-code lookup;
  - exact match and no-match states;
  - deep-link query behavior.
- Newsletter:
  - email validation;
  - local-only preference persistence;
  - no email address in storage or network traffic.
- Mobile:
  - menu trap and return focus;
  - filter-sheet trap and return focus in normal and reduced-motion modes;
  - direct search;
  - two-column catalog at 390px and 320px;
  - sticky PDP action only after the primary action has passed.
- Analytics:
  - all 19 documented browser-local events reconcile with the runtime dictionary;
  - search emits only a query class, length bucket, and result count after a 650ms debounce;
  - raw search strings, email values, cart contents, and health or use-case data are never emitted.

## Accessibility and responsive corrections

The final pass corrected:

- a four-pixel 320px overflow caused by an image bleed calculation;
- hidden mobile filter structure that created a heading-order skip;
- missing intermediate headings on sets, journal, and 404 product groups;
- a fiction notice outside a named landmark;
- dialog roles attached to an incompatible semantic element;
- mobile filter focus reconciliation after reduced-motion transitions;
- root-relative 404 assets so deep unknown paths keep the full designed experience.

The corrected build returned zero Axe violations across the complete 71-scan matrix.

## Truth, privacy, and safety checks

- The exact banner appears on every canonical route:

  > Fictional concept storefront. Nothing here is real, stocked, or for sale.

- No fake laboratory, result, report, purity, customer, review, stock, shipping, popularity, scarcity, urgency, checkout, payment, order, or fulfillment claim.
- No dosing, preparation, administration, medical, efficacy, outcome, or human-use guidance.
- No syringe, needle, bacteriostatic-water, capsule, dropper, protocol, body, patient, clinician, or outcome imagery.
- All five production font files are self-hosted; runtime network capture shows no third-party host.
- Cart contents, recently viewed codes, and the newsletter preference remain browser-local.
- Entered email values and cart contents are not transmitted.
- No external scripts or Product/Offer structured data.
- Adversarial XSS strings render as inert text.

## Performance snapshot

Measured locally in headless Chromium over three cold browser contexts per route:

| Route | Median DOMContentLoaded | Median load | Transfer | External requests |
|---|---:|---:|---:|---:|
| Home | 103.9 ms | 129.0 ms | 590.0 KB | 0 |
| Catalog | 43.9 ms | 52.8 ms | 278.5 KB | 0 |
| Retatrutide PDP | 45.7 ms | 61.2 ms | 424.6 KB | 0 |
| Testing | 38.1 ms | 67.0 ms | 188.9 KB | 0 |

These are local transport measurements, not production Core Web Vitals. The production canary must verify status, assets, console, overflow, and custom-404 behavior after deployment.

## Independent review

The independent read-only adversarial review returned **SHIP** after verifying the storefront behavior, responsive drawer recovery, privacy-safe telemetry, canonical URLs, `noindex` policy, source-note relevance, search fuzziness and debounce, set arithmetic, and runtime/documentation event parity. No material contradiction, unsafe claim, or remaining source-level blocker was found.

Fable 5 reviewed all 24 current desktop, 390px, and 320px render artifacts and returned **SHIP — 9/10**. Desktop and mobile hierarchy, typography, palette and material, ecommerce credibility, responsive behavior, interaction-state presentation, and the fiction/integrity boundary all passed.

The production-style Cloudflare runtime returns the designed OVO Labs page with an HTTP 404 for unknown `/ovo-labs/` paths. The same behavior remains a required public-host canary after deployment.

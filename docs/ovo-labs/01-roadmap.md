# OVO Labs — 12-Month Roadmap

*Fictional-company plan · all commercial phases are conditional on written launch-gate approval*

## Roadmap logic

OVO Labs has two parallel workstreams:

- **Concept track:** research, design, build, QA, content, and measurement that can proceed without commerce.
- **Operating track:** legal, quality, financial, supplier, and fulfillment work that must remain hypothetical until authorized.

The concept can ship. Commerce cannot.

## Month 1 — Complete the storefront system

### Build

- Ship the full homepage, catalog, category views, bundles, Testing & COAs, Learn, About, policy, PDPs, demo cart, search, filters, and sort.
- Make search visible at every viewport.
- Render two complete product cards per typical mobile viewport.
- Use one predictable PDP decision block.
- Represent every test state as “No result reported.”
- Remove all inherited record-room positioning.

### Verify

- Desktop review at 1440 × 1000.
- Mobile review at 390 × 844 and 375 × 812.
- Keyboard-only pass, focus order, menu focus trap, escape behavior, and reduced motion.
- Broken-link, 404, search, filter, sort, cart persistence, quantity, remove, clear, and newsletter-demo tests.
- Lighthouse baseline and asset audit.
- Fable 5 explicit visual ship/no-ship review on rendered desktop and narrow-width evidence.

### Exit criteria

- All public routes complete.
- Every visible control works.
- No critical or high-severity QA defects.
- No prohibited claim or fabricated proof.
- Fable 5 verdict: ship.

## Month 2 — Instrument the concept

- Version and verify the implemented browser-local event contract: `page_view`, `view_item_list`, `search`, `filter_apply`, `sort_changed`, `select_category`, `select_item`, `select_article`, `view_item`, `product_media_selected`, `view_testing`, `quality_lookup`, `view_article`, `add_to_cart`, `view_cart`, `cart_quantity_changed`, `remove_from_cart`, `cart_cleared`, and `newsletter_demo_completed`.
- Do not collect health, use-case, or sensitive research details.
- Keep the concept event stream in `window.dataLayer` and `window.OVOAnalytics.events()`; do not connect an external analytics, email, CRM, or advertising destination.
- Create browser-local funnel and viewport QA reports.
- Establish repeatable local Core Web Vitals lab baselines; any future networked RUM requires a separate privacy and retention review.
- Add a monthly zero-result search report.
- Run five moderated mobile usability sessions and five desktop sessions.

### Exit criteria

- Event definitions documented and deduplicated.
- 100% of test participants understand the fiction state.
- Search and cart events reconcile in test sessions.
- No personal or health information is captured.

## Month 3 — Conversion baseline

- Test visible search copy and result density.
- Test category tiles versus text-only navigation.
- Test four-up versus three-up desktop product grids.
- Test two-up versus one-up mobile cards.
- Test PDP accordions and testing-state placement.
- Test cart-drawer hierarchy and end-of-demo language.
- Create a baseline report by new/returning visitor and viewport.

### Exit criteria

- Each test has a pre-registered hypothesis, primary metric, guardrail, duration, and sample requirement.
- No test introduces fake urgency, reviews, stock, shipping, or proof.
- Learnings are documented even when the control wins.

## Month 4 — Content foundation

- Prepare the first four product-finding and evidence-literacy guides for direct, unindexed concept review.
- Build internal links from each guide to categories, PDPs, and Testing & COAs.
- Add Organization, WebSite, BreadcrumbList, and Article schema where accurate.
- Do not emit Product, Offer, AggregateRating, or availability schema.
- Preserve `noindex, nofollow` on every canonical route and do not submit a discovery sitemap.
- Establish editorial review for scientific neutrality, citations, and intended-use risk.

### Exit criteria

- Eight source-backed articles complete and reachable by direct link.
- Every page has a defined user intent and next action.
- No article includes dosing, preparation, administration, or outcome guidance.

## Month 5 — Competitive and customer learning

- Re-audit six direct storefronts and seven established scientific suppliers.
- Conduct 15 interviews with legitimate research procurement, lab operations, or ecommerce UX participants.
- Separate observed behavior from self-reported preferences.
- Analyze zero-result searches, category exits, PDP accordion use, and demo-cart abandonment.
- Refresh the top 20 CRO hypotheses.

### Exit criteria

- At least 10 high-confidence usability observations.
- Every strategic recommendation includes an evidence grade.
- Competitor claims remain observations, not endorsements.

## Month 6 — Brand and design hardening

- Run accessibility review against WCAG 2.2 AA.
- Validate five-second recognition of `ovolabs.`, “Peptide science, refined,” and the fictional peptide-store category.
- Verify that warm apothecary-modernist art direction increases brand distinction without implying stock, testing, quality, human use, or operating legitimacy.
- Audit every image at full resolution against the safe-imagery contract: no syringes, preparation tools, body context, fake labels, reports, or invented claims.
- Produce a complete component/state inventory.
- Review all desktop and narrow-width states with Fable 5.
- Freeze version 1 design tokens only after review.

### Exit criteria

- Brand and fiction-state comprehension meet the internal targets.
- All critical components have loading, empty, error, success, disabled, and focus states where applicable.
- Fable 5 approves the rendered system.

## Month 7 — Conditional operating diligence

*No public commerce or supplier commitment.*

- Retain specialized FDA/FDCA, customs/import, and product-liability counsel.
- Define the exact proposed material list and jurisdiction.
- Obtain written analysis of intended-use, labeling, website claims, and sales model.
- Identify banking, processing, insurance, testing, storage, and fulfillment requirements using full disclosure.
- Begin vendor diligence with the scorecard in this package.

### Exit criteria

- Written counsel scope complete.
- No counterparty requires vague or misleading business classification.
- Fatal-gate questions have named owners and evidence requirements.

## Month 8 — Conditional quality-system design

- Draft supplier qualification, specification control, sample custody, test-review, deviation, complaint, withdrawal, recall, and record-retention procedures.
- Design a real report-state model: planned, pending, reported, reviewed, rejected, superseded, withdrawn.
- Run tabletop exercises only; do not represent them as operating results.
- Define which public claims would require which source records.

### Exit criteria

- Every proposed claim maps to an evidence owner.
- Every report state has an unambiguous definition.
- No laboratory, lot, or material is represented as approved.

## Month 9 — Conditional partner diligence

- Evaluate at least two independent testing pathways and two supply pathways.
- Verify entity, actual manufacturer, site, methods, original-data access, chain of custody, sanctions, insurance, change control, and recall cooperation.
- Run financial and operational models with conservative exception reserves.
- Do not place production orders.

### Exit criteria

- Vendor scorecard completed from primary evidence.
- At least one backup pathway exists for every critical dependency.
- Unresolved fatal gates remain visible.

## Month 10 — Go/no-go design review

- Counsel reviews the exact storefront, catalog, copy, policies, data flow, and proposed operations.
- Insurer, bank, processor, lab, storage, and fulfillment partners review the same exact model.
- Reconcile all counterparty conditions.
- Decide among: remain a concept, pivot to software/content, pursue qualified research-material operations, or stop.

### Exit criteria

- One board-level decision memo.
- No “conditional approval” is summarized as approval.
- Any operating path includes a funded compliance and quality plan.

## Month 11 — Conditional closed pilot

*Only if every launch gate is passed in writing.*

- Restrict to a narrow approved catalog and small set of qualified organizations.
- Use manual dual review.
- Map every actual record to the exact actual item and recipient.
- Run order-to-cash, complaint, withdrawal, and recall simulations.
- Publish no success claims until data is complete and independently reviewed.

### Exit criteria

- 100% traceability.
- 100% report-to-item match.
- Zero unsupported claims.
- No unresolved critical incident.

## Month 12 — Decision and next roadmap

- Compare concept behavior, interview evidence, operating diligence, risk, and economics.
- Decide whether to scale, narrow, pivot, or stop.
- If continuing, set a second-year roadmap based on observed demand and cleared operations.
- If not continuing, preserve the storefront as a fictional case study or convert it to an ecommerce UX template.

## Monthly executive scorecard

| Dimension | Metric | Current interpretation |
|---|---|---|
| Truth | Fiction comprehension | Must remain 100% |
| Discovery | Search/category-to-PDP rate | Product-finding quality |
| Search | Zero-result rate | Taxonomy and synonym debt |
| Collection | Product-card-to-PDP rate | Card decision quality |
| PDP | Testing/specification open rate | Information demand |
| Intent | Demo add rate | Directional merchandising signal only |
| Cart | Add-to-cart-to-cart-open rate | Cart discoverability |
| Mobile | Critical task completion | Release guardrail |
| Performance | p75 LCP / INP / CLS | Experience health |
| Accessibility | Critical/high defects | Release guardrail |
| Claims | Unsupported-claim incidents | Must remain zero |
| Operations | Launch gates passed | Must be evidence-backed |

## Kill or pivot criteria

- The concept relies on human-outcome content to produce engagement.
- Visitors repeatedly mistake the prototype for an operating store after seeing the banner.
- A lawful operating model requires hiding the exact catalog or intended use from a counterparty.
- Qualified demand cannot fund the required quality and compliance system.
- Suppliers cannot establish actual manufacturing identity or chain of custody.
- Testing records cannot be tied to the exact material represented.
- A critical accessibility, privacy, or security issue remains unresolved.
- Fable 5 does not approve outward-facing design at desktop and narrow widths.

# OVO Labs — Operating Model

*Current state: fictional storefront. This document separates concept operations from any future material operation.*

## Current operating model

OVO Labs currently operates as a static product and research prototype.

### What exists

- A public ecommerce-style website.
- Ten fictional product concepts and three concept sets.
- Search, filters, sorting, PDPs, testing empty states, Learn content, and a browser-local demo cart.
- Concept prices used for UI testing.
- Research, design, QA, and source documentation.

### What does not exist

- Inventory or physical material.
- Released specifications, lots, tests, reports, or laboratories.
- Customers, orders, checkout, payment, tax, shipping, returns, or support operations.
- Live newsletter or account system.
- Supplier, warehouse, fulfillment, bank, processor, insurance, or quality counterparties.

## Current user-state model

```text
anonymous visitor
  ├── searches or browses
  ├── opens a product concept
  ├── sees “No result reported”
  ├── adds/removes concept items locally
  └── reaches end-of-demo state
```

No interaction creates an account, submits an order, reserves material, requests a quote, joins a live list, or contacts an operating company.

## Product-data model

Each concept product has:

- immutable product code;
- canonical slug;
- display name;
- category;
- concept format;
- neutral descriptor;
- concept price;
- testing state;
- related products;
- image asset;
- search synonyms;
- active/inactive publication state.

The default testing state is:

```text
status: no_result_reported
laboratory: null
method: null
sample_identity: null
lot: null
report_date: null
result: null
review_state: not_applicable
```

Null is never converted into a positive claim.

## Content and claim governance

### Claim classes

| Class | Example | Required support |
|---|---|---|
| Interface fact | “Search by product name or code” | Functional QA |
| Concept fact | “Concept price: $105” | Product-data source |
| External scientific/regulatory fact | A method or legal statement | Current primary source and editorial review |
| Operating claim | Shipping time, test result, support response | Prohibited today; source records required in any future model |
| Outcome/safety claim | Human effect, efficacy, safe use | Prohibited |

### Publication workflow

1. Author drafts.
2. Claims owner marks each factual statement as observable, cited, hypothesis, or prohibited.
3. Product owner checks state and link behavior.
4. Accessibility reviewer checks semantics and controls.
5. Fable 5 reviews outward-facing visual decisions.
6. Release owner runs desktop, mobile, and regression QA.
7. Source, review date, and change reason are recorded.

## Website release process

### Before every release

- Diff against the target branch.
- Check all product routes and canonical links.
- Run search test matrix.
- Test filters and sort combinations.
- Test cart add, duplicate add, quantity, remove, clear, persistence, and end state.
- Test mobile menu, search panel, cart drawer, escape, outside click, and focus restoration.
- Test keyboard-only flow.
- Check console errors and broken assets.
- Run link and 404 checks.
- Capture desktop and narrow-width evidence.
- Obtain Fable 5 review for outward-facing UI changes.
- Confirm prohibited-claim scan returns zero.
- Verify the fiction banner on every route.

### Incident severity

| Severity | Example | Response |
|---|---|---|
| S0 | Site implies a real sale, test, lot, lab, stock, or human outcome | Remove/rollback immediately |
| S1 | Cart appears to offer checkout; fiction banner missing | Block release or hotfix |
| S2 | Search/filter/cart task broken; critical accessibility defect | Fix before release |
| S3 | Visual inconsistency, minor content or responsive issue | Schedule promptly |
| S4 | Improvement opportunity | Add to backlog |

## Analytics operations

- Maintain a versioned event dictionary.
- Exclude sensitive health and intended-use information.
- Audit duplicate events monthly.
- Review zero-result searches weekly during active testing.
- Segment by viewport and new/returning state, not by inferred health interest.
- Treat demo-add rate as a merchandising signal, never revenue intent.
- Delete raw data on the shortest practical schedule.

## Current team

| Role | Accountability |
|---|---|
| Product owner | Scope, behavior, prioritization, truth |
| Fable 5 | Outward-facing visual authority |
| Frontend engineer | Implementation, performance, accessibility |
| Research/CRO lead | Evidence, experiments, analytics |
| Claims editor | Sources, language, prohibited-claim review |
| QA owner | End-to-end test matrix and release recommendation |

One person may hold multiple roles, but no one should self-approve a high-risk factual or visual change without an independent review.

## Conditional future operating model

No section below authorizes operations.

### Future journey

```text
approved audience criteria
→ entity and intended-use review
→ permitted catalog scope
→ exact product and evidence review
→ authorized order process
→ item-to-record reconciliation
→ fulfillment and traceability
→ complaint / exception / withdrawal support
```

### Supplier qualification

- Exact legal entity, owners, and sanctions screening.
- Actual manufacturer and site.
- Quality agreement and change notification.
- Synthesis and raw-material records.
- Analytical methods, sample identity, and original-data access.
- Customs and importer-of-record review.
- Capacity, lead-time history, and continuity.
- Complaint, deviation, withdrawal, and recall cooperation.
- Insurance and indemnity.

A sample certificate or marketplace listing is never sufficient.

### Report-state architecture

| State | Meaning |
|---|---|
| Planned | A test is required but no sample has entered the process |
| Pending | A traceable sample is at an identified laboratory |
| Reported | An original report has been received |
| Reviewed | An authorized reviewer has evaluated the report against the defined scope |
| Rejected | The result or record failed review |
| Superseded | A newer valid record replaces it |
| Withdrawn | OVO Labs no longer relies on the record |
| No result reported | No result exists or can be represented |

### Traceability record

Any future real item would require:

- OVO Labs item and lot identifiers;
- supplier and manufacturer identifiers;
- receipt and custody events;
- quantity and storage requirement;
- specification version;
- required tests and exact samples;
- original reports;
- reviewer and decision;
- deviations and disposition;
- inventory balance;
- recipient map;
- withdrawal/recall state.

### Financial controls

- Reconcile order → fees → refund → settlement → bank deposit.
- Track landed cost by actual lot.
- Reserve for tax, chargebacks, quality events, withdrawal, and recall.
- Measure contribution after material, testing, freight, fulfillment, payment, support, and expected exceptions.
- Close monthly before distributions.
- Never describe the business differently to a bank, processor, insurer, warehouse, or customer.

### Privacy and security

- Collect only information required by the approved model.
- Separate account identity, research context, payment, and analytics.
- Use role-based access and immutable audit events for critical records.
- Encrypt in transit and at rest.
- Define retention and deletion by record class.
- Conduct incident-response and access reviews.
- Never expose research details to advertising systems.

## Service-level policy

OVO Labs has no service levels today.

Any future shipping, support, testing, or document-delivery promise must:

1. be measured from real records;
2. name the population and time period;
3. disclose exclusions;
4. have an operational owner;
5. be removed when performance no longer supports it.

## Operating cadences

### Weekly concept review

- Search zero results.
- Broken or confusing journeys.
- Demo-cart funnel.
- Mobile task completion.
- Accessibility and performance regressions.
- Claims and content changes.

### Monthly concept review

- Experiment decisions.
- Competitor changes.
- Content performance.
- Event quality and privacy.
- Roadmap and risk register.

### Conditional future quality review

- Open deviations and complaints.
- Report-to-item mismatches.
- Supplier scorecards.
- Inventory reconciliation.
- Withdrawal/recall readiness.
- Counterparty and regulatory changes.

# Noli competitor checkout matrix and Sparta Labs estimate

**Observed:** July 27, 2026, America/Los_Angeles

**Scope:** 20 active US-facing peptide retailers selling retatrutide or a coded equivalent.

**Method:** Public pages, response headers, source bundles, public WooCommerce Store API responses, and anonymous no-purchase cart and checkout observation. No account was created, no personal information was entered, no payment was attempted, and no order was submitted.

## Locked operating context

- Noli owns product, payment, compliance, fulfillment, and customer risk.
- OVO Talent may provide opt-in creator support only. It is not the peptide seller or processor applicant.
- OVO Academy is an apprenticeship. It is never a course, peptide operator, payment workaround, or source of buyer accounts.
- This document records what competitors expose. It is not evidence that their products or payment accounts were properly approved.
- No hidden products, false MCCs, misleading descriptors, rotated entities, split-volume evasion, or crypto used to conceal merchant activity.

## Executive answer

Lucas did create the payment processor report Alex remembers:

[PAYMENT-PROCESSOR-DEEP-DIVE.md](./lucas-academy-readiness-outcome/peptide-brand/PAYMENT-PROCESSOR-DEEP-DIVE.md), dated April 13, 2026.

It is useful as a historical lead list, but it should not be the source of truth. It combines a few real plugin observations with unsupported claims about processor prevalence, revenue mix, sponsor banks, and what "every serious brand" does. It also mistakes installed plugins and gateways for enabled payment methods or underwriting evidence.

The current merchant audit is more defensible:

- 16 of 20 selected stores use WooCommerce.
- 3 use custom Next.js storefronts.
- 1 uses a custom Laravel-style application.
- NMI appears as a current gateway ID at 5 retailers.
- Link Money appears as a current bank-payment ID at 5 retailers.
- CircoFlows appears directly at 2 retailers.
- No retailer in this sample publicly identifies a confirmed acquiring bank or sponsor bank for the observed checkout.
- Several stores expose multiple gateway adapters. That does not prove multiple independently underwritten merchant accounts.
- Card logos are not processor evidence.
- An installed plugin is not enabled checkout evidence.

The best Noli lesson is simple: one fully underwritten primary rail, one separately approved alternate, and one normalized payment ledger. Competitors prove that adapters are plentiful. They do not prove that a five-rail checkout is stable, approved, or easy to operate.

## Evidence grades

- **A:** Direct current checkout label or direct current source-code provider ID.
- **B:** Direct current anonymous WooCommerce Store API payment method ID.
- **C:** Current public terms, FAQ, page source, or a recent no-purchase audit that is now blocked by a gate or WAF.
- **D:** Current storefront exists, but the payment party is not publicly exposed.

The WooCommerce Store API values below came from a fresh anonymous request to `/wp-json/wc/store/v1/cart`. Availability can change by cart contents, geography, login state, underwriting state, or merchant configuration.

## Sparta Labs

### How long has it been selling?

The strongest public date is the [BBB profile](https://www.bbb.org/us/sc/north-charleston/profile/chemical-production/sparta-labs-llc-0663-34352846):

- Business started: December 14, 2025.
- Business incorporated: December 14, 2025.
- BBB file opened: July 2, 2026.
- One employee is listed.
- Clayton Pruitt is listed as CEO.

[LinkedIn](https://www.linkedin.com/company/sparta-labs/) also says founded in 2025 and currently shows 2 followers and a self-reported 2 to 10 employee range.

The current Medusa product records were created around June 13, 2026. Therefore:

- The legal business is about 7.5 months old.
- The current product backend is directly confirmed for about 6 weeks.
- The first actual sale date is not public. Do not assume sales began on incorporation day.

### What checkout stack does Sparta use?

[Current retatrutide product](https://spartalabs.net/us/products/retatrutide)

- Storefront: custom Next.js on Vercel.
- Commerce backend: Medusa. The response sets `_medusa_cache_id`, and the product data uses Medusa product and variant identifiers.
- Direct current provider ID: `pp_circoflows_circoflows`.
- Direct current crypto IDs: `pp_crypto-btc_crypto-btc` and `pp_crypto-evm_crypto-evm`.
- Crypto assets exposed in current code: BTC, ETH, USDT ERC-20, and USDC ERC-20.
- Current code also contains customer-facing P2P channels for Venmo, Apple Cash, Cash App, and Zelle.
- The public page displays Visa, Mastercard, Amex, Discover, Apple Pay, Google Pay, Cash App Pay, and Amazon Pay logos.

The provider ID is direct evidence of CircoFlows. The logos are not proof that every wallet or card brand is currently enabled. Current client code even returns true from a function named `isStripeCardProvider` while the actual named provider is CircoFlows. There is no direct Stripe key or Stripe transaction evidence. Do not say Sparta uses Stripe.

[CircoFlows](https://circoflows.com/solutions) publicly says its platform can integrate with NMI, Authorize.net, and USAePay. That does not establish which gateway, acquirer, or sponsor bank underlies Sparta's account. None was publicly proven.

### What does Sparta probably make?

There is no reliable public order count, settled revenue, traffic count, or independent review volume.

Signals pointing to an early-stage business:

- The LLC began in December 2025.
- The current commerce backend dates to June 2026.
- BBB lists one employee.
- LinkedIn shows 2 followers.
- A current independent supplier index lists Sparta with 0 public reports.
- The site claims `5.0 / 5` and `1,000+ reviews`, but the current product backend returns `reviewCount: 0` and `rating: 0`.

The review claim could come from another system or prior channel, but it is not independently corroborated and is internally inconsistent with the product backend. It cannot support a revenue estimate.

Using a $150 illustrative average order value:

| Orders per day | Annualized gross revenue |
|---:|---:|
| 1 | $54,750 |
| 5 | $273,750 |
| 10 | $547,500 |
| 25 | $1,368,750 |
| 50 | $2,737,500 |

**Working estimate:** about $200,000 to $300,000 annualized today, with a wider plausible band of roughly $50,000 to $550,000. Confidence is low. More than $1 million annualized would require about 19 orders per day at a $150 AOV, or meaningful wholesale, private, or affiliate volume that is not visible publicly.

This estimate is deliberately conservative. It is not proof that the owner is small or that private demand does not exist.

## Current competitor matrix

| Retailer and exact page | Platform | Current payment and checkout evidence | What is directly named, and what remains unknown | Scale or maturity proxy | Grade | Steal score |
|---|---|---|---|---|---|---:|
| [Sparta Labs](https://spartalabs.net/us/products/retatrutide) | Next.js, Vercel, Medusa | Source code names CircoFlows, custom BTC/EVM crypto, and P2P channels. Page shows card and wallet logos. | CircoFlows is direct. Acquirer and sponsor bank are unknown. Logos do not prove enabled methods. | Started Dec. 2025, current backend Jun. 2026, 1 BBB employee, 2 LinkedIn followers. | A | 4 |
| [Loti Labs](https://lotilabs.com/product/retatrutide-10mg/) | WooCommerce | FAQ lists cards, same-day ACH, Zelle, and crypto. Source exposes installed NMI, UMGInc, and crypto gateway assets. Account gate prevents a current anonymous enabled-method check. | NMI plugin evidence only. Acquirer and sponsor bank unknown. | Domain 2019 and functioning storefront evidence by Feb. 2020. Strongest longevity in this set. | C | 5 |
| [Biologix Labs Research](https://biologixlabsresearch.com/product/retatrutide/) | WooCommerce | Current API IDs: `maef_child_gateway`, `bankful_hosted_gateway`, `mecom_paypal`, `linkmoney`, `bacs`, `cheque`. Checkout labels card plus Apple/Google Pay, Bankful card, PayPal via CardsShield, Link Money bank pay, Zelle, Venmo. | Bankful, CardsShield, Link Money are direct adapter evidence. Underlying card acquirer and sponsor bank unknown. | Domain Sep. 2025, 72 products and 81 variations, affiliate, points, and broad catalog. | A | 4 |
| [Skye Peptides](https://skyepeptides.com/register/) | WooCommerce | [Current API](https://skyepeptides.com/wp-json/wc/store/v1/cart): `nmi`, `nmi2`, `nmi3`. eDebit Direct ACH plugin is installed but is not in the current anonymous method list. | NMI gateway profiles are direct. They do not prove three processors or banks. | Domain 2023, public 2024 COAs, mature membership gate, Trustpilot 4.0 from 47 reviews in the prior audit. | B | 5 |
| [Pure Compounding Labs](https://purecompoundinglabs.com/product/glp-3/) | WooCommerce | Current research-account gate. Recent anonymous checkout showed detailed research qualification but no payment method in the fresh state. WAAVE component is present. | No current processor, acquirer, or sponsor is proven. | Strong buyer qualification and July 2026 policies, but limited independent demand evidence. | C | 4 |
| [SMT Peptides](https://smtpeptides.com/product/glp3-r/) | WooCommerce | Current WAF blocks command-line inspection. July 22 checkout showed cards and BTC, LTC, and PYUSD. Public payment guide also listed Venmo and ACH. | No named card gateway, acquirer, or sponsor bank. | Broad catalog, current COA library, Klaviyo, reviews, and SMS. | C | 3 |
| [Xcel Peptides](https://www.xcelpeptides.com/product/glp-3/) | WooCommerce | [Current API](https://www.xcelpeptides.com/wp-json/wc/store/v1/cart): `custom_payment`, `custom_f02fb6bf9eacd04`, `edd_ach_yodlee_gateway`, `forumpay`, `custom_a01c61164774e7b`, `givepayments`. | eDebit Direct ACH/Yodlee, ForumPay crypto, and GivePayments card are direct. Three custom adapters remain opaque. Sponsor bank unknown. | Domain 2023, current account gate, documented operation in 2024. | B | 5 |
| [Mile High Compounds](https://milehighcompounds.is/) | WooCommerce | [Current API](https://milehighcompounds.is/wp-json/wc/store/v1/cart): `nmi`, `sstg_payments`, `maef_child_gateway`, `linkmoney`. | NMI and Link Money are direct. Two custom IDs are opaque. Acquirer and sponsor unknown. | Domain Jul. 2025. Seller claims 20,000+ researchers and 70+ compounds, not audited. | B | 4 |
| [Pink Pony Peptides](https://pinkponypeptides.com/my-account/) | WooCommerce | Current WAF returns 406. July 22 terms listed major cards and ACH. Source showed custom gateway and anti-fraud assets. | No named processor, acquirer, or sponsor bank. | Domain Jul. 2025, current gated catalog and 2026 public enforcement activity. | C | 2 |
| [Prime Sciences](https://prime-sciences.com/customer/register) | Custom Laravel-style app | Hard account gate. No public current payment method or processor found. | All regulated payment parties unknown. | Current gated catalog and documented operation in 2026. | D | 2 |
| [PekCura Labs](https://pekcuralabs.com/shop/pcl-glp-3-r-10mg/) | WooCommerce | Current WAF blocks inspection. July 22 checkout showed card, linked-bank ACH, GreenPay, and registered-account payment. Public policy references WAAVE restrictions. | GreenPay and WAAVE are observed names. Underlying card acquirer and sponsor unknown. | Public 2024 artifacts, deep research qualification, and broad COA evidence. | C | 4 |
| [American Peptides](https://www.americanpeptides.us/products/retatrutide) | Next.js, Vercel | Current terms list Visa, Mastercard, Amex, Discover, ACH/wire, BTC, ETH, and USDT through unnamed compliant providers. Source does not name a provider. | Card and crypto brands are policy claims, not processor evidence. | Custom storefront, subscriptions, volume tiers, lot mapping, and 10% to 35% recurring affiliate ladder. | C | 5 |
| [Modern Peptides](https://modern-peptides.com/product/glp-3-r/) | WooCommerce | [Current API](https://modern-peptides.com/wp-json/wc/store/v1/cart): `linkmoney`, `seamlessach`. | Link Money and SeamlessACH are direct. No current anonymous card adapter is exposed. | Large COA archive, loyalty, affiliates, and a broad current catalog. | B | 4 |
| [Polaris Peptides](https://polarispeptides.com/my-account/) | WooCommerce | [Current API](https://polarispeptides.com/wp-json/wc/store/v1/cart): `paynote`, `custom_a01c61164774e7b`, `blockonomics`, `depay_wc_payments`, `nmi`. | NMI, Blockonomics Bitcoin, and DePay crypto are direct. Paynote and the custom adapter need confirmation. | Current gated catalog and lot evidence, but mixed continuity signals. | B | 3 |
| [GL Peptides](https://www.glpeptides.is/products/retatrutide) | Custom Next.js | Current FAQ says Visa, Mastercard, Amex, and other encrypted options. Source does not identify the processor. | Card brands only. Gateway, acquirer, and sponsor bank unknown. | Open catalog, Reta vial and prefilled pen, referral and creator funnels. | C | 3 |
| [Gentleman Peptides](https://gentlemanpeptides.com/) | WooCommerce | [Current API](https://gentlemanpeptides.com/wp-json/wc/store/v1/cart): `nmi`, `nmi3_apple_pay`, `nmi3_google_pay`, `linkmoney`. | NMI, Apple Pay/Google Pay profile names, and Link Money are direct. Acquirer and sponsor bank unknown. | Account gate, creator/referral program, 5% cashback, public current Reta catalog. | B | 4 |
| [Peptide Partners](https://peptide.partners/product/glp-3-retatrutide/) | WooCommerce | [Current API](https://peptide.partners/wp-json/wc/store/v1/cart): `tagada`, `bacs`, `mecom_paypal`. | Tagada orchestration, bank transfer label, and CardsShield/PayPal adapter are direct. Tagada's underlying processor is unknown. | Domain Mar. 2025, bulk catalog, owned media, affiliate engine, independent Dec. 2025 reporting. | B | 4 |
| [Ion Peptide](https://ionpeptide.com/product/ion3r/) | WooCommerce | [Current API](https://ionpeptide.com/wp-json/wc/store/v1/cart): `authnet`, `nmi`, `nmi2`, `nmi3`, `my_fingrid_gateway`, `monarch_ach`, `idem`, `nmi3_apple_pay`, `nmi3_google_pay`. | Authorize.net, NMI, FinGrid, Monarch ACH, and wallet profile names are direct. `idem`, acquirer, and sponsor bank unknown. | Domain Aug. 2025, 5 to 60 mg ladder, wholesale, live chat, and detailed affiliate governance. | B | 5 |
| [Battle Born Research](https://battlebornresearch.com/product/glp3-10mg/) | WooCommerce | [Current API](https://battlebornresearch.com/wp-json/wc/store/v1/cart): `alg_custom_gateway_1`. Checkout label says pay after checkout, with Zelle, Apple Cash, bank wire, crypto, check by mail, and Venmo. WooPayments is installed but not enabled in the current public checkout. | Manual custom method is direct. No card processor is proven. | Domain 2020, public discussion by 2023, broad current catalog. | A | 2 |
| [Prime Peptides](https://primepeptides.co/products/retatrutide/) | WooCommerce | [Current API](https://primepeptides.co/wp-json/wc/store/v1/cart): `imerchant_gateway`, `circoflows`, `klarna_payments`, `mnet_gateway`, `linkmoney`. Checkout labels iMerchant card, CircoFlows Visa/MC, Klarna, MNet card, and Link Money same-day bank pay. | All five adapters are direct. "Vanguardia Tecnologia" is a billing descriptor shown for CircoFlows, not proof of the processor or bank. Sponsor and acquirer unknown. | Domain 2024, current COAs, active catalog, and documented operation in 2024. | A | 5 |

## What the frequency actually says

Among the direct current Store API and source-code observations:

| Named adapter or layer | Retailers where directly observed | What it proves | What it does not prove |
|---|---:|---|---|
| NMI | 5 | A gateway profile is currently exposed. | Processor, acquirer, sponsor bank, approval durability, or independent MIDs. |
| Link Money | 5 | A bank-payment adapter is currently exposed. | Exact bank, settlement terms, merchant acceptance, or consumer conversion. |
| CircoFlows | 2 | A CircoFlows integration is present. | Whether NMI, Authorize.net, USAePay, or another backend handles settlement. |
| Authorize.net | 1 | Ion exposes an Authorize.net gateway ID. | Who underwrites or acquires Ion's transactions. |
| GivePayments | 1 | Xcel exposes the GivePayments adapter. | Sponsor bank or executed terms. |
| Tagada | 1 | Peptide Partners uses a payment orchestration layer. | Which underlying processor Tagada routes that merchant through. |
| Bankful | 1 | Biologix exposes a Bankful hosted gateway. | Sponsor bank or underwriting acceptance for Noli. |
| Klarna | 1 | Prime Peptides exposes Klarna checkout methods. | That another peptide merchant would receive the same approval. |

This is an adoption snapshot, not a "best processor" ranking.

## The top 12 legitimate lessons

The steal score measures the usefulness of a lawful operating lesson, not whether Noli should copy a retailer's products, claims, or payment arrangement.

1. **Loti Labs, 5/5:** Owned content, SMS, broad catalog depth, and years of continuity matter more than a flashy payment stack. Steal the owned-demand engine and operational patience.
2. **Skye Peptides, 5/5:** Buyer qualification, documentation, and account governance are part of commerce architecture. Steal the control depth and public evidence discipline.
3. **Prime Peptides, 5/5:** Current checkout makes each channel legible. Steal the channel-state UX and internal payment ledger, not the number of adapters.
4. **Ion Peptide, 5/5:** It has the deepest visible adapter mix and unusually explicit affiliate governance. Steal partner rules, tracking, and reconciliation.
5. **American Peptides, 5/5:** Custom merchandising, subscriptions, volume tiers, and lot mapping create a stronger consumer system than a generic catalog. Steal the merchandising architecture after exact approval.
6. **Xcel Peptides, 5/5:** The gate plus portable alternative rails shows how access control and checkout can be separate layers. Steal qualification and cart portability.
7. **Sparta Labs, 4/5:** The custom Next.js and Medusa build makes products, COAs, shipping, and payment choices feel coherent. Steal the clarity. Do not steal the unsupported review presentation or assume its provider relationship transfers.
8. **Biologix Labs Research, 4/5:** It exposes many choices without hiding checkout. Steal the transparent method selection and daily reconciliation. Avoid confusing descriptors and repurposed Woo labels.
9. **Gentleman Peptides, 4/5:** Cards, wallets, bank pay, creator referrals, and cashback are presented in a relatively compact system. Steal the retention loop and keep the rail count constrained.
10. **Peptide Partners, 4/5:** Orchestration plus owned media and affiliates separates demand generation from the underlying gateway. Steal the abstraction and content engine.
11. **Mile High Compounds, 4/5:** The visible architecture is relatively simple: card gateway plus bank payment plus a small number of custom adapters. Steal the simple fallback design.
12. **Modern Peptides, 4/5:** Its current anonymous API exposes only two bank-oriented methods. The lesson is that a simple approved rail set can be easier to reconcile than a checkout full of fragile options.

## Audit of Lucas's report

### What Lucas got directionally right

- WooCommerce is dominant in this category.
- ACH, crypto, and P2P methods are visibly used by some active retailers.
- Several stores configure more than one gateway adapter.
- Payment continuity, reserves, chargebacks, and descriptor clarity deserve dedicated planning.

### What should not be carried forward as fact

- "Nobody has a single processor."
- "Every serious brand runs 3 to 5 rails."
- The claimed 55% to 70% card, 15% to 25% ACH, 5% to 15% Zelle, and 5% to 15% crypto revenue split.
- "Every single peptide brand" using Stripe was shut down in under 30 days.
- Claims that specific brokers place merchants with specific acquiring banks without a direct merchant contract or bank source.
- Treating a plugin name as proof that the method is currently enabled.
- Treating NMI, Authorize.net, or PayTrace as the party approving the merchant category.
- Recommendations to move an offending SKU to another rail, split volume to avoid concentration, or use P2P or crypto as a failsafe around a processor decision.

### Current evidence that corrects it

- Battle Born has WooPayments installed, but its current public checkout exposes only a manual pay-after-checkout method.
- Skye has an eDebit Direct component installed, but its current anonymous API lists only three NMI profile IDs.
- Multiple NMI IDs may be gateway profiles. They do not prove different acquiring banks.
- Modern currently exposes two bank-oriented IDs, not a 3 to 5 rail stack.
- Custom Next.js stores can display card logos while revealing no processor.
- No sampled merchant publicly proves its sponsor bank.

Lucas's file should be labeled **historical and unverified**. Use it to generate diligence questions, not vendor selections or operating doctrine.

## Noli decision

The checkout research does not identify a universally best peptide processor.

The correct diligence packet for every candidate is:

1. Exact Noli legal entity.
2. Exact site, SKU list, claims, audience, subscription model, and creator program.
3. Written acceptance for those exact facts.
4. Gateway, ISO, merchant of record if any, acquirer, sponsor bank, settlement bank, MCC, and descriptor.
5. Reserve percentage, reserve basis, release rule, funding delay, volume cap, chargeback fee, and post-termination hold.
6. Refund authority, dispute tooling, token portability, data export, and shutdown procedure.
7. One primary rail and one separately approved alternate.
8. One ledger reconciling authorization, capture, refund, dispute, reserve, payout, and bank deposit daily.

Simple scales. Complex fails. A five-adapter checkout may look resilient while hiding five settlement schedules, five refund paths, five support failure modes, and no proven sponsor-bank acceptance.

## Primary source trail

- [Sparta Labs product and current storefront](https://spartalabs.net/us/products/retatrutide)
- [Sparta Labs BBB profile](https://www.bbb.org/us/sc/north-charleston/profile/chemical-production/sparta-labs-llc-0663-34352846)
- [Sparta Labs LinkedIn](https://www.linkedin.com/company/sparta-labs/)
- [CircoFlows solutions](https://circoflows.com/solutions)
- [CircoFlows gateway](https://gateway.circoflows.com/)
- Current WooCommerce Store API endpoints linked in the matrix
- [GivePayments WooCommerce plugin](https://wordpress.org/plugins/givepayments-for-woocommerce/)
- [GivePayments](https://www.givepayments.com/)
- [Tagada pricing and integrations](https://www.tagada.io/pricing)
- [Existing July 22 storefront audit](./peptide-research/site-audit.md)
- [Existing 30-seller census](./peptide-research/census.md)
- [Existing payment vendor diligence](./noli-research-20260726/payments-supply-ops.md)

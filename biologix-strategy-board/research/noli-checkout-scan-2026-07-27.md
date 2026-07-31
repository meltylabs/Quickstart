# Noli Retatrutide storefront and checkout scan

Fresh public scan on 2026-07-27. The result is **48 current Reta listings** from **71 eligible U.S. storefronts probed** inside the 655-vendor universe.

Universe inputs: [Finnrick Retatrutide index](https://www.finnrick.com/products/retatrutide) and [Peptide Compare Retatrutide vendors](https://www.peptide-compare.com/best/retatrutide), followed by direct storefront and cart verification.

## Exact coverage

- 84 storefronts were classified as confirmed U.S. retail in the source universe.
- 13 were excluded: the 11 already audited in the first checkout cluster, plus Sparta Labs and BioPep USA, which the main research thread had already audited separately.
- 71 storefronts were probed.
- 48 current Reta listings were directly found and are in the JSON.
- 37 accepted a fresh anonymous product-cart add.
- 33 returned method IDs active for that Reta cart.
- 20 exposed human-readable checkout labels in the public journey.
- No account was created. No PII, checkout submission, order, payment attempt, transaction, credential, gate bypass, or evasion was used.

## What matters for Noli

1. **The dominant stack is simple.** WooCommerce powers 36/48 directly verified Reta listings. Shopify has 3, Next.js has 5, and 4 remained platform-unknown. The fast pattern is a conventional store with strong instrumentation and redundant checkout integrations, not exotic frontend complexity.
2. **Payment resilience is a portfolio.** 33/48 stores exposed active Reta-cart method IDs. Exact identifier counts were Link Money on 11 active carts, Zelle on 7, BACS/bank transfer on 6, NMI on 4, NMI Pay on 2, and IDEM on 3. These are checkout identifiers, not proof of the processor, ISO, or acquirer. 14 configured identifiers were not active for the tested Reta cart, which is why configured plugins cannot be reported as live rails.
3. **Bank and manual rails are normal failover, not edge cases.** Across active carts, bank, wallet/P2P, card-adapter, and crypto integrations coexist. The commercial lesson is redundancy and accurate reconciliation. The risk lesson is that plugin labels do not prove underwriting durability.
4. **Gates are common and costly.** 44/48 showed RUO/not-for-human-consumption language, 14 showed age/21+ attestation, and 13 showed an account/login gate. Several mobile first folds were entirely consumed by a gate. Treat qualification as a deliberate product decision and measure its conversion cost.
5. **Affiliates beat subscriptions in this cohort.** Affiliate or ambassador acquisition was the strongest detected mechanic at 34/48 stores; subscription/auto-ship led only 4. The strongest compliant takeaway is a controlled partner program with attributable codes, approved creative, and claim monitoring.
6. **Instrumentation is already table stakes.** Analytics: Google Tag Manager 36/48, Google Analytics 28/48, Meta Pixel 16/48, TikTok Pixel 10/48, Microsoft Clarity 5/48, Triple Whale 2/48. Marketing and trust apps: GoAffPro 15/48, Trustpilot 14/48, Klaviyo 10/48, Yotpo 1/48, AfterShip 1/48. Noli should ship clean event naming, first-party order attribution, affiliate-code lineage, and payment-method failure telemetry from day one.
7. **UI leaders combine proof with a clean product path.** Automated mobile leaders were researchchemhq.co 9.2, greatestpeptides.com 8.9, lifelinkresearch.com 8.9, tidetopia.com 8.8, royal-peptides.com 8.6. Scores are reproducible 390x844 DOM/image/cart heuristics, not subjective design awards. Every profile includes the five subscores and 1-3 concrete reasons.

## Active checkout identifiers

Most frequent active identifiers: linkmoney (11), zelle (7), bacs (6), nmi (4), idem (3), tagada (3), edd_draft_yodlee_gateway (3), paygatedotto-instant-payment-gateway-hostedpaygatedotto (2), bytenft (2), crypto (2). Read each as exact public code/runtime evidence at the named provider, gateway, or method layer. The merchant's private contract, MID, acquirer, reserves, and settlement remain separate.

## Storefront sheet

Stock is the state returned by the product API or public product page. Price is the displayed listing price and is not normalized for strength, bundle size, discount, shipping, or tax.

| Store | Platform | Display price | Stock | Active methods | Payment grade | Mobile UI |
| --- | --- | ---: | :---: | ---: | :---: | ---: |
| [adaptpeptides.com](https://adaptpeptides.com/product/retatrutide/) | WooCommerce | USD 89.00 | in | 4 | A | 7.9 |
| [agelessvitalitypeptides.com](https://agelessvitalitypeptides.com/product/retatrutide-10mg/) | WooCommerce | USD 99.00 | in | 2 | A | 7.7 |
| [arcticlabsupply.com](https://arcticlabsupply.com/products/retatrutide-10mg) | Unknown | unknown | ? | 0 | D | 4.7 |
| [behemothlabz.com](https://behemothlabz.com/product/retatrutide-peptide/) | WooCommerce | USD 147.58 | in | 6 | A | 8.4 |
| [geneticpeptide.com](https://geneticpeptide.com/product/glp-r-vial-2/) | WooCommerce | USD 155.00 | in | 5 | A | 6.1 |
| [getprimelabs.com](https://getprimelabs.com/products/retatrutide-10mg-triple-receptor-agonist-glp-1-gip-glucagon-research-peptide) | Shopify | USD 170.00 | in | 0 | B | 7.2 |
| [greatestpeptides.com](https://greatestpeptides.com/product/retatrutide-40-mg/) | WooCommerce | USD 220.00 | in | 6 | A | 8.9 |
| [heartlandbiolabs.com](https://heartlandbiolabs.com/product/retatrutide/) | WooCommerce | USD 89.00 | in | 0 | B | 7.8 |
| [hydroresearchpeptides.com](https://hydroresearchpeptides.com/product/r40/) | WooCommerce | USD 350 | in | 0 | D | 4.6 |
| [ignitepeptides.com](https://ignitepeptides.com/product/glp-3-rt-10mg/) | WooCommerce | USD 75.00 | in | 3 | A | 7.1 |
| [labtrustpeptides.com](https://labtrustpeptides.com/product/retatrutide/) | WooCommerce | USD 149.99 | in | 2 | A | 8.5 |
| [lifelinkresearch.com](https://lifelinkresearch.com/product/retatrutide-glp-3-20mg/) | WooCommerce | USD 200.00 | in | 3 | A | 8.9 |
| [luxaralabs.com](https://luxaralabs.com/product/retatrutide/) | WooCommerce | USD 90.00 | in | 2 | A | 7.2 |
| [milehighcompounds.is](https://milehighcompounds.is/product/mhc-3-rt/?attribute_vial-size=50mg) | WooCommerce | USD 279.99 | in | 4 | A | 5.8 |
| [mytidelab.com](https://mytidelab.com/products/retatrutide) | Next.js | USD 99.99 | in | 0 | C | 7.5 |
| [neb.co](https://newbiorx.com/product/retatrutide-multidose-usp-pen-15mg/) | WooCommerce | USD 285.00 | in | 3 | A | 8.3 |
| [northwestpeptides.com](https://northwestpeptides.com/product/glp-3/) | WooCommerce | USD 109.99 | in | 4 | A | 8.3 |
| [nosbarbersupply.com](https://nosbarbersupply.com/products/holas-retatrutide-peptide) | Shopify | USD 199.99 | in | 0 | B | 7.7 |
| [nurevpeptides.com](https://nurevpeptides.com/product/glp-3-rt-30mg-retatrutride/) | WooCommerce | USD 269.00 | in | 3 | A | 7 |
| [nxtstate.co](https://nxtstate.co/product/retatrutide/) | WooCommerce | USD 79.99 | in | 4 | A | 8.1 |
| [onyxbiolabs.com](https://onyxbiolabs.com/product/retatrutide-peptide/) | WooCommerce | USD 54.99 | in | 5 | A | 7.8 |
| [onyxresearch.shop](https://onyxresearch.shop/product/glp-3-rt/) | WooCommerce | USD 78.75 | in | 4 | A | 8.3 |
| [optides.com](https://optides.com/shop/retatrutide) | Next.js | USD 82.99 | in | 0 | C | 7.8 |
| [orionpeptide.com](https://orionpeptide.com/product/retatrutide-10mg/) | WooCommerce | USD 80.00 | in | 3 | A | 7.1 |
| [pacificresearchpeptides.com](https://pacificresearchpeptides.com/product/retatrutide/) | WooCommerce | USD 129.00 | in | 1 | A | 7.5 |
| [peptalabs.com](https://peptalabs.com/peptides/retatrutide-20mg) | Unknown | USD 138.59 | in | 0 | C | 8.4 |
| [peptara.org](https://peptara.org/product/retatrutide) | Unknown | USD 55 | in | 0 | C | 7.7 |
| [peptidehackers.com](https://www.peptidehackers.com/products/retatrutide) | Unknown | USD 100 | in | 0 | D | 8.6 |
| [peptidescollective.com](https://peptidescollective.com/product/r/) | WooCommerce | USD 49.00 | in | 2 | A | 8.2 |
| [peptidology.co](https://peptidology.co/product/g3/) | WooCommerce | USD 54.99 | in | 4 | A | 7 |
| [peptira.com](https://peptira.com/product/reta3-9/) | WooCommerce | USD 179.00 | in | 0 | C | 4.6 |
| [protidehealth.com](https://protidehealth.com/product/glp3/) | WooCommerce | USD 145.00 | in | 1 | A | 7.9 |
| [pspeptides.com](https://pspeptides.com/product/buy-retatrutide/) | WooCommerce | USD 39.99 | in | 1 | A | 7.4 |
| [quantapeptides.com](https://www.quantapeptides.com/shop/retatrutide-10mg) | Next.js | USD 144.99 | out | 0 | C | 6.8 |
| [realpeptides.co](https://www.realpeptides.co/products/trinity-x/) | WooCommerce | USD 130.00 | in | 4 | A | 7.7 |
| [regentide.net](https://regentide.net/product/retatrutide-30mg/) | WooCommerce | USD 375.99 | in | 4 | A | 8 |
| [researchchemhq.co](https://researchchemhq.co/product/rc-3r/) | WooCommerce | USD 119.99 | in | 6 | A | 9.2 |
| [riptidewellness.com](https://riptidewellness.com/product/glp3-r/) | WooCommerce | USD 109.99 | in | 5 | A | 7.6 |
| [rivnpeptides.com](https://rivnpeptides.com/product/reta/) | WooCommerce | USD 99.99 | in | 2 | A | 7.8 |
| [royal-peptides.com](https://royal-peptides.com/shop/retatrutide-vial/) | WooCommerce | USD 55.00 | in | 5 | A | 8.6 |
| [sunday-usa.com](https://sunday-usa.com/product/rt10/) | WooCommerce | USD 200.00 | in | 1 | A | 6.7 |
| [sunrisebioresearch.com](https://sunrisebioresearch.com/product/glp-3-r-200mg-10-x-20mg/) | WooCommerce | USD 399.00 | in | 1 | A | 7.6 |
| [tidetopia.com](https://tidetopia.com/products/retatrutide-30mg) | Shopify | USD 150.00 | in | 0 | B | 8.8 |
| [true-peptides.com](https://true-peptides.com/product/retatrutide) | Next.js | unknown | in | 0 | C | 7 |
| [truepeptidelabs.com](https://truepeptidelabs.com/product/glp-3rt/?attribute_pa_size=30mg) | WooCommerce | USD 190.00 | in | 2 | A | 5.4 |
| [umbrellalabs.is](https://umbrellalabs.is/shop/peptides/peptide-glps/retatrutide-ly-3437943/) | WooCommerce | USD 64.99 | in | 4 | A | 7.9 |
| [uspeptidescience.com](https://uspeptidescience.com/shop/retatrutide) | Next.js | unknown | in | 0 | C | 6.8 |
| [veloraresearch.com](https://veloraresearch.com/product/glp-3-rt) | WooCommerce | USD 81.00 | in | 1 | A | 7.2 |

## Evidence grades

- A: current Reta listing added to an anonymous cart and active method IDs or rendered labels observed.
- B: listing and cart add observed, but an active payment-method state was not verified.
- C: listing observed; payment evidence is public-claim/logo-only or cart was not verified.
- D: listing present but not currently purchasable, or no payment state could be verified.
- E: inaccessible in this pass.

The machine-readable companion is [noli-checkout-scan-2026-07-27.json](./noli-checkout-scan-2026-07-27.json). It is keyed by normalized domain and keeps active, rendered, configured-only, and public-claim-only payment evidence separate.

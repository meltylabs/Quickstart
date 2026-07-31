# Noli storefront census: what matters

Corrected dataset: 570 domains, 1,855 public pages, 13,555 compact evidence records, and zero broken evidence references. The safe crawl used public pages only. It did not create accounts, bypass gates, mutate carts, submit checkout, run transactions, or use credentials.

## The market in one screen

- 245 domains were retail or probable retail.
- 157 listed Reta; 110 showed an availability cue.
- Listing state: 110 available, 24 out of stock, 21 listed without a clear availability cue, and 2 preorder.
- Crawl state: 295 completed, 83 partial, 32 blocked, 100 failed, and 60 intentionally skipped.
- This proves a crowded visible market. It does not prove sales, margin, legality, product quality, or payment durability.

## Fifteen findings

1. **WooCommerce is the default stack.** It appeared on 138 of 245 storefronts, versus Shopify on 14 and Next.js on 13. That shows familiarity and plugin availability, not that WooCommerce is inherently safer or better underwritten.

2. **The listing standard is obvious.** A useful page needs unambiguous identity, variant-bound strength and price, stock, shipping expectation, lot-specific report access, research-use language, contact, and policies.

3. **Pricing needs a manual panel.** Among 99 available domains with plausible USD tokens, the median domain minimum was $39.99 and the median domain-level median was $114. Tokens can be bundles, cross-sells, shipping protection, or crossed-out prices. Do not price Noli from the aggregate.

4. **Common displayed strengths were 10mg, 20mg, 30mg, 5mg, 50mg, and 15mg.** These are domain-level text detections, not guaranteed SKU variants. Exact strength-price comparisons need page review.

5. **Offers are standard.** Free shipping appeared on 69 storefronts, bundles on 67, percentage discounts on 65, and subscriptions on 50.

6. **Basic measurement is the norm among stronger stores.** Google Analytics appeared on 79, Google Tag Manager on 68, Meta Pixel on 28, Klaviyo on 26, and TikTok Pixel on 22.

7. **Available stores exposed more operating proof.** COA links appeared on 65.5% of available stores versus 34.8% of the rest; policies 86.4% versus 58.5%; contact evidence 94.5% versus 66.7%; shipping cues 53.6% versus 25.2%.

8. **Available stores also exposed more conversion machinery.** Offers appeared on 82.7% versus 49.6%, and tracking on 72.7% versus 43.7%. These are observational differences with major crawl and survivorship bias, not causal proof.

9. **Reviews are weaker evidence than they look.** Review evidence appeared on 62 of 245 stores, led by Trustpilot on 32. Counts, stars, “verified” labels, badges, COAs, and purity numbers remain first-party claims until authenticated.

10. **The claims conflict is widespread.** 136 of 245 storefronts showed both research-only language and human-use, administration, therapeutic, or outcome cues. A footer disclaimer does not erase conflicting page copy. This is a content-control risk, not a wording loophole.

11. **Payment code is materially readable.** The combined code census produced 783 exact rows across 149 domains. Forty-eight domains exposed processor/PSP-level code and seven exposed active provider-layer IDs for a tested Reta cart. Direct examples include Stripe on LifeLink, PayPal-named IDs on ResearchChemHQ and Rivn, NMI on six carts, Authorize.Net on three, eDebit Direct on three, Bankful on NewBioRx, and Paynote on Umbrella.

12. **The provider and the private contract are different facts.** Active cart IDs, official SDKs, and configured client code can identify the provider or gateway. They do not establish the merchant's contractual processor/ISO, MID, acquirer, reserve, settlement path, merchant of record, or transaction success.

13. **Manufacturer names remain gated.** Public pages produced many testing, purity, cGMP, US-made, and manufacturing claims, but zero independently verified manufacturer identities.

14. **Northline is a strong page-clarity example, not a verified business benchmark.** Its current public page shows 10/15/20/30/50mg at $79.99/$99.99/$129.99/$189.99/$299.99, stock and cart cues, a BOGO offer, free shipping over $200, public lot reports, and GTM. Its 4.8 rating, 867 reviews, purity, testing, and fulfillment claims are first-party. Its checkout integration, processor, acquirer, manufacturer, revenue, margin, and chargebacks remain unknown.

15. **The opportunity is interesting but fragile.** A visible market exists, but Noli is viable only if legal eligibility, exact claims, supplier quality, written payment approval, lot traceability, fulfillment, and contribution margin remain durable under growth.

## Noli: simple scales, complex fails

1. Make legal product eligibility and exact-claims review the first go or no-go gate.
2. Launch a narrow catalog with one product-data template and a small justified variant set.
3. Require lot-bound testing and traceability before inventory becomes sellable.
4. Secure written payment underwriting for the exact entity, products, claims, geography, and fulfillment model.
5. Start with one storefront, one approved payment path, one fulfillment workflow, and one analytics taxonomy.
6. Track contribution margin after testing, packaging, shipping, discounts, fees, reserves, refunds, chargebacks, support, and reships.
7. Maintain a manually verified 15 to 25 competitor panel for exact weekly pricing and offer decisions.
8. Treat manufacturer identity, quality agreements, independent lot sampling, stability, recall, and continuity as diligence, not forum intelligence.

Full machine-readable synthesis: `.context/noli-full-crawl-synthesis-2026-07-27.json`

Full domain evidence: `biologix-strategy-board/research/retatrutide-vendor-audit-data.js`

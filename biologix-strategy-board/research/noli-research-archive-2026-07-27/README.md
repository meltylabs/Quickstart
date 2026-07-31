# Noli research reconstruction archive

This is the durable evidence pack behind the Noli competitor-intelligence page, current through July 28, 2026. Start with the normalized outputs for decisions, then use these raw inputs when you need to audit a number, reproduce the build, or compare the market with a future snapshot.

## Start here

- [Manifest](./manifest.json): every archived input and major published output with byte size, record count, SHA-256 checksum, purpose, and evidence boundary.
- [Checksums](./SHA256SUMS.txt): quick integrity verification for the complete reconstruction set.
- [Normalized 130-company commercial sheet](../noli-competitor-intelligence-2026-07-27.csv): traffic, domain age, public panels, AOV/CVR assumptions, orders, low/base/high gross checkout, catalog coverage, UI findings, sources, and caveats.
- [Normalized 13,310-offer catalog](../noli-competitor-catalog-2026-07-27.csv): the clean offer-level catalog after schema normalization and deduplication.
- [Automatic 18-company marketing watch](../noli-marketing-watch-2026-07-28.csv): observed offers, tracking, lifecycle/affiliate tooling, public content/social, and official ad-source results with explicit scope.

## Revenue and traffic layer

The research includes revenue-adjacent estimates, but it does not claim audited revenue.

- [Raw traffic and gross-checkout model CSV](./noli-traffic-revenue-all-2026-07-27.csv)
- [Raw traffic and gross-checkout model JSON](./noli-traffic-revenue-all-2026-07-27.json)
- [Wave A daily rank and page-response capture](./noli-traffic-revenue-wave-a-2026-07-27.raw.json)
- Collector-specific daily rank histories: [Wave A](./noli-traffic-revenue-wave-a-2026-07-27.csv), [Wave B](./noli-traffic-revenue-wave-b-2026-07-27.csv), and [Wave C](./noli-traffic-revenue-wave-c-2026-07-27.csv)
- [Sixteen main-company additions plus Northline and Bluum refreshes](./noli-traffic-revenue-main-company-gap-2026-07-28.json): fresh rank history, domain ages, and model inputs for the promoted and priority brands.

The standard model is:

`monthly modeled visits × conversion-rate assumption × modeled AOV = modeled monthly gross checkout`

Traffic uses the Rank.to order-of-magnitude transform `9e10 × rank^-1.05`. Public Semrush, Similarweb-via-HypeStat, and HypeStat values remain visible when captured. Gross checkout is before refunds, disputes, taxes, reserves, failed settlement, payment loss, fulfillment, product cost, service, and overhead. It is not profit and is not an audited settlement.

### Highest and requested gross-checkout signals

| Company | Monthly signal | How to read it |
|---|---:|---|
| Biologix | $1.61M illustration | A private screen showed $53,540.86 and 216 orders for one day. $1.61M assumes that exact day repeats 30 times; it is not an audited settlement or stable average. |
| Simple Peptide | $1.01M base model | The 258,965-visit Rank model is closely corroborated by Semrush at 273,570 visits. Strongest public cross-check in the set. |
| SwissChems | $348K Rank base / ~$720K Semrush-adjusted | Semrush reported 276,970 visits versus the 133,894-visit Rank model. |
| Amino Club | $469K base model | No independent public traffic panel was captured. |
| Prime Peptides | $246K Rank base / ~$481K Semrush-adjusted | Semrush reported 160,460 visits versus the 81,865-visit Rank model. |
| Core Peptides | roughly $102K–$461K | Public panels ranged from 29,018 to 131,629 visits. The Rank-based base model was $406K. |
| Limitless Life Nootropics | $407K base model | No independent public traffic panel was captured. |
| Umbrella Labs | $371K base model | Rank-based scenario with assumed conversion and AOV. |
| Licensed Peptides | $330K base model | Rank-based scenario with assumed conversion and AOV. |
| Northline | $195K trailing / $283K current pace | The trailing 30-day rank integral is the base; the latest-rank pace is a faster run-rate scenario. |
| Bluum Peptides | $53K base; $15K–$114K scenario range | Models about 305 monthly orders from 15,230 visits, 2% conversion, and $175 AOV. Low confidence: 14 rank observations and no independent traffic panel. |

BioLongevity's Rank-based model produced $413K, but a separate HypeStat panel showed roughly 720 monthly visits. That contradiction makes the estimate unsuitable for a practical top-company ranking without first-party analytics.

## Raw public catalog inputs

- [Wave A offers](./noli-catalog-wave-a-2026-07-27.csv) and [coverage summary](./noli-catalog-summary-wave-a-2026-07-27.csv)
- [Wave B offers](./noli-catalog-wave-b-2026-07-27.csv) and [coverage summary](./noli-catalog-summary-wave-b-2026-07-27.csv)
- [Wave C offers](./noli-catalog-wave-c-2026-07-27.csv) and [coverage summary](./noli-catalog-summary-wave-c-2026-07-27.csv)
- [Northline and Biologix supplemental offers](./noli-catalog-supplemental-2026-07-27.csv) and [coverage summary](./noli-catalog-summary-supplemental-2026-07-27.csv)
- [Sixteen main-company additions plus Northline and Bluum](./noli-catalog-main-company-gap-2026-07-28.csv) and [coverage summary](./noli-catalog-summary-main-company-gap-2026-07-28.csv)

These files preserve the collector-specific schemas, public IDs, source URLs, timestamps, methods, access failures, stock signals, quantities, confidence, and caveats before normalization. The normalized catalog removes duplicate offers and excludes empty failure sentinels while preserving the underlying coverage status.

## Raw UI audit metadata

- [Wave A UI audit JSON](./noli-ui-score-wave-a-2026-07-27.json)
- [Wave B UI audit JSON](./noli-ui-score-wave-b-2026-07-27.json)
- [Wave C UI audit JSON](./noli-ui-score-wave-c-2026-07-27.json)
- [112-domain raw capture timing, status, URL, and error manifest](./noli-vendor-ui-capture-manifest-2026-07-27.json)

The JSON retains desktop/mobile scores, access states, performance observations, reasons, evidence URLs, confidence, and references to the original screenshots. Screenshot binaries are intentionally excluded from this archive.

## Automatic marketing and ad-source layer

- [Flat marketing monitor](../noli-marketing-watch-2026-07-28.csv)
- [Machine-readable evidence](../noli-marketing-watch-2026-07-28.json)

The same 18 priority competitors are checked every six hours for visible offers,
tracking tags, lifecycle and affiliate tooling, public program routes, social
profiles, and content recency. The collector also uses the documented anonymous
Microsoft/Bing and Snap transparency APIs. An ad is promoted to verified only
when its destination hostname exactly matches the competitor; Meta, Google, and
TikTok remain official one-click review links until approved API access exists.

Coverage is not universal. Microsoft records Bing.com ads served in the EEA and
can lag one to three days. Snap covers EU delivery in a rolling 12-month window.
An empty result means only “not observed in this source, region, period, and
alias set.” Pixels prove installation, not spend. Nothing in this layer measures
CAC, ROAS, channel share, attributed visits, or campaign profitability.

## Other published evidence layers

- [48-store checkout audit](../noli-checkout-scan-2026-07-27.json)
- [Payment-provider code census](../noli-processor-code-census-2026-07-27.json)
- [Forum and founder source ledger](../noli-forum-founder-sweep-sources-2026-07-27.csv)
- [Biologix / Braden public-footprint check](../noli-biologix-public-footprint-2026-07-28.md)
- [570-domain crawl synthesis](../noli-full-crawl-synthesis-2026-07-27.json)
- [Complete crawl evidence ledger](../retatrutide-vendor-audit-data.js)
- [42-row operator and founder source matrix](./operator-source-matrix.csv)
- [Historical 20-store checkout matrix](./noli-research-20260727-competitor-checkout-matrix.md): retained for unique source provenance. Its early low-confidence Sparta revenue scenario is superseded by the normalized model above.

## Rebuild the normalized intelligence

From the repository root:

For the guarded two-layer live refresh:

```bash
node scripts/refresh-noli-intelligence-suite.mjs
```

The live Noli research page runs catalog/pricing and marketing as independent,
guarded layers every six hours from a commit-pinned macOS background job.
Northline, Bluum, and the sixteen promoted main-company additions are monitored;
13 catalogs have current public storefront feeds. Each successful layer becomes
an immutable versioned snapshot and activates with one atomic payload switch.
The current and three prior snapshots remain available for open browser tabs.
A failed or blocked source retains its last-good observation instead of becoming
a false zero. The local job runs at 00:17, 06:17, 12:17, and 18:17 and catches up
once after Mac sleep; it is not a cloud-uptime guarantee.

For a full reconstruction that also replaces the archived raw inputs:

```bash
node scripts/collect-noli-main-company-gap.mjs

node scripts/build-noli-competitor-intelligence.mjs \
  --traffic biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-traffic-revenue-all-2026-07-27.json \
  --traffic biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-traffic-revenue-main-company-gap-2026-07-28.json \
  --catalog biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-wave-a-2026-07-27.csv \
  --catalog biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-wave-b-2026-07-27.csv \
  --catalog biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-wave-c-2026-07-27.csv \
  --catalog biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-supplemental-2026-07-27.csv \
  --catalog-refresh biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-main-company-gap-2026-07-28.csv \
  --catalog-summary biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-summary-wave-a-2026-07-27.csv \
  --catalog-summary biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-summary-wave-b-2026-07-27.csv \
  --catalog-summary biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-summary-wave-c-2026-07-27.csv \
  --catalog-summary biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-summary-supplemental-2026-07-27.csv \
  --catalog-summary-refresh biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-catalog-summary-main-company-gap-2026-07-28.csv \
  --ui biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-ui-score-wave-a-2026-07-27.json \
  --ui biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-ui-score-wave-b-2026-07-27.json \
  --ui biologix-strategy-board/research/noli-research-archive-2026-07-27/noli-ui-score-wave-c-2026-07-27.json \
  --out-dir biologix-strategy-board/research
```

Then regenerate the archive integrity files:

```bash
node scripts/build-noli-research-archive-manifest.mjs
```

## Deliberate exclusions

No screenshot binaries, complete HTML/JavaScript response dumps, cookies, credentials, authorization headers, accounts, gates, carts, orders, payment attempts, undocumented ad endpoints, or redundant captures are published here. Public stock is not sales. Processor code is not proof of the private MID, acquirer, reserve, settlement chain, or transaction success.

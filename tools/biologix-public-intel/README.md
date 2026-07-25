# Biologix Public Intelligence Poller

This internal tool records low-frequency snapshots of the public Biologix
WordPress and WooCommerce storefront. It turns public catalog changes into
clearly labeled observations and inferences without logging in, probing orders,
collecting customer data, or bypassing access controls.

## What it measures

| Signal | Classification | What it means |
|---|---|---|
| Current stock, price, availability, SKU | Observed fact | Public value returned by the Store API |
| Popularity rank | Observed fact | Current public `orderby=popularity` position |
| Product modification time | Observed fact | Public WordPress product timestamp |
| Stock decrease or increase | Observed fact | Difference between two public snapshots |
| Probable basket | Inference | Two or more decreases whose parent-product timestamps are within five seconds |
| Displayed-price GMV signal | Estimate | Units decreased multiplied by the displayed price |
| Installed analytics tags | Observed fact | Public tags found in homepage HTML |

The poller cannot prove payment, settled revenue, fulfillment, refunds, discounts,
customer identity, sessions, pageviews, conversion rate, or traffic sources.
WooCommerce can change stock for pending orders, cancellations, returns, restocks,
automation, and manual edits.

## Quick start

Requires Python 3.10 or newer and no third-party packages.

```bash
cd tools/biologix-public-intel

# Establish the first baseline.
python3 poller.py snapshot

# Run another snapshot later to create change events.
python3 poller.py snapshot

# Print the last 24 hours as Markdown.
python3 poller.py report --since 24h

# Export snapshots, events, probable baskets, and current inventory.
python3 poller.py export --since 7d
```

The default database is `data/biologix-public-intel.sqlite3`. Runtime data and
exports are intentionally gitignored.

## Continuous polling

```bash
python3 poller.py watch --interval 900 --jitter 30
```

The default interval is 15 minutes. The tool refuses intervals below five minutes.
Jitter avoids hitting the site at exactly the same second on every cycle. Stop with
`Ctrl-C`.

For a Mac that should keep collecting after the terminal closes, use `launchd`,
`tmux`, or a supervised process and call the same `watch` command. Do not create a
high-frequency crawler. The public endpoints already expose exact timestamps, so
five-to-fifteen-minute snapshots are enough for useful direction.

## Commands

```text
snapshot                         Fetch and store one atomic snapshot
watch --interval 900             Poll continuously
report --since 24h               Print a Markdown intelligence report
report --since 7d --format json  Print machine-readable analysis
export --since 30d               Write CSV files under reports/
traffic-audit                    Show detectable public analytics tags and limits
```

Global options must appear before the command:

```bash
python3 poller.py \
  --db /path/to/intel.sqlite3 \
  --base-url https://biologixlabsresearch.com \
  snapshot
```

## Reading the report

Use the three evidence tiers separately:

1. **Observed:** exact public values and changes.
2. **Inferred:** probable basket clusters supported by timestamp correlation.
3. **Unavailable:** facts that require authorized analytics or processor records.

Never call an inventory decrease a paid sale. The useful commercial metrics are:

- observed units down;
- displayed-price GMV signal;
- minimum correlated basket count;
- unclustered decrease candidates;
- units up, which may represent restocks, returns, cancellations, or corrections;
- rank, price, and availability movement.

## Traffic analysis

Public WordPress data does not expose real traffic counts. This tool inventories
public analytics tags so the installed stack is known, but tag IDs do not reveal
sessions or conversions.

Traffic can be analyzed in three progressively stronger ways:

1. **Public-only:** stock velocity, probable baskets, popularity-rank movement,
   product/catalog updates, sitemap growth, search visibility, and third-party
   traffic estimates. Third-party traffic numbers are directional.
2. **Owner-provided read-only:** GA4, Search Console, Cloudflare or Jetpack stats,
   WooCommerce Analytics product exports, and affiliate-platform exports.
3. **Cash truth:** processor settlements, refunds, chargebacks, and bank deposits
   reconciled to WooCommerce orders.

The strongest authorized package is a daily sanitized export containing timestamp,
product/variation, quantity, net sales, order status, coupon amount, refund amount,
and affiliate code, with customer PII removed.

## Data model

- `snapshots`: one successful collection cycle and its public site signals.
- `observations`: product and variation values at that snapshot.
- `events`: stock, price, rank, availability, and catalog changes.
- `event_groups`: timestamp-correlated probable baskets.

Every row retains its evidence level. Reports do not silently promote an inference
into a sale.

## Safety and data quality

- Public `GET` requests only.
- No login, credentials, cookies, order enumeration, or customer endpoints.
- Five-minute hard minimum interval.
- Short timeouts and bounded retries.
- No raw homepage storage.
- No customer or personal data.
- Spreadsheet-formula prefixes are neutralized in CSV exports.
- SQLite writes occur in one transaction per snapshot.
- Variable-product parent stock is excluded from inventory totals when child
  variations already expose quantities, preventing obvious double counting.

This is competitive and operational research, not a professional security audit
and not an accounting system.

## Cloud deployment

The production service at
`https://biologix-public-intel.vercel.app` runs every 15 minutes on Vercel
Cron. A private Vercel Blob store retains 120 days of snapshot summaries,
event deltas, probable-basket inferences, and public site signals.

The cloud runtime additionally records:

- sitemap page counts and latest public modification times;
- public WordPress route and plugin-namespace fingerprints;
- installed analytics, email, payment, cache, CDN, and storefront technology;
- whether aggregate analytics and WooCommerce report endpoints are public or
  correctly require authorization;
- public DNS and origin/cache headers;
- origin response latency and response size.

It deliberately does not collect visitors, IP addresses, cookies, customer
records, review identities, order records, cart contents, or raw homepage HTML.
Installed tag IDs do not expose the tag owner's analytics reports.

Cloud endpoints:

```text
GET  /api/biologix-intel/health
GET  /api/biologix-intel/latest
GET  /api/biologix-intel/report?hours=24
POST /api/biologix-intel/snapshot
```

Only the health endpoint is public. The remaining endpoints require the private
`INTEL_API_TOKEN` bearer token stored as a sensitive Vercel production variable.
The cron route has a separate `CRON_SECRET`. See `vercel/` for the deployable
service and its verification commands.

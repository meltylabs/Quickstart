# Peptide content intelligence pipeline

Generates the data behind the **Content Intel** board
(`biologix-strategy-board/content-intel/`, view 09).

## What it answers

Which peptide / GLP-1 affiliate content actually performs, and how much of that
performance a compliant Biologix affiliate could reproduce.

## Collection: no paid API

ScrapeCreators is **out of credits** (HTTP 402, verified 2026-07-24), so nothing
here uses it. All three lanes are keyless:

| Lane | Method | Notes |
|---|---|---|
| YouTube | `yt-dlp` search + per-video `--dump-json` | full description, where affiliate links live |
| TikTok | `yt-dlp` on the user feed | **must run from a residential IP**; cloud IPs get CAPTCHA'd |
| Instagram | public `web_profile_info` endpoint | bio + all bio_links; sleep 4s between handles |

Requires `yt-dlp` on PATH (`export PATH=/opt/homebrew/bin:$PATH`).
macOS has no `timeout` binary; the scripts use `--socket-timeout` instead.

## Run

```bash
cd .context/peptide-content-intel          # collectors write raw/ here (gitignored)
export PATH=/opt/homebrew/bin:$PATH

node collect_youtube.mjs                   # resumable; caches under cache/
node collect_tiktok.mjs
node collect_instagram.mjs
node analyze.mjs                           # -> content-intel/intel-data.js
```

`collect_youtube.mjs` is resumable and cache-backed. If it is interrupted,
re-run `ONLY=detail,build node collect_youtube.mjs`. Note `ONLY=build` alone
does **not** load the detail cache; use `detail,build`.

Then `npm run build && npx wrangler deploy` from the repo root.

## Data honesty rules baked in

- A metric the platform does not expose is `null`, never `0`, and likes are never
  substituted for views.
- The composite score renormalises over available dimensions, so a platform is
  not docked for a field it cannot return.
- **A post with no view count gets no score and is never rank-eligible.** 55 of
  the 100 score weight derives from views; scoring without them produced
  confident-looking numbers that outranked a measured 1.4M-view video.
- Claim-risk and replication-fit are judged on the **hook**, not the full
  description. Descriptions are mostly disclaimers and link lists, so scanning
  them rejected almost everything.
- Claim-risk rules are deliberately broad and word-order-independent. Requiring
  adjacency ("how to inject") produced false negatives on the two highest-risk
  videos in the set. On a compliance surface a false negative costs more than a
  false positive.
- `recon-structured.json` is the earlier **hand-collected** research, tagged
  `provenance: "hand_collected"` and never mixed into API-measured statistics.

---

## Civilian affiliate cohort (the scan target)

Target shape: an individual person posting their own peptide experience who
carries an affiliate link. Reference example @gretatrutide, 1,361 followers, bio
link `https://spartanbiolab.com/?ref=GRETA`.

Excluded by spec: companies and vendor-run accounts, clinics and med spas,
credentialed clinicians (MD/DO/RN/NP/PA/RD/PhD), coaches and program sellers.

### TikTok suppresses the compound names — this governs all discovery

Verified with a positive control through Apify `clockworks/tiktok-scraper`:

| query | videos returned |
|---|---|
| coffee | 12 |
| ozempic | 12 |
| peptides | 12 |
| glp1 journey | 12 |
| ratatouille weight loss | 12 |
| tirzepatide | 0 |
| **retatrutide** | **0** |

TikTok serves the approved brand name and the coded alias but returns an empty
set for the unapproved compounds. This is why hashtag pages are captcha-gated and
why only 2 of 152 originally-seeded TikTok posts were on topic.

**Never discover on the compound name.** Use the journey language and the coded
aliases. The cohort itself evades text matching the same way:
- `@alexisthepeptidegirl` bio: "R3ta is GLP-3Rț" (Romanian ț breaks the match)
- `@glpbabe` bio: "4mg ℛ𝒯 weekly" (Unicode mathematical script)
- recon doc also records "ratatouille", "r3ta", "GLP-3"

### Pipeline

```bash
node discover_tiktok.mjs      # crosswalk + @mentions + handle patterns
node enrich_civilians.mjs     # bio, bio link, followers -> classify + filter
node filter_candidates.mjs    # classify an Apify candidate list
node enrich_candidates.mjs    # resolve bio links incl. linktree/beacons one level down
```

Affiliate evidence counts if ANY of: bio-link query param (`?ref=`, `?aff=`),
referral subdomain or path (`refer.boltpharmacy.co.uk/w.pickering`), a vendor
domain behind a link aggregator, or a discount code stated in the bio.

Identity classification strips URLs from the bio first. A vendor domain in a bio
is what the person PROMOTES, not who they ARE — leaving it in made
`spartanbiolab.com` match a `labs?` rule and labelled @gretatrutide a company.

### Provider status (verified 2026-07-25)

- **ScrapeCreators: DEAD.** Two distinct keys both HTTP 402. A sweep of every
  file referencing scrapecreators found no funded key. No credits endpoint exists.
- **Apify: free plan exhausted**, $0.37 remaining. Scaling this needs a paid plan.
- **yt-dlp + the public TikTok/Instagram endpoints remain free** and are what the
  rest of this pipeline runs on.

---

## Affiliate-army playbook (ScrapeCreators lane)

Goal: find regular people already promoting peptides with an affiliate link, measure
what actually gets them traction, and turn it into a brief an army can execute.

```bash
CREDIT_BUDGET=40  node sc_discover.mjs       # keyword search -> handles     (1 cr/query)
CREDIT_BUDGET=400 node sc_enrich.mjs         # bio + bioLink + filter        (1 cr/handle)
CREDIT_BUDGET=80  node sc_posts.mjs          # posts for qualified only      (1 cr/creator)
node civilian_playbook.mjs                   # scoring + brief               (free)
node analyze.mjs                             # -> content-intel/intel-data.js
```

Total spend for the full run: **436 credits** (22 + 365 + 49). All cached, so a
re-run costs nothing for anything already fetched. Every script hard-caps on
`CREDIT_BUDGET` and refuses to exceed it.

### Endpoints that work

| endpoint | returns |
|---|---|
| `/v1/tiktok/search/keyword` | ~19-30 posts per query with author + statistics |
| `/v1/tiktok/profile` | `signature`, `bioLink{link,risk}`, `isOrganization`, statsV2 |
| `/v3/tiktok/profile/videos` | `aweme_list` with statistics, desc, duration, `cha_list` |

`/v1/tiktok/search/users` returns an empty `user_list`. `/v1/tiktok/search/hashtag`
503s. `/v1/tiktok/{search,hashtag}` and `/v2/tiktok/search/keyword` are 404.

### Filtering

`isOrganization` (TikTok's own flag) beats regex for company detection. Credential
matching must be substring, not `\b`-anchored. Link aggregators (linktr.ee,
beacons.ai, stan.store, allmylinks, komi.io, snipfeed, milkshake, hoo.be) are
crawled one level down — **29 of 49 qualified creators had their vendor found
inside the aggregator, not in the bio link itself**, so skipping that step loses
most of the cohort.

### Evidence bar

A rule only becomes a directive at **>=8 posts across >=3 creators**. Anything
thinner is published as a lead to test. Two rules were nearly shipped wrong:
- 78% of posts fell into `other` under the first hook taxonomy, making the ranking
  noise. Rebuilt around how civilians actually write (sw/cw/gw, regain defense,
  alias-tag-only, vendor-tagged).
- Median alone produced "avoid vendor-tagged posts", which the cohort's own top two
  breakouts contradict. Vendor-tagged has the lowest median (312 plays) AND the
  highest ceiling (4.99M). Report the variance, not one side of it.

---

## The cohort splits into two different businesses

Measured over 487 posts. Only **5 posts (1%)** contain "retatrutide" or a direct
variant. **39 use the coded vocabulary**, which is where the retatrutide talk
actually lives. The substitution set observed live:

| written | means |
|---|---|
| ratatouille, r3t4, retaa, reda | retatrutide |
| peppers, pepperz, peps | peptides |
| pins | injections |
| d0se | dose |
| b\|o | bio |
| GLP-ONE, gLp-one | GLP-1 |

Searching for the real word finds almost nothing. Searching the aliases finds the
cohort.

### Research-peptide lane — 13 creators, the one Biologix competes in

Ceiling is roughly **427k plays**. Accounts are small: 910 to 133k followers, most
under 13k. Vendors carry named referral links:
`ionpeptide.com?ref=cayla`, `peptrack.co/c/chrisriosss`, `staraminos.com`,
`pnwbiocompounds.com`, plus bio codes RICO10, ADKISSON, JACKIEC.
`@papi.peptide` (133k) runs a DM-gated source-broker pattern: "DM me SOURCE" —
never posts the vendor publicly.

### Compounded GLP-1 telehealth lane — 9 creators, a different business

Ceiling is **10.3M plays**. These promote licensed compounded-GLP-1 telehealth
(ShedRx, Gala GLP-1, Ellie MD, LifeRx, Orderly Meds, Zappy Health), not gray-market
research peptides.

**This distinction governs benchmarking.** The multi-million-play posts in the
cohort belong to the telehealth lane. A gray-market research-peptide affiliate's
realistic ceiling on this evidence is ~427k, not 5M. Do not set army targets off
the telehealth numbers.

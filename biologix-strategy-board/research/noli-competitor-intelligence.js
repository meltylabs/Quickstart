(function () {
  "use strict";

  const data = window.NOLI_COMPETITOR_INTELLIGENCE;
  const marketing = window.NOLI_MARKETING_WATCH || {};
  const marketingByDomain = marketing.byDomain || {};
  const root = document.getElementById("noli-competitor-intelligence");
  if (!data || !root) return;

  const stats = root.querySelector("[data-ci-stats]");
  const caseStudies = root.querySelector("[data-ci-cases]");
  const marketingRollup = root.querySelector("[data-ci-marketing-rollup]");
  const search = root.querySelector("[data-ci-search]");
  const filter = root.querySelector("[data-ci-filter]");
  const sort = root.querySelector("[data-ci-sort]");
  const resultCount = root.querySelector("[data-ci-count]");
  const list = root.querySelector("[data-ci-list]");
  const loadMore = root.querySelector("[data-ci-more]");
  const catalogShardBasePath =
    data.catalogShardBasePath || "./noli-competitor-catalogs";
  const catalogExportPath =
    data.catalogExportPath || "./noli-competitor-catalog-2026-07-27.csv";
  const catalogJsonPath =
    data.catalogJsonPath || "./noli-competitor-catalog-2026-07-27.json";
  const commercialExportPath =
    data.commercialExportPath || "./noli-competitor-intelligence-2026-07-27.csv";
  const marketingExportPath =
    marketing.exportPath || "./noli-marketing-watch-2026-07-28.csv";
  const marketingJsonPath =
    marketing.jsonPath || "./noli-marketing-watch-2026-07-28.json";
  const PAGE_SIZE = 12;
  let visibleCount = PAGE_SIZE;
  const catalogPromises = new Map();
  const catalogViews = new Map();

  const escapeHtml = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);

  const safeUrl = (value) => {
    if (!value) return null;
    try {
      const parsed = new URL(String(value), window.location.href);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
    } catch (_error) {
      return null;
    }
  };

  const link = (url, label) => {
    const safe = safeUrl(url);
    if (!safe) return "";
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  };

  const integer = (value) =>
    value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value))
      : "Unknown";

  const compact = (value) =>
    value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
      ? new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: Number(value) < 10_000 ? 1 : 0,
        }).format(Number(value))
      : "Unknown";

  const money = (value, currency = "USD", compactValue = false) => {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
      return "Unknown";
    }
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency === "MIXED" ? "USD" : currency || "USD",
        notation: compactValue ? "compact" : "standard",
        maximumFractionDigits: compactValue ? 1 : 2,
      }).format(Number(value));
    } catch (_error) {
      return `${currency || "USD"} ${Number(value).toFixed(2)}`;
    }
  };

  const percent = (value) =>
    value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
      ? `${Math.round(Number(value) * 100)}%`
      : "Unknown";
  const shortDate = (value) => {
    const source = /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
      ? `${value}T12:00:00Z`
      : value || "";
    const parsed = Date.parse(source);
    return Number.isFinite(parsed)
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(parsed)
      : "Unknown";
  };

  const rows = Object.entries(data.audits || {}).map(([domain, audit]) => ({
    domain,
    ...audit,
  }));

  function renderStats() {
    const values = [
      [data.stats.domainsInCommercialDataset, "competitor records"],
      [marketing.stats?.monitoredCompanies || marketing.stats?.companies || 0, "marketing monitors"],
      [data.stats.liveRefreshedCatalogs, "live price feeds"],
      [data.stats.normalizedCatalogOffers, "deduped offers"],
      [data.stats.retatrutideOffers, "Reta offers"],
      [data.stats.screenshotScoredDomains, "UI scores"],
    ];
    stats.innerHTML = values
      .map(([value, label]) => `<div><strong>${escapeHtml(integer(value))}</strong><span>${escapeHtml(label)}</span></div>`)
      .join("");

    const refreshed = root.querySelector("[data-ci-refreshed]");
    const capturedAt = Date.parse(data.capturedAt || "");
    if (refreshed && Number.isFinite(capturedAt)) {
      const priceTimestamp = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(capturedAt);
      const marketingCapturedAt = Date.parse(marketing.capturedAt || "");
      const marketingTimestamp = Number.isFinite(marketingCapturedAt)
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          }).format(marketingCapturedAt)
        : "not yet available";
      refreshed.textContent = `${integer(data.stats.liveRefreshedCatalogs)} live price feeds and ${integer(marketing.stats?.monitoredCompanies || marketing.stats?.companies || 0)} marketing monitors refresh every 6 hours. Price: ${priceTimestamp}. Marketing: ${marketingTimestamp}.`;
    }

    const coverageValues = [
      ["[data-ci-coverage-records]", `${integer(data.stats.domainsInCommercialDataset)} competitor commercial records`],
      ["[data-ci-coverage-offers]", `${integer(data.stats.normalizedCatalogOffers)} normalized catalog offers`],
      ["[data-ci-coverage-reta]", `${integer(data.stats.retatrutideOffers)} Retatrutide offers`],
    ];
    for (const [selector, value] of coverageValues) {
      const element = document.querySelector(selector);
      if (element) element.textContent = value;
    }
    for (const [originalPath, currentPath] of [
      ["./noli-competitor-catalog-2026-07-27.csv", catalogExportPath],
      ["./noli-competitor-catalog-2026-07-27.json", catalogJsonPath],
      ["./noli-competitor-intelligence-2026-07-27.csv", commercialExportPath],
      ["./noli-marketing-watch-2026-07-28.csv", marketingExportPath],
      ["./noli-marketing-watch-2026-07-28.json", marketingJsonPath],
    ]) {
      document.querySelectorAll(`a[href="${originalPath}"]`).forEach((anchor) => {
        anchor.href = currentPath;
      });
    }
  }

  function renderCases() {
    const northline = data.caseStudies?.["northlinelabs.org"];
    const biologix = data.caseStudies?.["biologixlabsresearch.com"];
    if (!northline || !biologix) return;

    const northlineCurrentGross = Math.round(
      Number(northline.commercial.currentMonthlyVisitsModel || 0) * 0.0179 * 190,
    );
    const privateSignal = biologix.commercial.caseStudy?.observedPrivateSignal || {};
    const publicFootprint = biologix.commercial.caseStudy?.publicFootprint || {};

    caseStudies.innerHTML = `
      <article>
        <span>Northline / public model</span>
        <strong>${escapeHtml(integer(northline.commercial.trailing30VisitsModel))} trailing visits · ${escapeHtml(integer(northline.commercial.currentMonthlyVisitsModel))} current pace</strong>
        <p>${escapeHtml(money(northline.commercial.gmvBase, "USD", true))} trailing base checkout model · ${escapeHtml(money(northlineCurrentGross, "USD", true))} current-pace model.</p>
        <small>Modeled gross checkout, not measured revenue or profit.</small>
      </article>
      <article>
        <span>Biologix / private screen</span>
        <strong>${escapeHtml(money(privateSignal.dailyGrossDisplayed))} · ${escapeHtml(integer(privateSignal.dailyOrdersDisplayed))} orders shown</strong>
        <p>${escapeHtml(money(privateSignal.displayedAov))} displayed AOV · ${escapeHtml(money(privateSignal.sustained30DayGrossIllustration, "USD", true))} only if that exact day repeated for 30 days.</p>
        <small>Strong private signal; not an audited settlement or public traffic measurement. Public scan: no verified Braden surname/title or official phone, and no exact-name forum discussion found. ${link(publicFootprint.contactSource, "Official email ↗")} ${link(publicFootprint.affiliateSource, "Affiliate claim ↗")}</small>
      </article>
    `;
  }

  function renderMarketingRollup() {
    if (!marketingRollup || !marketing.stats) return;
    const marketingRows = Object.values(marketingByDomain);
    const verifiedAds = marketingRows.flatMap((row) =>
      row.adMonitoring?.verifiedAds || []
    );
    const adsByPlatform = verifiedAds.reduce((counts, ad) => {
      const platform = ad.platform || "Other official source";
      counts[platform] = (counts[platform] || 0) + 1;
      return counts;
    }, {});
    const platformSummary = Object.entries(adsByPlatform)
      .map(([platform, count]) => {
        const platformAds = verifiedAds.filter((ad) =>
          (ad.platform || "Other official source") === platform
        );
        const capturedAt = Date.parse(marketing.capturedAt || "");
        const historical =
          Number.isFinite(capturedAt) &&
          platformAds.length > 0 &&
          platformAds.every((ad) => {
            const lastShown = Date.parse(ad.lastShown || "");
            return Number.isFinite(lastShown) && lastShown < capturedAt;
          });
        const region =
          platform === "Microsoft/Bing"
            ? " EEA"
            : platform === "Snap"
              ? " EU"
              : "";
        return `${integer(count)} ${historical ? "historical " : ""}${platform}${region}`;
      })
      .join(" · ");
    const snapCount = Number(adsByPlatform.Snap || 0);
    const sourceStates = marketingRows.flatMap((row) =>
      row.adMonitoring?.sources || []
    );
    const unavailableChecks = sourceStates.filter((source) =>
      ["source-error", "stale-preserved"].includes(source.status)
    ).length;
    const adSummary = [
      platformSummary
        ? `${platformSummary} exact-domain ad${verifiedAds.length === 1 ? "" : "s"} in this snapshot.`
        : "No exact-domain ads observed in the scoped official-source snapshot.",
      snapCount === 0
        ? "Snap: 0 exact-domain matches in this snapshot."
        : null,
      unavailableChecks
        ? `${integer(unavailableChecks)} source check${unavailableChecks === 1 ? "" : "s"} unavailable or retained from last-good evidence.`
        : null,
      "Official transparency records do not establish current U.S. campaigns, spend, CAC, or ROAS. Meta, Google, and TikTok remain direct review links.",
    ].filter(Boolean).join(" ");
    marketingRollup.innerHTML = `
      <article>
        <span>Partner + retention</span>
        <strong>${escapeHtml(integer(marketing.stats.withAffiliate))} affiliate · ${escapeHtml(integer(marketing.stats.withLifecycleSignal))} lifecycle · ${escapeHtml(integer(marketing.stats.withPublicContent))} content</strong>
        <p>These are observed routes, tools, or forms across ${escapeHtml(integer(marketing.stats.monitoredCompanies || marketing.stats.companies))} priority companies.</p>
      </article>
      <article>
        <span>Paid capability</span>
        <strong>${escapeHtml(integer(marketing.stats.withPaidSocialPixels))} paid-social pixel · ${escapeHtml(integer(marketing.stats.withGoogleAdsTag))} Google Ads tag</strong>
        <p>Installed measurement proves capability—not active campaigns, spend, CAC, ROAS, or traffic share.</p>
      </article>
      <article>
        <span>Ads actually verified</span>
        <strong>${escapeHtml(integer(marketing.stats.verifiedAdsObserved))} exact-domain ads · ${escapeHtml(integer(marketing.stats.companiesWithVerifiedAds))} companies</strong>
        <p>${escapeHtml(adSummary)}</p>
      </article>
    `;
  }

  function filteredRows() {
    const query = String(search.value || "").trim().toLowerCase();
    const mode = filter.value;
    const order = sort.value;
    const matched = rows.filter((row) => {
      const observedMarketing = marketingByDomain[row.domain];
      const searchable = [
        row.domain,
        row.commercial?.cohort,
        row.commercial?.marketScope,
        row.catalog?.coverage,
        row.catalog?.retaOffers?.map((offer) => `${offer.title} ${offer.options || ""}`).join(" "),
        row.design?.strongestLesson,
        row.design?.biggestFailure,
        row.design?.reasons?.join(" "),
        observedMarketing?.positioning?.title,
        observedMarketing?.positioning?.h1,
        observedMarketing?.promotions?.map((item) => item.text).join(" "),
        observedMarketing?.trackingStack?.join(" "),
        observedMarketing?.marketingTechnology?.join(" "),
        observedMarketing?.channelSignals?.map((item) =>
          `${item.channel} ${item.evidence}`
        ).join(" "),
        observedMarketing?.adMonitoring?.verifiedAds?.map((ad) =>
          `${ad.platform} ${ad.title || ""} ${ad.body || ""}`
        ).join(" "),
      ].join(" ").toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (mode === "traffic" && row.commercial?.trafficBasisVisitsModel == null) return false;
      if (mode === "main" && !row.commercial?.mainCompanyAddition) return false;
      if (mode === "catalog" && !/^complete_/i.test(row.catalog?.coverage || "")) return false;
      if (mode === "reta" && !Number(row.catalog?.retaVariantCount || 0)) return false;
      if (mode === "marketing" && !observedMarketing) return false;
      if (mode === "ui" && row.design?.overall == null) return false;
      return true;
    });

    matched.sort((left, right) => {
      if (order === "catalog") {
        return (right.catalog?.variantCount || 0) - (left.catalog?.variantCount || 0) ||
          left.domain.localeCompare(right.domain);
      }
      if (order === "gmv") {
        return (right.commercial?.gmvBase || -1) - (left.commercial?.gmvBase || -1) ||
          left.domain.localeCompare(right.domain);
      }
      if (order === "reta") {
        return (right.catalog?.retaVariantCount || 0) - (left.catalog?.retaVariantCount || 0) ||
          left.domain.localeCompare(right.domain);
      }
      if (order === "age") {
        return (right.commercial?.domainAgeDays || -1) - (left.commercial?.domainAgeDays || -1) ||
          left.domain.localeCompare(right.domain);
      }
      if (order === "ui") {
        return (right.design?.overall || -1) - (left.design?.overall || -1) ||
          left.domain.localeCompare(right.domain);
      }
      return (right.commercial?.trafficBasisVisitsModel || -1) -
        (left.commercial?.trafficBasisVisitsModel || -1) ||
        left.domain.localeCompare(right.domain);
    });
    return matched;
  }

  function retaOfferMarkup(row) {
    const offers = row.catalog?.retaOffers || [];
    if (!offers.length) return `<p class="ci-empty">No Reta offer captured in the anonymous public catalog.</p>`;
    return `
      <div class="ci-reta-list">
        ${offers.slice(0, 10).map((offer) => `
          <div>
            <span>${escapeHtml([offer.title, offer.options].filter(Boolean).join(" · "))}</span>
            <strong>${escapeHtml(money(offer.currentPrice, offer.currency))}</strong>
            ${offer.url ? link(offer.url, "Open ↗") : ""}
          </div>
        `).join("")}
      </div>
      ${offers.length > 10 ? `<small>${escapeHtml(integer(offers.length - 10))} more Reta variants are in the full catalog.</small>` : ""}
    `;
  }

  function modelEvidenceMarkup(row) {
    const commercial = row.commercial || {};
    const design = row.design || {};
    const panels = commercial.externalPanels || [];
    const panelMarkup = panels.length
      ? panels.map((panel) => {
          const label = `${panel.provider}: ${integer(panel.monthlyVisits)}/mo${panel.period ? ` (${panel.period})` : ""}`;
          return panel.sourceUrl ? link(panel.sourceUrl, label) : escapeHtml(label);
        }).join(" · ")
      : "No independent public panel captured.";
    const assumptions = [
      commercial.cvrLow || commercial.cvrBase || commercial.cvrHigh
        ? `CVR ${[commercial.cvrLow, commercial.cvrBase, commercial.cvrHigh].filter(Boolean).join(" / ")}`
        : null,
      commercial.aovLow != null || commercial.aovBase != null || commercial.aovHigh != null
        ? `AOV ${[commercial.aovLow, commercial.aovBase, commercial.aovHigh]
          .filter((value) => value != null)
          .map((value) => money(value))
          .join(" / ")}`
        : null,
      commercial.ordersBase != null ? `${integer(commercial.ordersBase)} base-case orders` : null,
    ].filter(Boolean).join(" · ") || "No checkout model.";
    const uiParts = [
      design.overall == null ? null : `${design.overall}/10 overall`,
      design.mobileUsability == null ? null : `${design.mobileUsability}/10 mobile`,
      design.accessStatus ? `Access: ${design.accessStatus}` : null,
      design.confidence ? `Confidence: ${design.confidence}` : null,
      design.strongestLesson ? `Lesson: ${design.strongestLesson}` : null,
      design.biggestFailure ? `Watch: ${design.biggestFailure}` : null,
      !design.strongestLesson && !design.biggestFailure && design.reasons?.length
        ? `Findings: ${design.reasons.slice(0, 2).join(" / ")}`
        : null,
    ].filter(Boolean);

    return `
      <details class="ci-method">
        <summary>Model assumptions and UI evidence</summary>
        <ul>
          <li><strong>Public traffic panels:</strong> ${panelMarkup}</li>
          <li><strong>Checkout scenario:</strong> ${escapeHtml(assumptions)}</li>
          <li><strong>UI review:</strong> ${escapeHtml(uiParts.join(" · ") || "Not scored.")} ${design.scoredUrl ? link(design.scoredUrl, "Scored page ↗") : ""}</li>
        </ul>
      </details>
    `;
  }

  const statusText = (value) =>
    String(value || "unknown")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());

  function marketingMarkup(row) {
    const observed = marketingByDomain[row.domain];
    if (!observed) return "";
    const mechanics = observed.mechanics || {};
    const channels = observed.channelSignals || [];
    const promotions = observed.promotions || [];
    const ads = observed.adMonitoring?.verifiedAds || [];
    const latestPost = observed.content?.latestPosts?.[0];
    const social = Object.entries(observed.social || {}).flatMap(
      ([network, urls]) => urls.map((url) => ({ network, url })),
    );
    const programs = [
      ["Affiliate", mechanics.affiliateStatus],
      ["Referral", mechanics.referralStatus],
      ["Loyalty", mechanics.loyaltyStatus],
      ["Email", mechanics.emailCaptureStatus],
      ["SMS", mechanics.smsCaptureStatus],
      ["Subscription", mechanics.subscriptionDetected ? "observed" : "not surfaced"],
    ];
    const sourceSummary = (observed.adMonitoring?.sources || []).map((source) => {
      const effectiveStatus = source.status === "stale-preserved"
        ? `${source.lastSuccessfulStatus || "last good"} retained`
        : statusText(source.status);
      return `${source.platform}: ${effectiveStatus}`;
    });
    const changes = observed.changesSincePrevious?.changed
      ? observed.changesSincePrevious.summary.slice(0, 4)
      : [];
    const adMetadata = (ad) => {
      const impressions = ad.impressionRange
        ? `${ad.impressionRange} EEA impressions`
        : ad.impressionsTotal !== null && ad.impressionsTotal !== undefined
          ? `${integer(ad.impressionsTotal)} EU impressions`
          : null;
      return [
        ad.status ? statusText(ad.status) : null,
        ad.creativeType || ad.adType || null,
        ad.callToAction ? `CTA ${statusText(ad.callToAction)}` : null,
        impressions,
      ].filter(Boolean).join(" · ");
    };

    return `
      <details class="ci-marketing">
        <summary>
          <span>Marketing observed in public sources</span>
          <small>${escapeHtml(integer(ads.length))} verified ad${ads.length === 1 ? "" : "s"} · ${escapeHtml(integer(channels.length))} channel signal${channels.length === 1 ? "" : "s"} · evidence ${escapeHtml(shortDate(observed.capturedAt))}${observed.status === "stale-preserved" ? " · last-good retained" : ""}</small>
        </summary>
        <div class="ci-marketing-body">
          <div class="ci-marketing-grid">
            <div>
              <span>Channels observed</span>
              <strong>${escapeHtml(channels.map((item) => item.channel).join(" · ") || "None surfaced in this scan")}</strong>
            </div>
            <div>
              <span>Tracking</span>
              <strong>${escapeHtml((observed.trackingStack || []).join(" · ") || "None surfaced")}</strong>
            </div>
            <div>
              <span>Marketing tools</span>
              <strong>${escapeHtml((observed.marketingTechnology || []).join(" · ") || "None surfaced")}</strong>
            </div>
            <div>
              <span>Programs / capture</span>
              <strong>${programs.map(([label, value]) =>
                `${escapeHtml(label)}: ${escapeHtml(statusText(value))}`
              ).join("<br>")}</strong>
            </div>
            <div>
              <span>Content / social</span>
              <strong>${latestPost
                ? `${escapeHtml(shortDate(latestPost.publishedAt))} · ${escapeHtml(latestPost.title || "Latest post")} ${latestPost.url ? link(latestPost.url, "Open ↗") : ""}`
                : observed.content?.publicContentHubDetected
                  ? "Public content hub surfaced"
                  : "No content hub surfaced"}${social.length
                    ? `<br>${social.slice(0, 4).map((item) => link(item.url, `${item.network} ↗`)).join(" · ")}`
                    : ""}</strong>
            </div>
            <div>
              <span>Official ad-source scope</span>
              <strong>${escapeHtml(sourceSummary.join(" · ") || "Not checked")}</strong>
            </div>
          </div>
          ${promotions.length ? `
            <div class="ci-marketing-section">
              <strong>Offers and hooks now visible</strong>
              <ul>${promotions.slice(0, 4).map((item) =>
                `<li>${escapeHtml(item.text)} ${link(item.evidenceUrl, "Evidence ↗")}</li>`
              ).join("")}</ul>
            </div>
          ` : ""}
          ${ads.length ? `
            <div class="ci-marketing-section">
              <strong>Verified exact-domain ads observed</strong>
              <div class="ci-ad-list">${ads.slice(0, 6).map((ad) => `
                <article>
                  <span>${escapeHtml(ad.platform)} · ${escapeHtml([shortDate(ad.firstShown), shortDate(ad.lastShown)].join("–"))}${adMetadata(ad) ? ` · ${escapeHtml(adMetadata(ad))}` : ""}</span>
                  <strong>${escapeHtml(ad.title || "Untitled public ad")}</strong>
                  ${ad.body ? `<p>${escapeHtml(ad.body)}</p>` : ""}
                  <small>${link(ad.destinationUrl, "Landing page ↗")} ${link(ad.sourceUrl, "Official record ↗")}</small>
                </article>
              `).join("")}</div>
            </div>
          ` : ""}
          ${changes.length ? `<p class="ci-change"><strong>Changed since prior successful snapshot:</strong> ${escapeHtml(changes.join(" · "))}</p>` : ""}
          <div class="ci-marketing-links">
            ${(observed.adLibraries || []).slice(0, 6).map((item) =>
              link(item.url, `${item.network} ↗`)
            ).join("")}
            ${marketing.jsonPath ? link(marketing.jsonPath, "Full evidence JSON ↗") : ""}
          </div>
          <p class="ci-boundary"><strong>Boundary:</strong> ${escapeHtml(observed.caveat)} Empty ad-source results mean only “not observed” in the named source, region, period, and alias set. Competitor ad copy is a claim, not verified medical evidence.</p>
        </div>
      </details>
    `;
  }

  function rowMarkup(row) {
    const commercial = row.commercial || {};
    const catalog = row.catalog || {};
    const design = row.design || {};
    const visits = commercial.trafficBasisVisitsModel;
    const gmv = commercial.gmvBase;
    const coverageLabel = /^complete_/i.test(catalog.coverage || "")
      ? "Full public catalog"
      : /^partial_/i.test(catalog.coverage || "")
        ? "Partial public catalog"
        : "Catalog unknown/gated";
    const freshnessLabel = ({
      live: "Live feed",
      "live-partial": "Live partial feed",
      static: "Static page capture",
      archived: "Archived capture",
      unresolved: "Unresolved / gated",
    })[catalog.refreshMode] || "Freshness unknown";
    const companyLabel = commercial.mainCompanyAddition
      ? `New main-company addition · ${freshnessLabel} · ${coverageLabel}`
      : `${freshnessLabel} · ${coverageLabel}`;

    return `
      <details class="ci-company" data-domain="${escapeHtml(row.domain)}">
        <summary>
          <span>
            <strong>${escapeHtml(row.domain)}</strong>
            <small>${escapeHtml(companyLabel)}</small>
          </span>
          <span><b>${escapeHtml(compact(visits))}</b><small>modeled visits</small></span>
          <span><b>${escapeHtml(integer(catalog.variantCount))}</b><small>offers</small></span>
          <span><b>${escapeHtml(design.overall == null ? "—" : `${design.overall}/10`)}</b><small>UI</small></span>
        </summary>
        <div class="ci-company-body">
          <div class="ci-company-metrics">
            <div><span>Age</span><strong>${commercial.domainCreated ? `${escapeHtml(commercial.domainCreated)} · ${escapeHtml(integer(commercial.domainAgeDays))} days` : "Unknown"}</strong></div>
            <div><span>Traffic</span><strong>${visits == null ? "No public model" : `${escapeHtml(integer(visits))}/mo · ${escapeHtml(commercial.trafficConfidence)}`}</strong></div>
            <div><span>Gross checkout</span><strong>${gmv == null ? "Not modeled" : `${escapeHtml(money(commercial.gmvLow, "USD", true))}–${escapeHtml(money(commercial.gmvHigh, "USD", true))}`}</strong></div>
            <div><span>Catalog</span><strong>${escapeHtml(integer(catalog.productCount))} products · ${escapeHtml(integer(catalog.variantCount))} offers</strong></div>
            <div><span>Catalog captured</span><strong>${escapeHtml(shortDate(catalog.capturedAt))} · ${escapeHtml(freshnessLabel)}</strong></div>
            <div><span>Price</span><strong>${catalog.priceMedian == null ? "Unknown" : `${escapeHtml(money(catalog.priceMin, catalog.currency))}–${escapeHtml(money(catalog.priceMax, catalog.currency))} · median ${escapeHtml(money(catalog.priceMedian, catalog.currency))}`}</strong></div>
            <div><span>Reta</span><strong>${escapeHtml(integer(catalog.retaProductCount))} products · ${escapeHtml(integer(catalog.retaVariantCount))} offers</strong></div>
            <div><span>Public stock</span><strong>${escapeHtml(integer(catalog.visibleStockRecords))} binary records · ${escapeHtml(percent(catalog.visibleInStockRate))} shown in stock</strong></div>
            <div><span>Exact quantity</span><strong>${escapeHtml(integer(catalog.exactQuantityRecords))} positive public fields</strong></div>
          </div>
          <div class="ci-company-links">
            ${link(commercial.storefrontUrl, "Website ↗")}
            ${link(commercial.domainAgeSource, "Domain age ↗")}
            ${link(commercial.rankSource, "Rank history ↗")}
          </div>
          ${modelEvidenceMarkup(row)}
          ${marketingMarkup(row)}
          <details class="ci-reta">
            <summary>Reta products and prices</summary>
            ${retaOfferMarkup(row)}
          </details>
          <div class="ci-full-catalog">
            <button type="button" data-ci-catalog="${escapeHtml(row.domain)}">Load full catalog</button>
            ${link(catalogExportPath, "Open master CSV")}
            <div data-ci-catalog-target="${escapeHtml(row.domain)}" aria-live="polite"></div>
          </div>
          <p class="ci-boundary"><strong>Boundary:</strong> ${escapeHtml(commercial.caveat)} ${escapeHtml(catalog.caveat)}</p>
        </div>
      </details>
    `;
  }

  function render() {
    const matched = filteredRows();
    const visible = matched.slice(0, visibleCount);
    resultCount.textContent = `${integer(matched.length)} ${matched.length === 1 ? "company" : "companies"}`;
    list.innerHTML = visible.length
      ? visible.map(rowMarkup).join("")
      : `<p class="ci-empty">No companies match those filters.</p>`;
    loadMore.hidden = visible.length >= matched.length;
    loadMore.textContent = `Show ${Math.min(PAGE_SIZE, matched.length - visible.length)} more`;
  }

  async function getCatalogRows(domain) {
    if (!catalogPromises.has(domain)) {
      const safeDomain = encodeURIComponent(domain);
      const shardUrl = `${catalogShardBasePath.replace(/\/$/, "")}/${safeDomain}.json`;
      const promise = fetch(shardUrl, {
        credentials: "same-origin",
      }).then((response) => {
        if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
        return response.json();
      }).then((payload) => payload.offers || []).catch((error) => {
        catalogPromises.delete(domain);
        throw error;
      });
      catalogPromises.set(domain, promise);
    }
    return catalogPromises.get(domain);
  }

  function renderCatalogRows(domain, target, allRows) {
    const state = catalogViews.get(domain) || { limit: 50, query: "" };
    catalogViews.set(domain, state);
    const query = state.query.toLowerCase();
    const matched = allRows.filter((row) =>
      !query ||
      [
        row.productTitle,
        row.options,
        row.category,
        row.publicSkuId,
      ].join(" ").toLowerCase().includes(query)
    );
    const visible = matched.slice(0, state.limit);
    target.innerHTML = `
      <div class="ci-catalog-controls">
        <label>
          <span>Search this catalog</span>
          <input type="search" value="${escapeHtml(state.query)}" data-ci-catalog-search="${escapeHtml(domain)}" placeholder="Product, strength, SKU">
        </label>
        <small>${escapeHtml(integer(matched.length))} matching offers</small>
      </div>
      <div class="ci-catalog-table-wrap">
        <table class="ci-catalog-table">
          <thead><tr><th>Product</th><th>Option</th><th>Price</th><th>Stock</th><th>Exact qty</th><th>Source</th></tr></thead>
          <tbody>
            ${visible.map((row) => `
              <tr>
                <td>${escapeHtml(row.productTitle)}</td>
                <td>${escapeHtml(row.options || "—")}</td>
                <td>${escapeHtml(money(row.currentPrice, row.currency))}</td>
                <td>${escapeHtml(row.stockStatus || "unknown")}</td>
                <td>${escapeHtml(row.exactPublicQuantity == null ? "—" : integer(row.exactPublicQuantity))}</td>
                <td>${row.canonicalUrl ? link(row.canonicalUrl, "PDP ↗") : row.sourceUrl ? link(row.sourceUrl, "Evidence ↗") : "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      ${visible.length < matched.length
        ? `<button type="button" class="ci-catalog-more" data-ci-catalog-more="${escapeHtml(domain)}">Show ${escapeHtml(integer(Math.min(50, matched.length - visible.length)))} more</button>`
        : ""}
    `;
  }

  root.addEventListener("click", async (event) => {
    const catalogButton = event.target.closest("[data-ci-catalog]");
    if (catalogButton) {
      const domain = catalogButton.dataset.ciCatalog;
      const target = root.querySelector(`[data-ci-catalog-target="${CSS.escape(domain)}"]`);
      if (!target) return;
      catalogButton.disabled = true;
      catalogButton.textContent = "Loading catalog…";
      try {
        const offers = await getCatalogRows(domain);
        renderCatalogRows(domain, target, offers);
        catalogButton.hidden = true;
      } catch (error) {
        target.innerHTML = `<p class="ci-empty">The inline catalog could not load. ${link(catalogExportPath, "Open the master CSV instead.")}</p>`;
        catalogButton.disabled = false;
        catalogButton.textContent = "Retry full catalog";
      }
      return;
    }

    const moreButton = event.target.closest("[data-ci-catalog-more]");
    if (moreButton) {
      const domain = moreButton.dataset.ciCatalogMore;
      const state = catalogViews.get(domain) || { limit: 50, query: "" };
      state.limit += 50;
      catalogViews.set(domain, state);
      const offers = await getCatalogRows(domain);
      const target = root.querySelector(`[data-ci-catalog-target="${CSS.escape(domain)}"]`);
      if (target) renderCatalogRows(domain, target, offers);
    }
  });

  root.addEventListener("input", async (event) => {
    const catalogSearch = event.target.closest("[data-ci-catalog-search]");
    if (!catalogSearch) return;
    const domain = catalogSearch.dataset.ciCatalogSearch;
    const state = catalogViews.get(domain) || { limit: 50, query: "" };
    state.query = catalogSearch.value;
    state.limit = 50;
    catalogViews.set(domain, state);
    const offers = await getCatalogRows(domain);
    const target = root.querySelector(`[data-ci-catalog-target="${CSS.escape(domain)}"]`);
    if (target) renderCatalogRows(domain, target, offers);
    requestAnimationFrame(() => {
      const replacement = root.querySelector(`[data-ci-catalog-search="${CSS.escape(domain)}"]`);
      replacement?.focus();
      replacement?.setSelectionRange(replacement.value.length, replacement.value.length);
    });
  });

  [search, filter, sort].forEach((control) => {
    control.addEventListener(control === search ? "input" : "change", () => {
      visibleCount = PAGE_SIZE;
      render();
    });
  });

  loadMore.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    render();
  });

  renderStats();
  renderCases();
  renderMarketingRollup();
  render();
})();

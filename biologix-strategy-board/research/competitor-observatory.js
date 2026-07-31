(function () {
  "use strict";

  const ALLOWED_STATES = new Set(["Verified", "Observed", "Estimated", "Unknown"]);
  const EXPECTED_DOMAINS = [
    "biologixlabsresearch.com",
    "northlinelabs.org",
    "bluumpeptides.com",
    "spartalabs.net",
    "royal-peptides.com",
    "northwestpeptides.com",
    "lifelinkresearch.com",
    "adaptpeptides.com",
    "geneticpeptide.com",
    "onyxbiolabs.com",
    "umbrellalabs.is",
    "riptidewellness.com",
    "rivnpeptides.com",
    "nurevpeptides.com",
    "orionpeptide.com",
    "researchchemhq.co",
    "polarispeptides.com",
    "peptide.partners",
    "skyepeptides.com",
    "simplepeptide.com",
    "myoasislabs.com",
    "peptalabs.com",
    "peptidehackers.com",
    "greatestpeptides.com",
    "peptira.com"
  ];
  const DEFAULT_API_URL = "https://biologix-public-intel.vercel.app/api/public/observatory";
  const INITIAL_LIMIT = 10;
  const LIVE_TIMEOUT_MS = 4500;
  const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

  const elements = {
    metrics: document.getElementById("observatory-metrics"),
    changeFeed: document.getElementById("change-feed"),
    companyList: document.getElementById("company-list"),
    resultCount: document.getElementById("company-result-count"),
    showAll: document.getElementById("show-all-companies"),
    method: document.getElementById("methodology-grid"),
    search: document.getElementById("company-search"),
    evidence: document.getElementById("evidence-filter"),
    signal: document.getElementById("signal-filter"),
    sort: document.getElementById("company-sort"),
    reset: document.getElementById("reset-controls"),
    freshnessHeading: document.getElementById("freshness-heading"),
    freshnessDetail: document.getElementById("freshness-detail"),
    freshnessPill: document.getElementById("freshness-pill")
  };

  const controls = {
    q: "",
    evidence: "all",
    signal: "all",
    sort: "priority",
    showAll: false
  };

  let activeData = window.NOLI_COMPETITOR_OBSERVATORY;
  let sourceMode = "static";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/gu, "&amp;")
      .replace(/</gu, "&lt;")
      .replace(/>/gu, "&gt;")
      .replace(/"/gu, "&quot;")
      .replace(/'/gu, "&#039;");
  }

  function limitedText(value, fallback, maxLength) {
    if (typeof value !== "string") {
      return fallback;
    }
    const clean = value.trim();
    return clean ? clean.slice(0, maxLength || 400) : fallback;
  }

  function finiteNumber(value, fallback) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function normalizeState(value, fallback) {
    return ALLOWED_STATES.has(value) ? value : fallback;
  }

  function safeStringList(value, fallback) {
    if (!Array.isArray(value)) {
      return fallback;
    }
    return [...new Set(value
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim().slice(0, 120)))]
      .slice(0, 30);
  }

  function safeUrl(value) {
    if (typeof value !== "string" || value.length > 1200) {
      return null;
    }
    try {
      const parsed = new URL(value, window.location.href);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
    } catch (_error) {
      return null;
    }
  }

  function externalLink(url, label, className) {
    const href = safeUrl(url);
    if (!href) {
      return "";
    }
    return `<a${className ? ` class="${escapeHtml(className)}"` : ""} href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }

  function stateBadge(state) {
    const normalized = normalizeState(state, "Unknown");
    return `<span class="state state-${normalized.toLowerCase()}">${normalized}</span>`;
  }

  function formatInteger(value) {
    return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "Unknown";
  }

  function formatCompact(value) {
    if (!Number.isFinite(value)) {
      return "Unknown";
    }
    return new Intl.NumberFormat("en-US", {
      notation: value >= 1000 ? "compact" : "standard",
      maximumFractionDigits: 1
    }).format(value);
  }

  function formatMoney(value, compact) {
    if (!Number.isFinite(value)) {
      return "Unknown";
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: compact && value >= 1000 ? "compact" : "standard",
      maximumFractionDigits: compact || Number.isInteger(value) ? 0 : 2
    }).format(value);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Date unknown";
    }
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(date);
  }

  function formatDomainAge(value) {
    const start = new Date(value);
    if (Number.isNaN(start.getTime())) {
      return "Unknown";
    }
    const months = Math.max(0, Math.floor((Date.now() - start.getTime()) / 2629800000));
    if (months < 12) {
      return `${months} mo`;
    }
    const years = Math.floor(months / 12);
    const remainder = months % 12;
    return `${years}y${remainder ? ` ${remainder}mo` : ""}`;
  }

  function validateDataset(data) {
    if (!data || !Array.isArray(data.companies) || data.companies.length !== EXPECTED_DOMAINS.length) {
      return false;
    }
    const domains = data.companies.map((company) => company?.domain);
    if (new Set(domains).size !== EXPECTED_DOMAINS.length) {
      return false;
    }
    if (!EXPECTED_DOMAINS.every((domain) => domains.includes(domain))) {
      return false;
    }
    const stack = [data.companies, data.changes || []];
    while (stack.length) {
      const current = stack.pop();
      if (Array.isArray(current)) {
        stack.push(...current);
      } else if (current && typeof current === "object") {
        for (const [key, value] of Object.entries(current)) {
          if (key === "state" && !ALLOWED_STATES.has(value)) {
            return false;
          }
          if (value && typeof value === "object") {
            stack.push(value);
          }
        }
      }
    }
    return true;
  }

  function sanitizeHistory(value, fallback) {
    if (!Array.isArray(value)) {
      return fallback;
    }
    const rows = value.slice(0, 40).map((row) => ({
      observedAt: limitedText(row?.observedAt, "", 60),
      state: normalizeState(row?.state, "Unknown"),
      type: limitedText(row?.type, "Signal", 50),
      text: limitedText(row?.text, "No detail retained.", 500)
    }));
    return rows.length ? rows : fallback;
  }

  function sanitizeEvidence(value, fallback) {
    if (!Array.isArray(value)) {
      return fallback;
    }
    const rows = value.slice(0, 30).map((row) => ({
      label: limitedText(row?.label, "Evidence", 100),
      url: safeUrl(row?.url) || "",
      state: normalizeState(row?.state, "Unknown")
    }));
    return rows.length ? rows : fallback;
  }

  function mergeCompany(base, live) {
    const reta = live?.reta || {};
    const traffic = live?.traffic || {};
    const checkout = live?.checkout || {};
    const marketing = live?.marketing || {};
    const platform = live?.platform || {};
    const catalog = live?.catalog || {};
    const ui = live?.ui || {};
    const domainCreated = live?.domainCreated || {};
    const domainCreatedState = normalizeState(domainCreated.state, "Unknown");
    const platformState = normalizeState(platform.state, "Unknown");
    const catalogState = normalizeState(catalog.state, "Unknown");
    const retaState = normalizeState(reta.state, "Unknown");
    const trafficState = normalizeState(traffic.state, "Unknown");
    const uiState = normalizeState(ui.state, "Unknown");
    const checkoutState = normalizeState(checkout.state, "Unknown");
    const marketingState = normalizeState(marketing.state, "Unknown");

    return {
      ...base,
      baselineAt: limitedText(live?.baselineAt, base.baselineAt, 60),
      domainCreated: domainCreatedState === "Unknown" ? base.domainCreated : {
        value: limitedText(domainCreated.value, base.domainCreated.value, 40),
        state: domainCreatedState
      },
      platform: platformState === "Unknown" ? base.platform : {
        value: limitedText(platform.value, base.platform.value, 80),
        state: platformState
      },
      catalog: catalogState === "Unknown" ? base.catalog : {
        productCount: finiteNumber(catalog.productCount, base.catalog.productCount),
        state: catalogState
      },
      reta: retaState === "Unknown" ? base.reta : {
        variantCount: finiteNumber(reta.variantCount, base.reta.variantCount),
        minimumPrice: finiteNumber(reta.minimumPrice, base.reta.minimumPrice),
        maximumPrice: finiteNumber(reta.maximumPrice, base.reta.maximumPrice),
        inStockOffers: finiteNumber(reta.inStockOffers, base.reta.inStockOffers),
        totalOffers: finiteNumber(reta.totalOffers, base.reta.totalOffers),
        currency: "USD",
        state: retaState
      },
      traffic: trafficState === "Unknown" ? base.traffic : {
        monthlyVisits: finiteNumber(traffic.monthlyVisits, base.traffic.monthlyVisits),
        gmvLow: finiteNumber(traffic.gmvLow, base.traffic.gmvLow),
        gmvBase: finiteNumber(traffic.gmvBase, base.traffic.gmvBase),
        gmvHigh: finiteNumber(traffic.gmvHigh, base.traffic.gmvHigh),
        state: trafficState,
        method: limitedText(traffic.method, base.traffic.method, 600)
      },
      ui: uiState === "Unknown" ? base.ui : {
        overall: finiteNumber(ui.overall, base.ui.overall),
        mobile: finiteNumber(ui.mobile, base.ui.mobile),
        state: uiState
      },
      checkout: checkoutState === "Unknown" ? base.checkout : {
        signals: safeStringList(checkout.signals, base.checkout.signals),
        state: checkoutState,
        boundary: limitedText(checkout.boundary, base.checkout.boundary, 600)
      },
      marketing: marketingState === "Unknown" ? base.marketing : {
        signals: safeStringList(marketing.signals, base.marketing.signals),
        state: marketingState
      },
      history: sanitizeHistory(
        [...(Array.isArray(live?.history) ? live.history : []), ...base.history],
        base.history
      ),
      evidence: sanitizeEvidence(
        [...(Array.isArray(live?.evidence) ? live.evidence : []), ...base.evidence],
        base.evidence
      )
    };
  }

  function sanitizeChanges(value, companies, fallback) {
    if (!Array.isArray(value)) {
      return fallback;
    }
    const byDomain = new Map(companies.map((company) => [company.domain, company]));
    const rows = value.slice(0, 30).flatMap((change, index) => {
      const company = byDomain.get(change?.domain);
      if (!company) {
        return [];
      }
      return [{
        id: limitedText(change.id, `live-change-${index + 1}`, 160),
        companyId: company.id,
        company: company.name,
        domain: company.domain,
        observedAt: limitedText(change.observedAt, "", 60),
        type: limitedText(change.type, "Signal", 60),
        state: normalizeState(change.state, "Unknown"),
        title: limitedText(change.title, "Public signal updated", 180),
        detail: limitedText(change.detail, "No detail retained.", 700),
        sourceUrl: safeUrl(change.sourceUrl) || company.url
      }];
    });
    return rows.length ? rows : fallback;
  }

  function normalizeLivePayload(payload) {
    const candidate = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    if (!candidate || !Array.isArray(candidate.companies) || candidate.companies.length !== EXPECTED_DOMAINS.length) {
      throw new Error("Invalid live cohort");
    }
    const domains = candidate.companies.map((company) => company?.domain);
    if (new Set(domains).size !== EXPECTED_DOMAINS.length || !EXPECTED_DOMAINS.every((domain) => domains.includes(domain))) {
      throw new Error("Live cohort mismatch");
    }

    const baselineByDomain = new Map(activeData.companies.map((company) => [company.domain, company]));
    const liveByDomain = new Map(candidate.companies.map((company) => [company.domain, company]));
    const companies = EXPECTED_DOMAINS.map((domain) => mergeCompany(baselineByDomain.get(domain), liveByDomain.get(domain)));
    return {
      ...activeData,
      generatedAt: limitedText(candidate.generatedAt, activeData.generatedAt, 60),
      capturedAt: limitedText(candidate.capturedAt || candidate.asOf, activeData.capturedAt, 60),
      companies,
      changes: sanitizeChanges(candidate.changes, companies, activeData.changes),
      methodology: {
        ...activeData.methodology,
        ...(candidate.methodology && typeof candidate.methodology === "object"
          ? Object.fromEntries(Object.entries(candidate.methodology).map(([key, value]) => [
              limitedText(key, "method", 60),
              limitedText(value, activeData.methodology[key] || "", 800)
            ]))
          : {})
      }
    };
  }

  function renderMetrics() {
    const companies = activeData.companies;
    const metrics = [
      ["Watchlist", companies.length, "fixed companies"],
      ["Reta listings", companies.filter((company) => company.reta.state === "Observed" && company.reta.variantCount > 0).length, "public signals"],
      ["Traffic", companies.filter((company) => company.traffic.state === "Estimated" && Number.isFinite(company.traffic.monthlyVisits)).length, "modeled scenarios"],
      ["Checkout", companies.filter((company) => company.checkout.state === "Observed" && company.checkout.signals.length).length, "public signals"]
    ];
    elements.metrics.innerHTML = metrics.map(([label, value, note]) => `
      <article>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(note)}</small>
      </article>
    `).join("");
  }

  function renderChanges() {
    const changes = Array.isArray(activeData.changes) ? activeData.changes.slice(0, 10) : [];
    if (!changes.length) {
      elements.changeFeed.innerHTML = '<p class="empty-state">No defensible change records are available yet.</p>';
      return;
    }
    elements.changeFeed.innerHTML = changes.map((change) => {
      const source = externalLink(change.sourceUrl, "Open evidence", "text-link");
      return `
        <article class="change-card">
          <div class="change-meta">${escapeHtml(change.company)} · ${escapeHtml(change.type)} · ${escapeHtml(formatDate(change.observedAt))}</div>
          ${stateBadge(change.state)}
          <h3>${escapeHtml(change.title)}</h3>
          <p>${escapeHtml(change.detail)}</p>
          <div class="company-actions">
            <a class="text-link" href="#${escapeHtml(change.companyId)}">Open company</a>
            ${source}
          </div>
        </article>
      `;
    }).join("");
  }

  function companyStates(company) {
    return [
      company.domainCreated.state,
      company.platform.state,
      company.catalog.state,
      company.reta.state,
      company.traffic.state,
      company.ui.state,
      company.checkout.state,
      company.marketing.state
    ];
  }

  function hasSignal(company, signal) {
    if (signal === "reta") {
      return company.reta.state === "Observed" && company.reta.variantCount > 0;
    }
    if (signal === "checkout") {
      return company.checkout.state === "Observed" && company.checkout.signals.length > 0;
    }
    if (signal === "traffic") {
      return company.traffic.state === "Estimated" && Number.isFinite(company.traffic.monthlyVisits);
    }
    if (signal === "ui") {
      return company.ui.state === "Observed" && company.ui.overall >= 8;
    }
    if (signal === "unknown") {
      return companyStates(company).includes("Unknown");
    }
    return true;
  }

  function filteredCompanies() {
    const query = controls.q.trim().toLowerCase();
    const rows = activeData.companies.filter((company) => {
      const haystack = [
        company.name,
        company.domain,
        company.platform.value,
        ...company.checkout.signals,
        ...company.marketing.signals
      ].filter(Boolean).join(" ").toLowerCase();
      return (!query || haystack.includes(query))
        && (controls.evidence === "all" || companyStates(company).includes(controls.evidence))
        && hasSignal(company, controls.signal);
    });

    rows.sort((left, right) => {
      if (controls.sort === "name") {
        return left.name.localeCompare(right.name);
      }
      if (controls.sort === "traffic") {
        return (right.traffic.monthlyVisits ?? -1) - (left.traffic.monthlyVisits ?? -1);
      }
      if (controls.sort === "ui") {
        return (right.ui.overall ?? -1) - (left.ui.overall ?? -1);
      }
      if (controls.sort === "reta") {
        return (right.reta.variantCount ?? -1) - (left.reta.variantCount ?? -1);
      }
      return left.priority - right.priority;
    });
    return rows;
  }

  function priceRange(company) {
    if (company.reta.state === "Unknown" || !Number.isFinite(company.reta.minimumPrice)) {
      return "Unknown";
    }
    if (company.reta.minimumPrice === company.reta.maximumPrice) {
      return formatMoney(company.reta.minimumPrice, false);
    }
    return `${formatMoney(company.reta.minimumPrice, false)}–${formatMoney(company.reta.maximumPrice, false)}`;
  }

  function gmvRange(company) {
    if (company.traffic.state === "Unknown" || !Number.isFinite(company.traffic.gmvLow)) {
      return "Unknown";
    }
    return `${formatMoney(company.traffic.gmvLow, true)}–${formatMoney(company.traffic.gmvHigh, true)}`;
  }

  function chips(values) {
    if (!values?.length) {
      return '<span class="chip">Unknown</span>';
    }
    return values.map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join("");
  }

  function renderEvidence(company) {
    if (!company.evidence?.length) {
      return "<li>Unknown. No retained public evidence link.</li>";
    }
    return company.evidence.map((item) => {
      const link = externalLink(item.url, item.label);
      return `<li>${stateBadge(item.state)} ${link || escapeHtml(item.label)}</li>`;
    }).join("");
  }

  function renderHistory(company) {
    if (!company.history?.length) {
      return "<li>Unknown. No prior retained observations.</li>";
    }
    return company.history.map((item) => `
      <li>
        <strong>${escapeHtml(item.type)} · ${escapeHtml(formatDate(item.observedAt))}</strong><br>
        ${stateBadge(item.state)} ${escapeHtml(item.text)}
      </li>
    `).join("");
  }

  function renderCompany(company) {
    const storefront = externalLink(company.url, "Open public storefront", "text-link");
    const checkoutCount = company.checkout.signals.length
      ? `${company.checkout.signals.length} signal${company.checkout.signals.length === 1 ? "" : "s"}`
      : "Unknown";
    const uiScore = Number.isFinite(company.ui.overall) ? `${company.ui.overall}/10` : "Unknown";
    const stock = Number.isFinite(company.reta.inStockOffers)
      ? `${formatInteger(company.reta.inStockOffers)} / ${formatInteger(company.reta.totalOffers)}`
      : "Unknown";

    return `
      <details class="company-card" id="${escapeHtml(company.id)}">
        <summary class="company-summary">
          <div class="company-identity">
            <span class="company-rank">${String(company.priority).padStart(2, "0")}</span>
            <div>
              <h3>${escapeHtml(company.name)}</h3>
              <p>${escapeHtml(company.domain)}</p>
            </div>
          </div>
          <div class="company-preview" aria-label="Company summary metrics">
            <span>Reta<strong>${escapeHtml(priceRange(company))}</strong></span>
            <span>Traffic<strong>${escapeHtml(formatCompact(company.traffic.monthlyVisits))}</strong></span>
            <span>UI<strong>${escapeHtml(uiScore)}</strong></span>
            <span>Checkout<strong>${escapeHtml(checkoutCount)}</strong></span>
          </div>
          <span class="summary-arrow" aria-hidden="true"></span>
        </summary>
        <div class="company-body">
          <div class="company-body-grid">
            <section class="detail-block">
              <span class="detail-label">Identity + catalog</span>
              <h4>Baseline facts</h4>
              <div class="facts">
                <div class="fact">
                  <span>Domain created</span>
                  <strong>${escapeHtml(formatDate(company.domainCreated.value))} · ${escapeHtml(formatDomainAge(company.domainCreated.value))}</strong>
                  ${stateBadge(company.domainCreated.state)}
                </div>
                <div class="fact">
                  <span>Platform</span>
                  <strong>${escapeHtml(company.platform.value || "Unknown")}</strong>
                  ${stateBadge(company.platform.state)}
                </div>
                <div class="fact">
                  <span>Catalog</span>
                  <strong>${Number.isFinite(company.catalog.productCount) ? `${formatInteger(company.catalog.productCount)} products` : "Unknown"}</strong>
                  ${stateBadge(company.catalog.state)}
                </div>
                <div class="fact">
                  <span>Reta stock cues</span>
                  <strong>${escapeHtml(stock)}</strong>
                  ${stateBadge(company.reta.state)}
                </div>
              </div>
            </section>

            <section class="detail-block">
              <span class="detail-label">Pricing + demand</span>
              <h4>Public and modeled signals</h4>
              <div class="facts">
                <div class="fact">
                  <span>Reta offers</span>
                  <strong>${Number.isFinite(company.reta.variantCount) ? `${formatInteger(company.reta.variantCount)} · ${priceRange(company)}` : "Unknown"}</strong>
                  ${stateBadge(company.reta.state)}
                </div>
                <div class="fact">
                  <span>Monthly visits</span>
                  <strong>${escapeHtml(formatInteger(company.traffic.monthlyVisits))}</strong>
                  ${stateBadge(company.traffic.state)}
                </div>
                <div class="fact">
                  <span>GMV scenario</span>
                  <strong>${escapeHtml(gmvRange(company))}</strong>
                  ${stateBadge(company.traffic.state)}
                </div>
                <div class="fact">
                  <span>UI / mobile</span>
                  <strong>${Number.isFinite(company.ui.overall) ? `${company.ui.overall}/10 · ${company.ui.mobile}/10` : "Unknown"}</strong>
                  ${stateBadge(company.ui.state)}
                </div>
              </div>
              <p>${escapeHtml(company.traffic.method)}</p>
            </section>

            <section class="detail-block">
              <span class="detail-label">Checkout</span>
              <h4>Public code and labels</h4>
              <div class="chips">${chips(company.checkout.signals)}</div>
              ${stateBadge(company.checkout.state)}
              <p>${escapeHtml(company.checkout.boundary)}</p>
            </section>

            <section class="detail-block">
              <span class="detail-label">Marketing</span>
              <h4>Public acquisition signals</h4>
              <div class="chips">${chips(company.marketing.signals)}</div>
              ${stateBadge(company.marketing.state)}
              <p>Observed tags and offers do not prove spend, traffic contribution, attribution, or profitability.</p>
            </section>

            <section class="detail-block">
              <span class="detail-label">History</span>
              <h4>Retained observations</h4>
              <ul class="history-list">${renderHistory(company)}</ul>
            </section>

            <section class="detail-block">
              <span class="detail-label">Evidence</span>
              <h4>Open the public record</h4>
              <ul class="evidence-list">${renderEvidence(company)}</ul>
            </section>
          </div>
          <div class="company-actions">
            ${storefront}
            <a class="text-link" href="#${escapeHtml(company.id)}">Copyable deep link</a>
          </div>
        </div>
      </details>
    `;
  }

  function persistControls() {
    const url = new URL(window.location.href);
    const values = {
      q: controls.q,
      evidence: controls.evidence === "all" ? "" : controls.evidence,
      signal: controls.signal === "all" ? "" : controls.signal,
      sort: controls.sort === "priority" ? "" : controls.sort
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) {
        url.searchParams.set(key, value);
      } else {
        url.searchParams.delete(key);
      }
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function renderCompanies() {
    const rows = filteredCompanies();
    const shown = controls.showAll ? rows : rows.slice(0, INITIAL_LIMIT);
    elements.companyList.innerHTML = shown.length
      ? shown.map(renderCompany).join("")
      : '<p class="empty-state">No companies match these filters. Unknown is preserved rather than inferred.</p>';

    elements.resultCount.textContent = `${rows.length} of ${activeData.companies.length} companies · showing ${shown.length}`;
    const remaining = rows.length - shown.length;
    elements.showAll.hidden = remaining <= 0;
    elements.showAll.textContent = rows.length === activeData.companies.length && !controls.showAll
      ? "Show all 25"
      : `Show ${remaining} more`;
    openHashTarget(false);
  }

  function renderMethod() {
    const methodology = activeData.methodology || {};
    elements.method.innerHTML = Object.entries(methodology).map(([title, detail]) => `
      <article class="method-card">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(detail)}</p>
      </article>
    `).join("");
  }

  function renderAll() {
    renderMetrics();
    renderChanges();
    renderCompanies();
    renderMethod();
  }

  function setFreshness(mode, checking) {
    const capturedAt = activeData.capturedAt || activeData.generatedAt;
    const capturedTime = new Date(capturedAt).getTime();
    const stale = !Number.isFinite(capturedTime) || Date.now() - capturedTime > STALE_AFTER_MS;
    elements.freshnessPill.className = "freshness-pill";

    if (checking) {
      elements.freshnessHeading.textContent = "Committed baseline active";
      elements.freshnessDetail.textContent = `Showing the ${formatDate(capturedAt)} capture while the bounded live refresh runs.`;
      elements.freshnessPill.classList.add("is-loading");
      elements.freshnessPill.textContent = "Checking live source";
      return;
    }

    if (mode === "live") {
      elements.freshnessHeading.textContent = stale ? "Live source is stale" : "Live aggregate active";
      elements.freshnessDetail.textContent = `Sanitized 25-company response captured ${formatDate(capturedAt)}.`;
      elements.freshnessPill.classList.add(stale ? "is-stale" : "is-live");
      elements.freshnessPill.textContent = stale ? "Live source stale" : "Live aggregates";
      return;
    }

    elements.freshnessHeading.textContent = stale ? "Committed baseline is stale" : "Committed baseline active";
    elements.freshnessDetail.textContent = `Live refresh unavailable. Showing the committed ${formatDate(capturedAt)} capture.`;
    elements.freshnessPill.classList.add(stale ? "is-stale" : "is-static");
    elements.freshnessPill.textContent = stale ? "Baseline stale" : "Committed baseline";
  }

  function loadControls() {
    const params = new URLSearchParams(window.location.search);
    const evidence = params.get("evidence");
    const signal = params.get("signal");
    const sort = params.get("sort");
    controls.q = (params.get("q") || "").slice(0, 120);
    controls.evidence = ALLOWED_STATES.has(evidence) ? evidence : "all";
    controls.signal = ["reta", "checkout", "traffic", "ui", "unknown"].includes(signal) ? signal : "all";
    controls.sort = ["name", "traffic", "ui", "reta"].includes(sort) ? sort : "priority";
    elements.search.value = controls.q;
    elements.evidence.value = controls.evidence;
    elements.signal.value = controls.signal;
    elements.sort.value = controls.sort;
  }

  function bindControls() {
    elements.search.addEventListener("input", () => {
      controls.q = elements.search.value.slice(0, 120);
      controls.showAll = false;
      persistControls();
      renderCompanies();
    });
    elements.evidence.addEventListener("change", () => {
      controls.evidence = elements.evidence.value;
      controls.showAll = false;
      persistControls();
      renderCompanies();
    });
    elements.signal.addEventListener("change", () => {
      controls.signal = elements.signal.value;
      controls.showAll = false;
      persistControls();
      renderCompanies();
    });
    elements.sort.addEventListener("change", () => {
      controls.sort = elements.sort.value;
      controls.showAll = false;
      persistControls();
      renderCompanies();
    });
    elements.reset.addEventListener("click", () => {
      controls.q = "";
      controls.evidence = "all";
      controls.signal = "all";
      controls.sort = "priority";
      controls.showAll = false;
      elements.search.value = "";
      elements.evidence.value = "all";
      elements.signal.value = "all";
      elements.sort.value = "priority";
      persistControls();
      renderCompanies();
      elements.search.focus();
    });
    elements.showAll.addEventListener("click", () => {
      controls.showAll = true;
      renderCompanies();
    });
  }

  function openHashTarget(shouldScroll) {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith("company-")) {
      return;
    }
    let target = document.getElementById(id);
    if (!target) {
      const company = activeData.companies.find((row) => row.id === id);
      if (company) {
        controls.q = "";
        controls.evidence = "all";
        controls.signal = "all";
        controls.sort = "priority";
        controls.showAll = true;
        elements.search.value = "";
        elements.evidence.value = "all";
        elements.signal.value = "all";
        elements.sort.value = "priority";
        persistControls();
        renderCompanies();
        target = document.getElementById(id);
      }
    }
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      if (shouldScroll) {
        target.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }
  }

  async function refreshLive() {
    const override = safeUrl(window.NOLI_OBSERVATORY_API_URL);
    const endpoint = override || DEFAULT_API_URL;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        mode: "cors",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("Live source unavailable");
      }
      const payload = await response.json();
      const normalized = normalizeLivePayload(payload);
      if (!validateDataset(normalized)) {
        throw new Error("Live response failed validation");
      }
      activeData = normalized;
      sourceMode = "live";
      renderAll();
      setFreshness(sourceMode, false);
      openHashTarget(false);
    } catch (_error) {
      sourceMode = "static";
      setFreshness(sourceMode, false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function renderFatalState() {
    elements.companyList.innerHTML = '<p class="empty-state">The committed cohort failed validation. No partial or mismatched company list was rendered.</p>';
    elements.changeFeed.innerHTML = '<p class="empty-state">Signal feed unavailable.</p>';
    elements.resultCount.textContent = "Cohort unavailable";
    elements.showAll.hidden = true;
    elements.freshnessHeading.textContent = "Dataset validation failed";
    elements.freshnessDetail.textContent = "The page refused to render a partial or mismatched cohort.";
    elements.freshnessPill.className = "freshness-pill is-stale";
    elements.freshnessPill.textContent = "Invalid baseline";
  }

  if (!validateDataset(activeData)) {
    renderFatalState();
    return;
  }

  loadControls();
  bindControls();
  renderAll();
  setFreshness(sourceMode, true);
  window.addEventListener("hashchange", () => openHashTarget(true));
  window.requestAnimationFrame(() => openHashTarget(false));
  refreshLive();
})();

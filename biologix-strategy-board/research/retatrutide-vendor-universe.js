(function () {
  "use strict";

  const data = window.NOLI_RETATRUTIDE_VENDOR_UNIVERSE;
  const auditData = window.NOLI_RETATRUTIDE_VENDOR_AUDITS || null;
  const checkoutAuditData = window.NOLI_RETATRUTIDE_CHECKOUT_AUDITS || null;
  const paymentProviderData = window.NOLI_RETATRUTIDE_PAYMENT_PROVIDER_CENSUS || null;
  const uiReviewData = window.NOLI_RETATRUTIDE_UI_REVIEWS || null;
  const auditSources = [
    auditData,
    checkoutAuditData,
    paymentProviderData,
    uiReviewData
  ].filter(Boolean);
  const list = document.getElementById("vendor-radar-list");
  if (!data || !list) return;

  const search = document.getElementById("vendor-search");
  const evidenceFilter = document.getElementById("vendor-evidence-filter");
  const paymentFilter = document.getElementById("vendor-payment-filter");
  const sort = document.getElementById("vendor-sort");
  const resultCount = document.getElementById("vendor-result-count");
  const loadMore = document.getElementById("vendor-load-more");
  const stats = document.getElementById("vendor-radar-stats");
  const rollups = document.getElementById("vendor-audit-rollups");

  const PAGE_SIZE = 24;
  let visibleCount = PAGE_SIZE;

  const escapeHtml = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));

  const safeUrl = (value) => {
    if (!value) return null;
    try {
      const parsed = new URL(String(value), window.location.href);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
    } catch (_error) {
      return null;
    }
  };

  const link = (url, label, className = "") => {
    const safe = safeUrl(url);
    if (!safe) return "";
    const classAttribute = className ? ` class="${escapeHtml(className)}"` : "";
    return `<a${classAttribute} href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  };

  const parseRecentDate = (value) => {
    if (!value) return 0;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const normalizedDomain = (value) => {
    if (!value) return "";
    try {
      const source = String(value).includes("://") ? String(value) : `https://${value}`;
      return new URL(source).hostname.toLowerCase().replace(/^www\./, "").replace(/^shop\./, "");
    } catch (_error) {
      return String(value).toLowerCase().replace(/^www\./, "").replace(/^shop\./, "").split("/")[0];
    }
  };

  const isPlainObject = (value) =>
    value != null && typeof value === "object" && !Array.isArray(value);

  const isUnknownValue = (value) =>
    typeof value === "string" && /^(unknown|not found|not observed|unverified)$/i.test(value.trim());

  const mergeAuditValues = (base, overlay) => {
    if (overlay == null || overlay === "" || isUnknownValue(overlay)) return base ?? overlay;
    if (base == null || base === "" || isUnknownValue(base)) return overlay;
    if (Array.isArray(base) && Array.isArray(overlay)) {
      const seen = new Set();
      return [...overlay, ...base].filter((item) => {
        const key = typeof item === "object" ? JSON.stringify(item) : String(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (isPlainObject(base) && isPlainObject(overlay)) {
      const keys = new Set([...Object.keys(base), ...Object.keys(overlay)]);
      return Object.fromEntries(
        [...keys].map((key) => [key, mergeAuditValues(base[key], overlay[key])])
      );
    }
    return overlay;
  };

  const auditEntries = (() => {
    const merged = new Map();
    for (const source of auditSources) {
      const entries = Array.isArray(source.audits)
        ? source.audits.map((audit) => [audit.domain || audit.url, audit])
        : Object.entries(source.audits || {});
      for (const [domainValue, audit] of entries) {
        const domain = normalizedDomain(domainValue || audit?.domain || audit?.url);
        if (!domain || !audit) continue;
        merged.set(domain, mergeAuditValues(merged.get(domain), audit));
      }
    }
    return [...merged.entries()];
  })();

  const auditByDomain = new Map(auditEntries.filter(([domain]) => domain));
  const auditFor = (vendor) =>
    auditByDomain.get(normalizedDomain(vendor.domain || vendor.url || vendor.productUrl)) || null;

  const valueStrings = (value, depth = 0) => {
    if (value == null || value === false || depth > 3) return [];
    if (typeof value === "string" || typeof value === "number") return [String(value)];
    if (value === true) return ["Yes"];
    if (Array.isArray(value)) return value.flatMap((item) => valueStrings(item, depth + 1));
    if (typeof value !== "object") return [];

    const preferred = [
      "summary", "label", "name", "title", "value", "method", "provider",
      "signal", "claim", "text", "status", "positioning", "headline"
    ];
    const direct = preferred.flatMap((key) =>
      Object.prototype.hasOwnProperty.call(value, key)
        ? valueStrings(value[key], depth + 1)
        : []
    );
    const preferredSet = new Set(preferred);
    const metadataKeys = new Set([
      "url", "sourceUrl", "capturedAt", "timestamp", "confidence",
      "evidenceIds", "caveat", "evidenceBoundary", "methodology"
    ]);
    const nested = Object.entries(value)
      .filter(([key]) =>
        !preferredSet.has(key) &&
        !metadataKeys.has(key)
      )
      .flatMap(([key, nested]) =>
        valueStrings(nested, depth + 1).map((entry) => `${key.replace(/([A-Z])/g, " $1")}: ${entry}`)
      );
    return [...direct, ...nested];
  };

  const uniqueStrings = (value, max = 8) =>
    Array.from(new Set(valueStrings(value).map((entry) => entry.trim()).filter(Boolean))).slice(0, max);

  const signalStrings = (value, max = 8, keys = ["display", "value", "label", "name", "method", "provider"]) => {
    const items = Array.isArray(value) ? value : value == null ? [] : [value];
    const strings = items.flatMap((item) => {
      if (item == null || item === false) return [];
      if (typeof item === "string" || typeof item === "number") return [String(item)];
      if (typeof item !== "object") return [];
      for (const key of keys) {
        const candidate = item[key];
        if (typeof candidate === "string" || typeof candidate === "number") {
          return [String(candidate)];
        }
      }
      return [];
    });
    return Array.from(new Set(strings.map((entry) => entry.trim()).filter(Boolean))).slice(0, max);
  };

  const hasAuditValue = (value) => uniqueStrings(value, 1).length > 0;
  const hasArrayValues = (value) => Array.isArray(value) && value.length > 0;

  const designScore = (audit) => {
    const design = audit?.design;
    const basis = [
      design?.scoringBasis,
      design?.methodology,
      audit?.auditType
    ].filter(Boolean).join(" ").toLowerCase();
    const pendingVisualReview = /(without screenshot|visual polish remains pending)/.test(basis);
    const hasVisualEvidence =
      (design?.visualPolish != null && Number.isFinite(Number(design.visualPolish))) ||
      (!pendingVisualReview &&
        /(screenshot|visual review|browser observation|mobile browser)/.test(basis));
    if (!hasVisualEvidence) return null;
    const raw = audit?.design?.overall ?? audit?.designScore ?? null;
    if (raw == null) return null;
    const score = Number(raw);
    if (!Number.isFinite(score)) return null;
    return score > 10 ? Math.round(score) / 10 : Math.round(score * 100) / 100;
  };

  const hasGrowthSignal = (audit) => {
    const value = audit?.marketing;
    if (!value) return false;
    return value.affiliate === true ||
      value.affiliateDetected === true ||
      value.referral === true ||
      value.referralDetected === true ||
      value.subscription === true ||
      value.subscriptionDetected === true ||
      value.loyaltyDetected === true ||
      value.freeShippingDetected === true ||
      value.quantityDiscountDetected === true ||
      hasArrayValues(value.offers) ||
      hasArrayValues(value.technologyStack);
  };

  const paymentSignalValue = (audit) => {
    const payment = audit?.payment;
    if (!payment) return null;
    const value = {
      methods: payment.methods,
      visibleMethods: payment.visibleMethods,
      checkoutIntegration: payment.checkoutIntegration,
      gatewayPsp: payment.gatewayPsp,
      processorIso: payment.processorIso,
      acquirerSponsorBank: payment.acquirerSponsorBank,
      providerSignals: payment.providerSignals,
      activeMethodIds: payment.evidence?.activeMethodIds,
      renderedCheckoutLabels: payment.evidence?.renderedCheckoutLabels,
      grade: payment.grade,
      activeMethodCount: payment.activeMethodCount
    };
    const hasSignals =
      uniqueStrings([
        value.methods,
        value.visibleMethods,
        value.checkoutIntegration,
        value.gatewayPsp,
        value.processorIso,
        value.acquirerSponsorBank,
        value.providerSignals,
        value.activeMethodIds,
        value.renderedCheckoutLabels
      ], 1).length > 0 ||
      Number(value.activeMethodCount || 0) > 0;
    return hasSignals ? value : null;
  };

  const auditGroupValue = (audit, group) => {
    const value = audit?.[group];
    if (value == null) return null;
    if (group === "platform") {
      if (typeof value === "string") return value;
      return value.name || value.primary || hasArrayValues(value.detected) || hasArrayValues(value.plugins)
        ? value
        : null;
    }
    if (group === "reta") {
      return value.listed === true ||
        value.productName ||
        value.productUrl ||
        value.listingStatus ||
        hasArrayValues(value.productUrls) ||
        hasArrayValues(value.strengths)
        ? value
        : null;
    }
    if (group === "pricing") {
      return value.displayedPrice || value.displayedRange || hasArrayValues(value.prices)
        ? value
        : null;
    }
    if (group === "marketing") {
      return value.affiliate === true ||
        value.affiliateDetected === true ||
        value.referral === true ||
        value.referralDetected === true ||
        value.subscription === true ||
        value.subscriptionDetected === true ||
        value.loyaltyDetected === true ||
        value.freeShippingDetected === true ||
        value.quantityDiscountDetected === true ||
        hasArrayValues(value.positioning) ||
        hasArrayValues(value.offers) ||
        hasArrayValues(value.technologyStack)
        ? value
        : null;
    }
    if (group === "tracking") {
      return hasArrayValues(value) || hasArrayValues(value.stack) ? value : null;
    }
    if (group === "trust") {
      return value.coaOrTestingSignal === true ||
        value.reviewSignal === true ||
        value.ruoNotice === true ||
        value.ageOr21PlusGate === true ||
        value.accountGate === true ||
        hasArrayValues(value.coaLinks) ||
        hasArrayValues(value.reviewProviders) ||
        hasArrayValues(value.displayedReviewCounts) ||
        hasArrayValues(value.displayedRatings)
        ? value
        : null;
    }
    if (group === "operations") {
      return value.cartAccessible === true ||
        value.anonymousCartAdd === true ||
        value.checkoutPageHttpStatus ||
        hasArrayValues(value.gates) ||
        hasArrayValues(value.shipping) ||
        hasArrayValues(value.returns) ||
        hasArrayValues(value.shippingReturnEvidenceUrls) ||
        hasArrayValues(value.policyUrls) ||
        hasArrayValues(value.contactUrls)
        ? value
        : null;
    }
    if (group === "payment") return paymentSignalValue(audit);
    if (group === "claims") {
      if (Array.isArray(value)) return value.length ? value : null;
      return hasArrayValues(value.researchOnly) ||
        hasArrayValues(value.humanUseOrOutcome) ||
        hasArrayValues(value.all)
        ? value
        : null;
    }
    if (group === "sourcing") {
      const manufacturer = String(
        value.independentlyVerifiedManufacturer || value.manufacturer || ""
      ).toLowerCase();
      const supplier = String(value.supplier || "").toLowerCase();
      return hasArrayValues(value.claims) ||
        (manufacturer && manufacturer !== "unknown") ||
        (supplier && supplier !== "unknown")
        ? value
        : null;
    }
    if (group === "design") return designScore(audit) == null ? null : value;
    return hasAuditValue(value) ? value : null;
  };

  const platformName = (audit) => {
    const platform = audit?.platform;
    if (!platform) return null;
    if (typeof platform === "string") return platform;
    if (typeof platform.name === "string") return platform.name;
    if (typeof platform.primary === "string") return platform.primary;
    if (typeof platform.primary?.value === "string") return platform.primary.value;
    const detected = Array.isArray(platform.detected) ? platform.detected[0] : null;
    if (typeof detected === "string") return detected;
    if (typeof detected?.value === "string") return detected.value;
    return null;
  };

  const auditStatus = (audit) => {
    if (!audit) return "Not crawled";
    const raw = String(audit.status || "").toLowerCase();
    if (/(blocked|403|429|denied|captcha)/.test(raw)) return "Blocked";
    if (/(error|failed|timeout)/.test(raw)) return "Failed";
    if (raw === "skipped") return "Skipped";
    if (raw === "partial") return "Partial";
    if (raw === "complete" || raw === "completed") return "Profiled";
    const pages = Number(audit.pagesCrawled || audit.pageCount || 0);
    return pages > 0 ? "Profiled" : "Partial";
  };

  const auditCompleteness = (audit) => {
    if (!audit) return 0;
    return [
      "platform",
      "reta",
      "pricing",
      "marketing",
      "tracking",
      "trust",
      "operations",
      "payment",
      "claims",
      "sourcing"
    ].filter((group) => auditGroupValue(audit, group) != null).length;
  };

  const auditHas = (value, pattern) =>
    pattern.test(uniqueStrings(value, 250).join(" ").toLowerCase());

  const paymentHaystack = (vendor) =>
    [
      ...(vendor.payments || []),
      vendor.paymentEvidence,
      vendor.paymentNote,
      ...uniqueStrings(paymentSignalValue(auditFor(vendor)), 30)
    ].filter(Boolean).join(" ").toLowerCase();

  function matchesEvidence(vendor, filter) {
    const audit = auditFor(vendor);
    if (filter === "all") return true;
    if (filter === "audited") return vendor.payments.length > 0;
    if (filter === "profiled") return auditStatus(audit) === "Profiled";
    if (filter === "reta-live") {
      return audit?.reta?.listed === true ||
        auditHas(auditGroupValue(audit, "reta"), /(retatrutide|reta|glp.?3|3rt|three.?r|purchasable|in stock|available)/);
    }
    if (filter === "coa") {
      return audit?.trust?.coaOrTestingSignal === true ||
        hasArrayValues(audit?.trust?.coaLinks);
    }
    if (filter === "growth") {
      return hasGrowthSignal(audit);
    }
    if (filter === "provider-code") {
      return (audit?.payment?.providerSignals || []).some(
        (signal) => signal?.codeIdentified === true
      );
    }
    if (filter === "design-strong") return (designScore(audit) || 0) >= 8;
    if (filter === "blocked") return auditStatus(audit) === "Blocked";
    if (filter === "partial") return auditStatus(audit) === "Partial";
    if (filter === "failed") return auditStatus(audit) === "Failed";
    if (filter === "skipped") return auditStatus(audit) === "Skipped";
    if (filter === "confirmed-retail") return vendor.retailStatus === "Confirmed US storefront";
    if (filter === "probable-retail") {
      return vendor.retailStatus === "Probable or gated US storefront";
    }
    if (filter === "listed-active") return vendor.statusBucket === "Listed active";
    if (filter === "search-discovered") return vendor.statusBucket === "Search-discovered";
    if (filter === "unavailable") {
      return ["Inactive", "Not found", "Payment problems"].includes(vendor.statusBucket);
    }
    return true;
  }

  function matchesPayment(vendor, filter) {
    if (filter === "all") return true;
    const haystack = paymentHaystack(vendor);
    if (filter === "bank") {
      return /(bank|ach|echeck|e-check|wire|plaid|link money|paynote|seamless)/.test(haystack);
    }
    if (filter === "crypto") {
      return /(crypto|bitcoin|btc|ethereum|eth|usdt|usdc|blockonomics|depay|opennode|btcpay|forum)/.test(haystack);
    }
    if (filter === "p2p") {
      return /(zelle|venmo|cash app|apple cash|p2p|manual|chime)/.test(haystack);
    }
    if (filter === "card") {
      return /(card|nmi|authorize|stripe|quantum|chargeanywhere|tagada|circoflows|mnet|paygate|idem)/.test(haystack);
    }
    return haystack.includes(filter);
  }

  const vendorSearchCache = new WeakMap();

  function vendorHaystack(vendor) {
    if (vendorSearchCache.has(vendor)) return vendorSearchCache.get(vendor);
    const audit = auditFor(vendor);
    const searchableAudit = [
      audit?.entityType,
      audit?.classification,
      audit?.status,
      audit?.errors,
      ...[
        "platform", "reta", "pricing", "marketing", "tracking",
        "trust", "operations", "payment", "claims", "sourcing", "design"
      ].map((group) => auditGroupValue(audit, group))
    ];
    const haystack = [
      vendor.name,
      vendor.domain,
      vendor.platform,
      vendor.status,
      vendor.statusBucket,
      vendor.retailStatus,
      vendor.source.join(" "),
      paymentHaystack(vendor),
      ...uniqueStrings(searchableAudit, 250)
    ].filter(Boolean).join(" ").toLowerCase();
    vendorSearchCache.set(vendor, haystack);
    return haystack;
  }

  function filteredVendors() {
    const query = search.value.trim().toLowerCase();
    const evidence = evidenceFilter.value;
    const payment = paymentFilter.value;
    const order = sort.value;

    const filtered = data.vendors.filter((vendor) =>
      (!query || vendorHaystack(vendor).includes(query)) &&
      matchesEvidence(vendor, evidence) &&
      matchesPayment(vendor, payment)
    );

    filtered.sort((left, right) => {
      if (order === "name") return left.name.localeCompare(right.name);
      if (order === "tests") {
        return right.testCount - left.testCount || left.name.localeCompare(right.name);
      }
      if (order === "newest") {
        return parseRecentDate(right.latestTest) - parseRecentDate(left.latestTest) ||
          right.testCount - left.testCount;
      }
      if (order === "coverage") {
        return auditCompleteness(auditFor(right)) - auditCompleteness(auditFor(left)) ||
          right.testCount - left.testCount ||
          left.name.localeCompare(right.name);
      }
      if (order === "design") {
        return (designScore(auditFor(right)) || -1) - (designScore(auditFor(left)) || -1) ||
          auditCompleteness(auditFor(right)) - auditCompleteness(auditFor(left)) ||
          left.name.localeCompare(right.name);
      }
      const leftAudit = left.payments.length > 0 ? 1 : 0;
      const rightAudit = right.payments.length > 0 ? 1 : 0;
      return auditCompleteness(auditFor(right)) - auditCompleteness(auditFor(left)) ||
        rightAudit - leftAudit ||
        right.testCount - left.testCount ||
        left.name.localeCompare(right.name);
    });

    return filtered;
  }

  function statusClass(vendor) {
    if (vendor.retailStatus === "Confirmed US storefront") return "is-active";
    if (vendor.retailStatus === "Probable or gated US storefront") return "is-discovered";
    if (vendor.retailStatus === "Excluded from current US retail") return "is-muted";
    if (vendor.statusBucket === "Listed active") return "is-active";
    if (vendor.statusBucket === "Search-discovered") return "is-discovered";
    if (vendor.statusBucket === "Payment problems") return "is-warning";
    return "is-muted";
  }

  function auditGroupEntries(label, value) {
    if (label === "Reta listing") {
      const strengths = signalStrings(value?.strengths, 12);
      const forms = signalStrings(value?.forms, 4);
      return [
        value?.listed === true ? "Listed: yes" : "",
        value?.listingStatus ? `Status: ${value.listingStatus}` : "",
        strengths.length ? `Strengths: ${strengths.join(", ")}` : "",
        forms.length ? `Form: ${forms.join(", ")}` : ""
      ].filter(Boolean);
    }

    if (label === "Price and offer") {
      const prices = signalStrings(value?.prices, 12, ["display", "value", "amount"]);
      const minimum = Number(value?.displayedRange?.minimum);
      const maximum = Number(value?.displayedRange?.maximum);
      return [
        prices.length ? `Displayed prices: ${prices.join(", ")}` : "",
        Number.isFinite(minimum) && Number.isFinite(maximum)
          ? `Range: $${minimum.toFixed(2)}–$${maximum.toFixed(2)}`
          : ""
      ].filter(Boolean);
    }

    if (label === "Marketing and growth") {
      const positioning = signalStrings(value?.positioning, 2);
      const offers = signalStrings(value?.offers, 8);
      return [
        ...positioning,
        offers.length ? `Offers: ${offers.join(", ")}` : "",
        value?.affiliate === true || value?.affiliateDetected === true ? "Affiliate program detected" : "",
        value?.subscription === true || value?.subscriptionDetected === true ? "Subscription detected" : ""
      ].filter(Boolean);
    }

    if (label === "Tracking stack") {
      const trackers = signalStrings(value?.stack || value, 10, ["provider", "name", "value", "label"]);
      return trackers.length ? [trackers.join(", ")] : [];
    }

    if (label === "Testing and trust") {
      const coaCount = Array.isArray(value?.coaLinks) ? value.coaLinks.length : 0;
      const providers = signalStrings(value?.reviewProviders, 6);
      const ratings = signalStrings(value?.displayedRatings, 3);
      const reviews = signalStrings(value?.displayedReviewCounts, 3);
      return [
        coaCount ? `${coaCount} public COA/report link${coaCount === 1 ? "" : "s"}` : "",
        providers.length ? `Review platforms: ${providers.join(", ")}` : "",
        ratings.length ? `Displayed rating claim: ${ratings.join(", ")}` : "",
        reviews.length ? `Displayed review-count claim: ${reviews.join(", ")}` : ""
      ].filter(Boolean);
    }

    if (label === "Shipping and operations") {
      const shipping = signalStrings(value?.shipping, 5);
      const returns = signalStrings(value?.returns, 3);
      const policies = signalStrings(value?.policyUrls, 5, ["label", "value"]);
      const contacts = signalStrings(value?.contactUrls, 3, ["label", "value"]);
      return [
        shipping.length ? `Shipping: ${shipping.join(", ")}` : "",
        returns.length ? `Returns: ${returns.join(", ")}` : "",
        policies.length ? `Policies: ${policies.join(", ")}` : "",
        contacts.length ? `Contact: ${contacts.join(", ")}` : ""
      ].filter(Boolean);
    }

    if (label === "Checkout signals") {
      const methods = signalStrings(value?.visibleMethods || value?.methods, 10);
      const integrations = signalStrings(value?.checkoutIntegration, 8);
      const gateways = signalStrings(value?.gatewayPsp, 8);
      const processors = signalStrings(value?.processorIso, 8);
      const acquirers = signalStrings(value?.acquirerSponsorBank, 8);
      const providerSignals = Array.isArray(value?.providerSignals)
        ? value.providerSignals
        : [];
      const statusRank = {
        active_for_reta_cart_api: 0,
        rendered_at_checkout: 1,
        configured_not_active_for_reta_cart: 2,
        configured_not_active: 2,
        configured_disabled_in_public_code: 3,
        installed_or_code_exposed_activation_unknown: 4,
        installed_plugin_signal_activation_unknown: 4,
        embedded_code_provider_marker_activation_unknown: 4,
        historical_failed_or_shut_down_code_comment: 5,
        planned_placeholder_not_active: 6,
        visible_provider_mention_activation_unknown: 7,
        visible_first_party_language_activation_unknown: 7,
        public_claim_or_logo_only: 8
      };
      const statusLabels = {
        active_for_reta_cart_api: "active Reta cart",
        rendered_at_checkout: "rendered checkout",
        configured_not_active_for_reta_cart: "configured, not active",
        configured_not_active: "configured, not active",
        configured_disabled_in_public_code: "disabled in public code",
        installed_or_code_exposed_activation_unknown: "code/plugin",
        installed_plugin_signal_activation_unknown: "installed plugin",
        embedded_code_provider_marker_activation_unknown: "embedded code",
        historical_failed_or_shut_down_code_comment: "historical failure",
        planned_placeholder_not_active: "placeholder only",
        visible_provider_mention_activation_unknown: "visible claim",
        visible_first_party_language_activation_unknown: "visible claim",
        public_claim_or_logo_only: "logo/claim"
      };
      const providerMap = new Map();
      [...providerSignals]
        .sort((left, right) =>
          (statusRank[left?.evidenceStatus] ?? 9) -
          (statusRank[right?.evidenceStatus] ?? 9)
        )
        .forEach((signal) => {
          const provider = String(signal?.provider || "").trim();
          if (!provider || providerMap.has(provider)) return;
          providerMap.set(provider, signal);
        });
      const providerLabel = (signal) =>
        `${signal.provider} (${statusLabels[signal.evidenceStatus] || "signal"})`;
      const codeProviders = [...providerMap.values()]
        .filter((signal) => signal?.codeIdentified === true)
        .slice(0, 10)
        .map(providerLabel);
      const claimProviders = [...providerMap.values()]
        .filter((signal) => signal?.codeIdentified !== true)
        .slice(0, 6)
        .map(providerLabel);
      return [
        codeProviders.length ? `Named providers in code: ${codeProviders.join(", ")}` : "",
        claimProviders.length ? `Claims or logos only: ${claimProviders.join(", ")}` : "",
        methods.length ? `Visible methods: ${methods.join(", ")}` : "",
        integrations.length ? `Integration signals: ${integrations.join(", ")}` : "",
        gateways.length ? `Gateway/PSP signals: ${gateways.join(", ")}` : "",
        processors.length ? `Contractual processor/ISO evidence: ${processors.join(", ")}` : "",
        acquirers.length ? `Acquirer/sponsor bank: ${acquirers.join(", ")}` : "",
        (providerSignals.length || methods.length || integrations.length || gateways.length) &&
          !processors.length &&
          !acquirers.length
          ? "Private chain: public code does not establish this merchant's MID, acquirer, reserves, or settlement"
          : ""
      ].filter(Boolean);
    }

    if (label === "Claims and risk cues") {
      const research = signalStrings(value?.researchOnly || value, 5);
      const human = signalStrings(value?.humanUseOrOutcome, 6);
      return [
        research.length ? `Research-only cues: ${research.join(", ")}` : "",
        human.length ? `Human-use or outcome cues: ${human.join(", ")}` : ""
      ].filter(Boolean);
    }

    if (label === "Sourcing claims") {
      const claims = signalStrings(value?.claims || value, 8);
      const manufacturer = value?.independentlyVerifiedManufacturer || value?.manufacturer;
      return [
        claims.length ? `First-party claims: ${claims.join(", ")}` : "",
        manufacturer ? `Manufacturer: ${manufacturer}` : "Manufacturer: not independently verified"
      ].filter(Boolean);
    }

    return uniqueStrings(value, 5);
  }

  function renderAuditGroup(label, value) {
    const entries = auditGroupEntries(label, value);
    if (!entries.length) return "";
    return `
      <section>
        <span>${escapeHtml(label)}</span>
        <p>${entries.map(escapeHtml).join(" · ")}</p>
      </section>
    `;
  }

  function auditEvidenceLinks(audit) {
    const evidence = Array.isArray(audit?.evidence) ? audit.evidence : [];
    return evidence
      .map((item, index) => {
        if (typeof item === "string") {
          return safeUrl(item) ? { url: item, label: `Evidence ${index + 1}` } : null;
        }
        const url = item?.url || item?.sourceUrl || item?.pageUrl;
        if (!safeUrl(url)) return null;
        return {
          url,
          label: item.label || item.title || item.type || item.field || `Evidence ${index + 1}`,
          grade: item.grade || item.confidence || ""
        };
      })
      .filter(Boolean)
      .slice(0, 8);
  }

  function renderAuditProfile(audit) {
    if (!audit) return "";
    const status = auditStatus(audit);
    const coverage = auditCompleteness(audit);
    const pages = Number(audit.pagesCrawled || audit.pageCount || 0);
    const evidence = auditEvidenceLinks(audit);
    const groups = [
      renderAuditGroup("Reta listing", auditGroupValue(audit, "reta")),
      renderAuditGroup("Price and offer", auditGroupValue(audit, "pricing")),
      renderAuditGroup("Marketing and growth", auditGroupValue(audit, "marketing")),
      renderAuditGroup("Tracking stack", auditGroupValue(audit, "tracking")),
      renderAuditGroup("Testing and trust", auditGroupValue(audit, "trust")),
      renderAuditGroup("Shipping and operations", auditGroupValue(audit, "operations")),
      renderAuditGroup("Checkout signals", auditGroupValue(audit, "payment")),
      renderAuditGroup("Claims and risk cues", auditGroupValue(audit, "claims")),
      renderAuditGroup("Sourcing claims", auditGroupValue(audit, "sourcing")),
      renderAuditGroup("UI and conversion", auditGroupValue(audit, "design"))
    ].filter(Boolean).join("");

    return `
      <details class="vendor-profile">
        <summary>
          <span>Open automated profile</span>
          <strong>${escapeHtml(status)} · ${escapeHtml(coverage)}/10 signal groups${pages ? ` · ${escapeHtml(pages)} pages` : ""}</strong>
        </summary>
        <div class="vendor-profile-grid">
          ${groups || `<section><span>Audit result</span><p>No extractable public profile fields.</p></section>`}
        </div>
        ${evidence.length ? `
          <div class="vendor-profile-evidence">
            ${evidence.map((item) =>
              link(item.url, `${item.label}${item.grade ? ` · ${item.grade}` : ""} ↗`)
            ).join("")}
          </div>
        ` : ""}
        ${uniqueStrings(audit.errors, 3).length ? `
          <p class="vendor-profile-caveat"><strong>Collection limits:</strong> ${uniqueStrings(audit.errors, 3).map(escapeHtml).join(" · ")}</p>
        ` : ""}
      </details>
    `;
  }

  function renderVendor(vendor) {
    const audit = auditFor(vendor);
    const primaryUrl = vendor.productUrl || vendor.url;
    const auditPaymentMethods = signalStrings([
      ...(audit?.payment?.methods || []),
      ...(audit?.payment?.visibleMethods || []),
      ...(audit?.payment?.evidence?.renderedCheckoutLabels || [])
    ], 8);
    const paymentMethods = Array.from(new Set([...(vendor.payments || []), ...auditPaymentMethods])).slice(0, 10);
    const paymentMarkup = paymentMethods.length
      ? `
        <div class="vendor-payment-list" aria-label="Observed or claimed payment methods">
          ${paymentMethods.map((method) => `<span>${escapeHtml(method)}</span>`).join("")}
        </div>
        <p class="vendor-payment-proof"><strong>${escapeHtml(vendor.paymentEvidence || "Payment evidence")}</strong>${vendor.paymentNote ? ` · ${escapeHtml(vendor.paymentNote)}` : ""}</p>
      `
      : `<p class="vendor-payment-empty">No public checkout rail confirmed.</p>`;

    const extractedPlatform = platformName(audit);
    const facts = [
      vendor.retailStatus && vendor.retailStatus !== "Vendor identity not retail-classified"
        ? `<span>${escapeHtml(vendor.retailStatus)}</span>`
        : "",
      extractedPlatform || vendor.platform
        ? `<span>${escapeHtml(extractedPlatform || vendor.platform)}</span>`
        : "",
      audit ? `<span>Automated · ${escapeHtml(auditCompleteness(audit))}/10 core groups</span>` : "",
      designScore(audit) != null ? `<span>UI ${escapeHtml(designScore(audit))}/10</span>` : "",
      vendor.testCount ? `<span>${escapeHtml(vendor.testCount)} Reta tests</span>` : "",
      vendor.latestTest ? `<span>Latest ${escapeHtml(vendor.latestTest)}</span>` : "",
      vendor.pricePerMg ? `<span>${escapeHtml(vendor.pricePerMg)} / mg observed</span>` : ""
    ].filter(Boolean).join("");

    return `
      <article class="vendor-radar-card">
        <header>
          <div>
            <span class="vendor-status ${statusClass(vendor)}">${escapeHtml(
              vendor.retailStatus && vendor.retailStatus !== "Vendor identity not retail-classified"
                ? vendor.retailStatus
                : vendor.statusBucket
            )}</span>
            <h3>${primaryUrl ? link(primaryUrl, vendor.name) : escapeHtml(vendor.name)}</h3>
            <p>${escapeHtml(vendor.domain || "No public domain")}</p>
          </div>
          ${audit
            ? `<span class="vendor-audit-badge">${escapeHtml(auditStatus(audit))}</span>`
            : vendor.payments.length
              ? `<span class="vendor-audit-badge">Checkout evidence</span>`
              : ""}
        </header>
        <div class="vendor-facts">${facts || "<span>Directory record only</span>"}</div>
        ${paymentMarkup}
        ${renderAuditProfile(audit)}
        <footer>
          ${vendor.productUrl ? link(vendor.productUrl, "Product ↗") : ""}
          ${vendor.url ? link(vendor.url, "Website ↗") : ""}
          ${vendor.finnrickUrl ? link(vendor.finnrickUrl, "Test history ↗") : ""}
        </footer>
      </article>
    `;
  }

  function renderStats() {
    if (!stats) return;
    const broadStats = auditData?.stats || {};
    const providerStats = paymentProviderData?.stats || {};
    const cards = [
      [data.stats.total, "public vendor identities"],
      [
        data.stats.confirmedRetailStorefronts + data.stats.probableRetailStorefronts,
        "confirmed or probable retail"
      ],
      [broadStats.audited || auditEntries.length || "Running", "automated domain profiles"],
      [providerStats.evidenceRows || "Running", "payment-code evidence rows"]
    ];
    stats.innerHTML = cards.map(([value, label]) => `
      <div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>
    `).join("");
  }

  function renderRollups() {
    if (!rollups) return;
    const audits = auditEntries.map(([, audit]) => audit);
    if (!audits.length) {
      rollups.innerHTML = `
        <article>
          <span>Automated audit</span>
          <strong>Evidence pass in progress</strong>
          <p>The directory remains live while public profile extraction runs.</p>
        </article>
      `;
      return;
    }

    const platformCounts = new Map();
    for (const vendor of data.vendors) {
      const platform = platformName(auditFor(vendor)) || vendor.platform;
      if (!platform) continue;
      platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1);
    }
    const topPlatforms = Array.from(platformCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} ${count}`)
      .join(" · ");

    const broadAudits = auditData
      ? Array.isArray(auditData.audits)
        ? auditData.audits
        : Object.values(auditData.audits || {})
      : [];
    const broadStats = auditData?.stats || {};
    const statusCounts = broadStats.statusCounts || {};
    const profiled = statusCounts.completed ||
      audits.filter((audit) => auditStatus(audit) === "Profiled").length;
    const partial = Number(statusCounts.partial || 0);
    const blocked = statusCounts.blocked ||
      audits.filter((audit) => auditStatus(audit) === "Blocked").length;
    const failed = Number(statusCounts.failed || 0);
    const skipped = Number(statusCounts.skipped || 0);
    const reta = audits.filter((audit) =>
      audit?.reta?.listed === true ||
      auditHas(auditGroupValue(audit, "reta"), /(retatrutide|reta|glp.?3|3rt|three.?r|purchasable|in stock|available)/)
    ).length;
    const retaAvailable = broadAudits.filter((audit) =>
      String(audit?.reta?.listingStatus || "").toLowerCase() === "available"
    ).length;
    const trust = audits.filter((audit) =>
      audit?.trust?.coaOrTestingSignal === true ||
      hasArrayValues(audit?.trust?.coaLinks)
    ).length;
    const growth = audits.filter((audit) =>
      hasGrowthSignal(audit)
    ).length;
    const latestGeneratedAt = auditSources
      .map((source) => Date.parse(source.generatedAt || ""))
      .filter(Number.isFinite)
      .sort((left, right) => right - left)[0];
    const generated = latestGeneratedAt
      ? new Date(latestGeneratedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit"
        })
      : "Current pass";

    const checkoutStats = checkoutAuditData?.stats || {};
    const checkoutRollups = checkoutStats.rollups || {};
    const activeMethods = Number(checkoutStats.storesWithActiveMethodIds || 0);
    const renderedMethods = Number(checkoutStats.storesWithRenderedCheckoutLabels || 0);
    const retaListings = Number(checkoutStats.includedCurrentRetaListings || 0);
    const affiliateStores = Number(checkoutRollups.marketingMechanics?.["Affiliate or ambassador acquisition"] || 0);
    const topTracking = Object.entries(checkoutRollups.trackingStacks || {})
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} ${count}`)
      .join(" · ");
    const topDesign = data.vendors
      .map((vendor) => ({ name: vendor.name, score: designScore(auditFor(vendor)) }))
      .filter((entry) => entry.score != null)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((entry) => `${entry.name} ${entry.score}`)
      .join(" · ");
    const screenshotReviewed = Number(uiReviewData?.stats?.reviewedDomains || 0);
    const providerStats = paymentProviderData?.stats || {};
    const providerRows = Number(providerStats.evidenceRows || 0);
    const providerCodeDomains = Number(
      providerStats.pspInstalledOrCodeExposedDomainCount || 0
    );
    const activeProviderDomains = Number(
      providerStats.pspActiveProviderLayerDomainCount || 0
    );

    const cards = [
      [
        "Coverage",
        `${profiled} complete · ${partial} partial · ${blocked} blocked`,
        `${broadStats.audited || audits.length} domains attempted. ${failed} failed and ${skipped} skipped records remain visible. ${generated}.`
      ],
      [
        "Live Reta",
        retaAvailable
          ? `${retaAvailable} shown available · ${broadStats.retaListingsObserved || reta} signals`
          : `${retaListings || reta} current storefront signals`,
        `${retaListings || 0} received the higher-confidence storefront pass. A listing is not proof of inventory, quality, legality, or settled orders.`
      ],
      [
        "Payment code",
        providerRows
          ? `${providerRows} rows · ${providerStats.censusDomains || 0} domains`
          : activeMethods
            ? `${activeMethods} active method sets`
            : "Evidence pass running",
        providerRows
          ? `${providerCodeDomains} domains expose processor/PSP-level code and ${activeProviderDomains} expose active provider-layer IDs for tested Reta carts. Named providers are visible; private MID, acquirer, and settlement terms are separate.`
          : `${renderedMethods} rendered label sets. Named integrations are recorded separately from the private acquiring chain.`
      ],
      ["Trust", `${trust} testing or COA signals`, "Presence is recorded. Authenticity and lab independence are not inferred."],
      [
        "Growth",
        `${growth} domains with visible growth signals`,
        affiliateStores
          ? `${affiliateStores} of 48 checkout-census stores use affiliate or ambassador acquisition. ${topTracking || ""}`
          : topTracking || (topPlatforms ? `Top detected platforms: ${topPlatforms}.` : "Platform still unknown on most profiles.")
      ],
      [
        "UI and design",
        topDesign || "Scoring in progress",
        `${screenshotReviewed} screenshot-reviewed profiles, with rendered mobile evidence for the checkout cohort. Separate from product quality, legality, and revenue.`
      ]
    ];

    rollups.innerHTML = cards.map(([label, value, note]) => `
      <article>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <p>${escapeHtml(note)}</p>
      </article>
    `).join("");
  }

  function render() {
    const vendors = filteredVendors();
    const visible = vendors.slice(0, visibleCount);
    list.innerHTML = visible.length
      ? visible.map(renderVendor).join("")
      : `
        <div class="vendor-radar-empty">
          <strong>No matching vendors.</strong>
          <p>Clear a filter or try a broader term.</p>
        </div>
      `;
    resultCount.textContent = `Showing ${visible.length.toLocaleString()} of ${vendors.length.toLocaleString()} matching vendors`;
    loadMore.hidden = visible.length >= vendors.length;
  }

  function resetAndRender() {
    visibleCount = PAGE_SIZE;
    render();
  }

  [search, evidenceFilter, paymentFilter, sort].forEach((control) => {
    control.addEventListener(control === search ? "input" : "change", resetAndRender);
  });

  loadMore.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    render();
  });

  renderStats();
  renderRollups();
  render();
})();

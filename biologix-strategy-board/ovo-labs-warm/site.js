(() => {
  "use strict";

  const body = document.body;
  const root = document.querySelector("#site-root");
  if (!root) return;

  const BASE = body.dataset.base || ".";
  const PAGE = body.dataset.page || "home";
  const PRODUCT_SLUG = body.dataset.product || "";
  const CART_KEY = "ovo-labs-demo-cart-v2";
  const RECENT_KEY = "ovo-labs-recent-products-v1";
  const ORDER_KEY = "ovo-labs-orders-v1";
  const CHECKOUT_KEY = "ovo-labs-checkout-draft-v1";
  const MAX_QUANTITY = 10;

  const CHECKOUT_STEPS = [
    { key: "contact", label: "Contact" },
    { key: "shipping", label: "Shipping" },
    { key: "delivery", label: "Delivery" },
    { key: "payment", label: "Payment" },
    { key: "review", label: "Review" },
  ];

  const SHIPPING_METHODS = [
    { id: "standard", name: "Standard", detail: "3 to 5 business days", note: "Insulated mailer", price: 12 },
    { id: "express", name: "Express", detail: "2 business days", note: "Insulated mailer, tracked", price: 18 },
    { id: "cold", name: "Cold chain overnight", detail: "Next business day by 12:00", note: "Gel pack, temperature logger", price: 45 },
  ];

  const PROMO_CODES = {
    "OVO-FIRST": { label: "First order", type: "percent", value: 10 },
    "COLDCHAIN": { label: "Free cold chain", type: "shipping", value: 100 },
  };

  /* Analytical records per catalog entry.
     The site's whole claim is "see what is reported, see what is not", but every
     field was hardcoded to "not reported", which inverted the pitch into "we have
     no data". These are the reported panels. Sterility and endotoxin are left
     genuinely unreported on lyophilized research material, which is both accurate
     and what makes the reported-vs-not distinction visible at all. */
  const TESTING = {
    "retatrutide":            { lot: "RT-2411-A", date: "2026-06-18", identity: ["RP-HPLC / ESI-MS", "Conforms to reference"], content: ["RP-HPLC, 214 nm", "10.2 mg"], purity: ["RP-HPLC, area %", "99.1%"] },
    "semaglutide":            { lot: "SG-2409-C", date: "2026-06-02", identity: ["RP-HPLC / ESI-MS", "Conforms to reference"], content: ["RP-HPLC, 214 nm", "10.2 mg"], purity: ["RP-HPLC, area %", "98.7%"] },
    "tirzepatide":            { lot: "TZ-2410-B", date: "2026-06-11", identity: ["RP-HPLC / ESI-MS", "Conforms to reference"], content: ["RP-HPLC, 214 nm", "10.1 mg"], purity: ["RP-HPLC, area %", "99.4%"] },
    "cagrilintide":           { lot: "CG-2408-A", date: "2026-05-27", identity: ["RP-HPLC / ESI-MS", "Conforms to reference"], content: ["RP-HPLC, 214 nm", "9.8 mg"],  purity: ["RP-HPLC, area %", "98.2%"] },
    "bpc-157":                { lot: "BP-2412-D", date: "2026-06-24", identity: ["RP-HPLC / ESI-MS", "Conforms to reference"], content: ["RP-HPLC, 214 nm", "10.0 mg"], purity: ["RP-HPLC, area %", "99.0%"] },
    "tb-500":                 { lot: "TB-2411-B", date: "2026-06-15", identity: ["RP-HPLC / ESI-MS", "Conforms to reference"], content: ["RP-HPLC, 214 nm", "10.2 mg"], purity: ["RP-HPLC, area %", "98.9%"] },
    "ipamorelin":             { lot: "IP-2410-A", date: "2026-06-08", identity: ["RP-HPLC / ESI-MS", "Conforms to reference"], content: ["RP-HPLC, 214 nm", "5.0 mg"], purity: ["RP-HPLC, area %", "99.2%"] },
    "cjc-1295":               { lot: "CJ-2409-E", date: "2026-06-04", identity: ["RP-HPLC / ESI-MS", "Conforms to reference"], content: ["RP-HPLC, 214 nm", "5.0 mg"], purity: ["RP-HPLC, area %", "98.5%"] },
    "bpc-tb-blend":           { lot: "BX-2412-A", date: "2026-06-21", identity: ["RP-HPLC / ESI-MS", "Both components conform"], content: ["RP-HPLC, 214 nm", "10.0 + 10.0 mg"], purity: ["RP-HPLC, area %", "98.4%"] },
    "cjc-ipamorelin-blend":   { lot: "CX-2411-C", date: "2026-06-13", identity: ["RP-HPLC / ESI-MS", "Both components conform"], content: ["RP-HPLC, 214 nm", "5.0 + 5.0 mg"], purity: ["RP-HPLC, area %", "98.8%"] },
  };

  /* Sample references are derived from the lot so the analytical record can name
     the tested sample without a second hand-maintained table drifting out of sync. */
  function sampleReference(lot) {
    return `SMP-${String(lot).replace(/-/g, "")}`;
  }

  /* The lot number is the only thing that ties the vial in the box to the
     analytical record on the site, so it has to be addressable and it has to
     travel with the purchase. These four helpers are the whole mechanism:
     resolve a lot to its catalog entry, build the record URL, and expand any
     cart line into its lots. A set carries one lot per component, not a single
     blended one, because that is what would be printed on the two vials. */
  function productForLot(lot) {
    const key = String(lot || "").trim().toUpperCase();
    if (!key) return null;
    const slug = Object.keys(TESTING).find((entry) => TESTING[entry].lot.toUpperCase() === key);
    return slug ? PRODUCTS.find((product) => product.slug === slug) || null : null;
  }

  function lotPath(lot) {
    return path(`lot-record.html?lot=${encodeURIComponent(lot)}`);
  }

  function lotTrace(slug) {
    const item = ALL_CART_ITEMS.find((entry) => entry.slug === slug);
    if (!item) return [];
    return (item.productSlugs || [slug])
      .map((componentSlug) => {
        const record = testingFor(componentSlug);
        if (!record) return null;
        const product = PRODUCTS.find((entry) => entry.slug === componentSlug);
        return {
          slug: componentSlug,
          name: product ? product.name : componentSlug,
          code: product ? product.code : "",
          lot: record.lot,
          date: record.date,
        };
      })
      .filter(Boolean);
  }

  /* One "Lot X, reported Y" row per component, named per component only when a
     line carries more than one, so a single vial is never labelled twice. */
  function lotTraceRows(slug, options = {}) {
    const { link = true } = options;
    const entries = lotTrace(slug);
    return entries.map((entry) => {
      const label = `${entries.length > 1 ? `${escapeHtml(entry.name)} · ` : ""}<span class="lot-nb">Lot ${escapeHtml(entry.lot)}</span> · <span class="lot-nb">reported ${escapeHtml(entry.date)}</span>`;
      return link
        ? `<a class="lot-line" href="${lotPath(entry.lot)}">${label}</a>`
        : `<span class="lot-line">${label}</span>`;
    });
  }

  function testingFor(slug) {
    return TESTING[slug] || null;
  }

  /* The reported mass and the "% of label" figure used to be one hand-typed
     string, so seven of ten entries contradicted their own labeled amount. The
     measured mass is the only stored value now; the percentage is derived from
     it against the product's labeled amount, and if either side cannot be parsed
     the percentage is omitted rather than guessed. */
  function contentResult(slug) {
    const record = testingFor(slug);
    if (!record) return "Result not reported";
    const measured = String(record.content[1]).replace(/\s*\([^)]*\)\s*$/, "").trim();
    const product = PRODUCTS.find((entry) => entry.slug === slug);
    const masses = (measured.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const labeled = product ? Number.parseFloat(product.strength) : Number.NaN;
    if (!masses.length || !Number.isFinite(labeled) || labeled <= 0) return measured;
    const total = masses.reduce((sum, value) => sum + value, 0);
    return `${measured} (${Math.round((total / labeled) * 100)}% of label)`;
  }

  /* One renderer for all three surfaces that used to hardcode these rows, so a
     product can never show a reported result on one page and a blank on another. */
  function testingFields(slug) {
    const t = testingFor(slug);
    return [
      { label: "Identity", method: t ? t.identity[0] : "Method not assigned", result: t ? t.identity[1] : "Result not reported", reported: Boolean(t) },
      { label: "Content / mass", method: t ? t.content[0] : "Method not assigned", result: t ? contentResult(slug) : "Result not reported", reported: Boolean(t) },
      { label: "Purity profile", method: t ? t.purity[0] : "Method not assigned", result: t ? t.purity[1] : "Result not reported", reported: Boolean(t) },
      { label: "Sterility / endotoxin", method: "Not represented", result: "Result not reported", reported: false },
    ];
  }

  /* Inventory. Availability is data, not markup, so a single edit here moves a
     product between states and every surface follows: catalog card, PDP buy box,
     search result, cart, and the checkout gate.

     unavailable = cannot be sold. Retatrutide and cagrilintide are not approved
     compounds. If the operating position ever changes for a given entry, flip its
     line here and nothing else needs to be touched.

     LOW_STOCK_AT is the threshold where the remaining count is surfaced. Below it
     the exact number shows; above it the page just says in stock, because a
     precise count on a well-stocked item is noise. */
  const LOW_STOCK_AT = 6;

  /* Restricted is a reason, not just a zero. Two compounds are not offered as a
     position rather than as a stock accident, and a shopper who sees the same
     grey "Unavailable" pill on both cannot tell the difference. Stock stays 0
     either way; this only carries the reason to the surfaces that show it. */
  const RESTRICTED = {
    "retatrutide":
      "OVO Labs does not offer retatrutide. It has no approved reference product and no established compendial standard to test against, so we cannot state what conformance would mean. The entry stays listed so the catalog is complete and the position is on the record.",
    "cagrilintide":
      "OVO Labs does not offer cagrilintide. It has no approved reference product and no established compendial standard to test against, so we cannot state what conformance would mean. The entry stays listed so the catalog is complete and the position is on the record.",
  };

  function restrictionFor(slug) {
    return RESTRICTED[slug] || "";
  }

  const STOCK = {
    "retatrutide": 0,
    "cagrilintide": 0,
    "tirzepatide": 24,
    "semaglutide": 31,
    "bpc-157": 48,
    "tb-500": 12,
    "cjc-1295": 37,
    "ipamorelin": 52,
    "cjc-ipamorelin-blend": 4,
    "bpc-tb-blend": 9,
    "metabolic-reference-set": 0,
    "peptide-pair-set": 6,
    "secretagogue-reference-set": 15,
  };

  function stockFor(slug) {
    const units = STOCK[slug];
    return typeof units === "number" ? units : 0;
  }

  function availability(slug) {
    const units = stockFor(slug);
    if (restrictionFor(slug)) {
      return { state: "unavailable", units: 0, label: "Not offered", sellable: false, restricted: true };
    }
    if (units <= 0) return { state: "unavailable", units: 0, label: "Unavailable", sellable: false, restricted: false };
    if (units <= LOW_STOCK_AT) return { state: "low", units, label: `Only ${units} left`, sellable: true, restricted: false };
    return { state: "in", units, label: "In stock", sellable: true, restricted: false };
  }

  /* A bundle can only be as available as its scarcest component. Without this a
     set could be sold while one of the vials inside it is unavailable. */
  function bundleAvailability(bundle) {
    if (!bundle || !bundle.productSlugs) return availability(bundle ? bundle.slug : "");
    /* A set that contains a compound we will not offer is itself not offered, and
       must say so with the same reason rather than reading as a stock shortage. */
    if (bundle.productSlugs.some((slug) => restrictionFor(slug))) {
      return { state: "unavailable", units: 0, label: "Not offered", sellable: false, restricted: true };
    }
    const own = availability(bundle.slug);
    if (!own.sellable) return own;
    const componentUnits = bundle.productSlugs.map((slug) => stockFor(slug));
    const scarcest = Math.min(...componentUnits, own.units);
    if (scarcest <= 0) return { state: "unavailable", units: 0, label: "Unavailable", sellable: false, restricted: false };
    if (scarcest <= LOW_STOCK_AT) return { state: "low", units: scarcest, label: `Only ${scarcest} left`, sellable: true, restricted: false };
    return { state: "in", units: scarcest, label: "In stock", sellable: true, restricted: false };
  }

  function availabilityFor(slug) {
    const bundle = (typeof BUNDLES !== "undefined" ? BUNDLES : []).find((b) => b.slug === slug);
    return bundle ? bundleAvailability(bundle) : availability(slug);
  }

  /* Any line in the cart that can no longer be sold. Stock can change while a
     cart sits in storage, so this is checked at render time on both the cart and
     the checkout rather than trusted from when the item was added. */
  /* Curated rails are recommendations, so leading them with something that
     cannot be bought wastes the strongest slot on the page. Sort is stable, so
     entries keep their editorial order inside each group. The full catalog grid
     still lists every entry, including the two that are not offered, so the
     position on them stays visible. There it only applies to the Featured order,
     and never overrides an explicit name or price sort. */
  const sellableFirst = (list) =>
    [...list].sort(
      (a, b) => (availabilityFor(b.slug).sellable === true) - (availabilityFor(a.slug).sellable === true),
    );

  /* A cart line can go bad two different ways while it sits in storage: the
     entry stops being sellable, or stock drops below the saved quantity. They
     need different wording, so they are classified rather than merged. */
  function cartLineIssue(line) {
    const stock = availabilityFor(line.slug);
    const item = cartItemData(line.slug);
    const name = item ? item.name : line.slug;
    if (!stock.sellable) {
      return { type: stock.restricted ? "restricted" : "unavailable", name, units: 0 };
    }
    if (line.quantity > stock.units) {
      return { type: "partial", name, units: stock.units };
    }
    return null;
  }

  function blockedCartLines() {
    return cart.filter((line) => cartLineIssue(line));
  }

  /* The per-order ceiling is whichever runs out first, the order cap or the
     shelf. Every quantity control reads it from here so the drawer, the cart
     page and the PDP cannot disagree about where the "+" stops. */
  function cartLineCeiling(slug) {
    const stock = availabilityFor(slug);
    return stock.sellable ? Math.min(MAX_QUANTITY, stock.units) : 0;
  }

  function cartLineAtCap(line) {
    const ceiling = cartLineCeiling(line.slug);
    return ceiling > 0 && line.quantity >= ceiling;
  }

  function stockBadge(slug) {
    const a = availabilityFor(slug);
    return `<span class="stock-badge is-${a.state}">${escapeHtml(a.label)}</span>`;
  }

  const TAX_RATE = 0.0725;
  const FREE_SHIPPING_THRESHOLD = 500;

  const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const PRODUCTS = [
    {
      slug: "retatrutide",
      code: "OVO-001",
      name: "Retatrutide",
      category: "GLP-1 & Metabolic",
      categoryKey: "metabolic",
      strength: "10 mg",
      format: "Lyophilized vial",
      price: 105,
      descriptor: "Synthetic triple-agonist incretin-class research compound.",
      facts: ["10 mg labeled amount", "Single-vial format", "Identity, content, purity reported"],
      overview:
        "A focused catalog entry for retatrutide research reference work. Molecule, labeled amount, format, and testing status are presented together.",
    },
    {
      slug: "tirzepatide",
      code: "OVO-002",
      name: "Tirzepatide",
      category: "GLP-1 & Metabolic",
      categoryKey: "metabolic",
      strength: "10 mg",
      format: "Lyophilized vial",
      price: 100,
      descriptor: "Synthetic dual incretin-receptor agonist research compound.",
      facts: ["10 mg labeled amount", "Single-vial format", "Identity, content, purity reported"],
      overview:
        "A clear catalog entry for tirzepatide reference research, with labeled amount, product identity, format, and testing status in one decision block.",
    },
    {
      slug: "semaglutide",
      code: "OVO-003",
      name: "Semaglutide",
      category: "GLP-1 & Metabolic",
      categoryKey: "metabolic",
      strength: "10 mg",
      format: "Lyophilized vial",
      price: 90,
      descriptor: "Synthetic GLP-1 receptor agonist research compound.",
      facts: ["10 mg labeled amount", "Single-vial format", "Identity, content, purity reported"],
      overview:
        "A structured semaglutide catalog entry with direct access to the product’s testing status and comparison-ready product facts.",
    },
    {
      slug: "cagrilintide",
      code: "OVO-004",
      name: "Cagrilintide",
      category: "GLP-1 & Metabolic",
      categoryKey: "metabolic",
      strength: "10 mg",
      format: "Lyophilized vial",
      price: 89,
      descriptor: "Long-acting amylin-analogue research compound.",
      facts: ["10 mg labeled amount", "Single-vial format", "Identity, content, purity reported"],
      overview:
        "A cagrilintide research catalog entry organized around identity, labeled amount, format, and testing status.",
    },
    {
      slug: "bpc-157",
      code: "OVO-005",
      name: "BPC-157",
      category: "Research Peptides",
      categoryKey: "research",
      strength: "10 mg",
      format: "Lyophilized vial",
      price: 60,
      descriptor: "Synthetic pentadecapeptide research compound.",
      facts: ["10 mg labeled amount", "Single-vial format", "Identity, content, purity reported"],
      overview:
        "A BPC-157 catalog entry with a compact, neutral specification surface and visible testing status.",
    },
    {
      slug: "tb-500",
      code: "OVO-006",
      name: "TB-500",
      category: "Research Peptides",
      categoryKey: "research",
      strength: "10 mg",
      format: "Lyophilized vial",
      price: 68,
      descriptor: "Synthetic thymosin beta-4 fragment research compound.",
      facts: ["10 mg labeled amount", "Single-vial format", "Identity, content, purity reported"],
      overview:
        "A TB-500 catalog entry that puts identity, labeled amount, format, price, and testing status in a single decision layout.",
    },
    {
      slug: "cjc-1295",
      code: "OVO-007",
      name: "CJC-1295",
      category: "Growth Hormone Research",
      categoryKey: "growth",
      strength: "5 mg",
      format: "Lyophilized vial",
      price: 52,
      descriptor: "Synthetic GHRH-analogue research compound.",
      facts: ["5 mg labeled amount", "Single-vial format", "Identity, content, purity reported"],
      overview:
        "A CJC-1295 catalog entry built to make the exact product easy to find, compare, and inspect.",
    },
    {
      slug: "ipamorelin",
      code: "OVO-008",
      name: "Ipamorelin",
      category: "Growth Hormone Research",
      categoryKey: "growth",
      strength: "5 mg",
      format: "Lyophilized vial",
      price: 45,
      descriptor: "Synthetic growth-hormone secretagogue research compound.",
      facts: ["5 mg labeled amount", "Single-vial format", "Identity, content, purity reported"],
      overview:
        "An ipamorelin research catalog entry with simple product identification, comparable specifications, and visible testing status.",
    },
    {
      slug: "cjc-ipamorelin-blend",
      code: "OVO-009",
      name: "CJC-1295 + Ipamorelin",
      category: "Peptide Blends",
      categoryKey: "blends",
      strength: "10 mg",
      format: "Dual-compound vial",
      price: 92,
      descriptor: "Equal-part GHRH analogue and secretagogue research blend.",
      facts: ["5 mg + 5 mg labeled", "Single-vial blend format", "Identity, content, purity reported"],
      overview:
        "A two-compound blend shown as its own product, with each constituent and the testing status kept explicit.",
    },
    {
      slug: "bpc-tb-blend",
      code: "OVO-010",
      name: "BPC-157 + TB-500",
      category: "Peptide Blends",
      categoryKey: "blends",
      strength: "20 mg",
      format: "Dual-compound vial",
      price: 118,
      descriptor: "Equal-part BPC-157 and TB-500 research blend.",
      facts: ["10 mg + 10 mg labeled", "Single-vial blend format", "Identity, content, purity reported"],
      overview:
        "A two-compound blend with its own product identity, labeled composition, and testing status.",
    },
  ];

  const BUNDLES = [
    {
      slug: "metabolic-reference-set",
      code: "OVO-S01",
      name: "Metabolic Reference Set",
      category: "Curated Set",
      strength: "2 vials",
      format: "Retatrutide + Cagrilintide",
      price: 169,
      descriptor: "Two distinct incretin and amylin-class research references.",
      productSlugs: ["retatrutide", "cagrilintide"],
    },
    {
      slug: "peptide-pair-set",
      code: "OVO-S02",
      name: "Peptide Pair Set",
      category: "Curated Set",
      strength: "2 vials",
      format: "BPC-157 + TB-500",
      price: 108,
      descriptor: "Two individually identified research peptide references.",
      productSlugs: ["bpc-157", "tb-500"],
    },
    {
      slug: "secretagogue-reference-set",
      code: "OVO-S03",
      name: "Secretagogue Reference Set",
      category: "Curated Set",
      strength: "2 vials",
      format: "CJC-1295 + Ipamorelin",
      price: 82,
      descriptor: "Two separate growth-hormone research references.",
      productSlugs: ["cjc-1295", "ipamorelin"],
    },
  ];

  const CATEGORIES = [
    { key: "all", name: "Shop All", note: `${PRODUCTS.length} catalog entries` },
    { key: "metabolic", name: "GLP-1 & Metabolic", note: "4 individual compounds" },
    { key: "research", name: "Research Peptides", note: "2 individual compounds" },
    { key: "growth", name: "Growth Hormone Research", note: "2 individual compounds" },
    { key: "blends", name: "Peptide Blends", note: "2 defined blends" },
  ];

  const ARTICLES = [
    {
      slug: "reading-testing-status",
      kind: "Testing guide · 4 minutes",
      title: "How to read a testing status",
      summary: "A result, a specification, and an unreported field are three different things.",
    },
    {
      slug: "choosing-by-molecule",
      kind: "Catalog guide · 4 minutes",
      title: "Shop by molecule, not by hype",
      summary: "A practical catalog framework for comparing identity, strength, format, and evidence state.",
    },
    {
      slug: "coa-boundaries",
      kind: "Document guide · 5 minutes",
      title: "What a COA can and cannot show",
      summary: "Why a document’s method and scope matter more than the letters at the top.",
    },
  ];

  const ALL_CART_ITEMS = [...PRODUCTS, ...BUNDLES];

  const icons = {
    menu:
      '<svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    cart:
      '<svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.4 10.1a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 1.9-1.4L21 8H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>',
    arrow: '<span aria-hidden="true">→</span>',
    check:
      '<svg class="i-check" aria-hidden="true" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 8 14.5 16 6"/></svg>',
    shield:
      '<svg aria-hidden="true" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M10 2.5 16.5 5v5c0 3.4-2.6 6.5-6.5 7.5C6.1 16.5 3.5 13.4 3.5 10V5z"/><path d="M7.2 10.2 9.2 12.2 13 8.4" stroke-width="2"/></svg>',
    lock:
      '<svg aria-hidden="true" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4.5" y="9" width="11" height="7.5" rx="1.5"/><path d="M7.2 9V6.8a2.8 2.8 0 0 1 5.6 0V9"/></svg>',
    snow:
      '<svg aria-hidden="true" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M10 3v14M4 6.5l12 7M16 6.5l-12 7"/></svg>',
    doc:
      '<svg aria-hidden="true" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M5 2.5h6l4 4v11H5z"/><path d="M11 2.5v4h4"/><path d="M7.5 11h5M7.5 14h3.5"/></svg>',
  };

  function path(relative) {
    return `${BASE}/${relative}`.replace(/\/\.\//g, "/");
  }

  function productPath(product) {
    return path(`peptides/${product.slug}.html`);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function track(event, properties = {}) {
    const payload = {
      event,
      page_type: PAGE,
      timestamp: new Date().toISOString(),
      ...properties,
    };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    window.dispatchEvent(new CustomEvent("ovolabs:analytics", { detail: payload }));
  }

  window.OvoLabsAnalytics = {
    events: () => [...(window.dataLayer || [])],
    clear: () => {
      window.dataLayer = [];
    },
  };

  function activePage(name) {
    if (name === "shop" && ["collection", "product"].includes(PAGE)) return true;
    if (name === "testing" && ["testing", "lot-record"].includes(PAGE)) return true;
    if (name === "bundles" && PAGE === "bundles") return true;
    if (name === "learn" && ["learn", "article"].includes(PAGE)) return true;
    if (name === "about" && ["about", "policy"].includes(PAGE)) return true;
    return false;
  }

  function header() {
    const nav = [
      ["shop", "Shop", "catalog.html"],
      ["bundles", "Bundles", "bundles.html"],
      ["testing", "Testing & COAs", "testing.html"],
      ["learn", "Learn", "notes.html"],
    ];
    const categoryLinks = CATEGORIES.map(
      (category) =>
        `<a href="${path(`catalog.html${category.key === "all" ? "" : `?category=${category.key}`}`)}">${category.name}</a>`,
    ).join("");

    return `
      <a class="skip-link" href="#main-content">Skip to content</a>
      <div class="concept-banner" role="note">
        Fictional concept storefront. Nothing here is real, stocked, or for sale.
      </div>
      <header class="site-header">
        <div class="shell header-main">
          <a class="wordmark" href="${path("index.html")}" aria-label="OVO Labs home">
            <span class="wordmark-mark" aria-hidden="true">O</span>
            <span class="wordmark-copy">
              <span class="wordmark-name">OVO Labs</span>
              <span class="wordmark-category">PEPTIDES</span>
            </span>
          </a>
          <nav class="primary-nav" aria-label="Primary navigation">
            ${nav
              .map(
                ([key, label, href]) =>
                  `<a href="${path(href)}"${activePage(key) ? ' aria-current="page"' : ""}>${label}</a>`,
              )
              .join("")}
          </nav>
          <div class="search-wrap">
            <span class="search-icon" aria-hidden="true"></span>
            <label class="sr-only" for="site-search">Search products and product codes</label>
            <input
              class="search-input"
              id="site-search"
              type="search"
              role="combobox"
              placeholder="Search molecule or code"
              autocomplete="off"
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-controls="search-results"
              aria-expanded="false"
            >
            <span class="search-shortcut" aria-hidden="true">⌘K</span>
            <div class="search-results" id="search-results" role="listbox" hidden></div>
          </div>
          <div class="header-actions">
            <button class="icon-button mobile-menu-button" type="button" data-menu-open aria-label="Open menu">
              ${icons.menu}
            </button>
            <button class="icon-button" type="button" data-cart-open aria-label="Open cart">
              ${icons.cart}
              <span class="cart-count" data-cart-count hidden>0</span>
            </button>
          </div>
        </div>
        <div class="category-nav-wrap">
          <nav class="shell category-nav" aria-label="Shop by category">${categoryLinks}</nav>
        </div>
      </header>
    `;
  }

  function footer() {
    return `
      <footer class="site-footer">
        <div class="shell">
          <div class="footer-grid">
            <div class="footer-brand">
              <a class="wordmark" href="${path("index.html")}" aria-label="OVO Labs home">
                <span class="wordmark-mark" aria-hidden="true">O</span>
                <span class="wordmark-copy">
                  <span class="wordmark-name">OVO Labs</span>
                  <span class="wordmark-category">PEPTIDES</span>
                </span>
              </a>
              <p>Clear product data, focused categories, and visible testing status at the point of choice.</p>
            </div>
            <div class="footer-column">
              <h2>Shop</h2>
              <a href="${path("catalog.html")}">All products</a>
              <a href="${path("catalog.html?category=metabolic")}">GLP-1 & metabolic</a>
              <a href="${path("catalog.html?category=research")}">Research peptides</a>
              <a href="${path("catalog.html?category=blends")}">Peptide blends</a>
              <a href="${path("bundles.html")}">Reference sets</a>
            </div>
            <div class="footer-column">
              <h2>Documents</h2>
              <a href="${path("testing.html")}">Testing & COAs</a>
              <a href="${path("lot-record.html")}">Lot records</a>
              <a href="${path("eligibility.html")}">Research use eligibility</a>
              <a href="${path("policies.html")}">Site policies</a>
            </div>
            <div class="footer-column">
              <h2>Company</h2>
              <a href="${path("company.html")}">About OVO Labs</a>
              <a href="${path("notes.html")}">Learn</a>
              <a href="${path("faq.html")}">FAQ</a>
            </div>
          </div>
          <!-- The operator record. Contact used to be a fourth sub-list buried in the
               brand cell, set at the same 12px/on-dark-2 as every navigation link, so
               the support address read as one more menu item. The only statement of
               who runs this store and from where was the 9px mono copyright line, the
               smallest and faintest text in the document. On a catalog whose whole
               pitch is that claims are checkable, that is the wrong thing to whisper.
               It is now a labelled record sitting on the same four columns as the
               navigation above it (60, 482, 797, 1113 at 1440), and it carries the
               fact that actually backs the testing pitch: OVO Labs does not run its
               own release testing. Every line here is already stated on the company
               page, so nothing is invented. -->
          <dl class="footer-record">
            <div>
              <dt>Operator</dt>
              <dd>OVO Labs LLC</dd>
              <dd>One facility, Portland, Oregon</dd>
            </div>
            <div>
              <dt>Analytical work</dt>
              <dd>An independent US contract laboratory</dd>
              <dd>OVO Labs runs no release testing of its own</dd>
            </div>
            <div>
              <dt>Support</dt>
              <dd><a href="mailto:support@ovolabs.example">support@ovolabs.example</a></dd>
              <dd>Monday to Friday, 9:00 to 17:00 Pacific</dd>
            </div>
            <div>
              <dt>Response</dt>
              <dd>First reply within one business day</dd>
              <dd>Written decision on fulfillment cases within three business days</dd>
            </div>
          </dl>
          <div class="footer-bottom">
            <div>© 2026 OVO Labs LLC</div>
            <span>This catalog does not provide medical advice or human-use instructions.</span>
          </div>
        </div>
      </footer>
    `;
  }

  function drawers() {
    return `
      <div class="drawer-backdrop" data-drawer-backdrop data-open="false"></div>
      <aside class="cart-drawer" data-cart-drawer data-open="false" aria-hidden="true" aria-labelledby="cart-title">
        <div class="drawer-head">
          <h2 id="cart-title">Your cart</h2>
          <button class="drawer-close" type="button" data-cart-close aria-label="Close cart">×</button>
        </div>
        <div class="cart-items" data-cart-items></div>
        <div class="cart-footer" data-cart-footer></div>
      </aside>
      <aside class="mobile-drawer" data-mobile-drawer data-open="false" aria-hidden="true" aria-labelledby="menu-title">
        <div class="drawer-head">
          <h2 id="menu-title">Menu</h2>
          <button class="drawer-close" type="button" data-menu-close aria-label="Close menu">×</button>
        </div>
        <nav class="mobile-nav" aria-label="Mobile navigation">
          <a href="${path("catalog.html")}">Shop all</a>
          <a href="${path("bundles.html")}">Bundles</a>
          <a href="${path("testing.html")}">Testing & COAs</a>
          <a href="${path("notes.html")}">Learn</a>
          <a href="${path("faq.html")}">FAQ</a>
          <a href="${path("company.html")}">About OVO Labs</a>
          <a href="${path("policies.html")}">Site policies</a>
          <a href="${path("eligibility.html")}">Research use eligibility</a>
        </nav>
      </aside>
      <div class="toast" data-toast aria-live="polite" data-open="false"></div>
    `;
  }

  function layout(main) {
    root.innerHTML = `${header()}<main id="main-content">${main}</main>${footer()}${drawers()}`;
  }

  function productImage(product, eager = false) {
    return `
      <img
        src="${path("assets/ovo-vial-front.webp")}"
        alt="OVO Labs vial for ${escapeHtml(product.name)}"
        width="1024"
        height="1024"
        ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}
      >
      <span class="product-image-label" aria-hidden="true">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.strength)} · ${escapeHtml(product.code)}</span>
      </span>
    `;
  }

  function productCard(product, options = {}) {
    const { eager = false } = options;
    return `
      <article class="product-card" data-product-card="${product.slug}">
        <a class="product-image-wrap" href="${productPath(product)}" data-product-link="${product.slug}">
          ${productImage(product, eager)}
        </a>
        <div class="product-card-body">
          <p class="product-category">${escapeHtml(product.category)} ${stockBadge(product.slug)}</p>
          <h3 class="product-name"><a href="${productPath(product)}" data-product-link="${product.slug}">${escapeHtml(product.name)} · ${escapeHtml(product.strength)}</a></h3>
          <p class="product-description">${escapeHtml(product.descriptor)}</p>
          <div class="testing-micro">
            <span class="testing-micro-lot">${(() => { const record = testingFor(product.slug); return record
              ? `${icons.check}${escapeHtml(record.purity[1])} purity`
              : "Testing reported per lot"; })()}</span>
            <a href="${path(`testing.html?product=${product.code}`)}">View status</a>
          </div>
          <div class="product-buy-row">
            <div>
              <span class="price">${money.format(product.price)}</span>
            </div>
            ${(() => { const a = availabilityFor(product.slug); return a.sellable
              ? `<button class="add-button" type="button" data-add-product="${product.slug}">Add to cart</button>`
              : `<button class="add-button is-unavailable" type="button" disabled aria-disabled="true">${escapeHtml(a.label)}</button>`; })()}
          </div>
        </div>
      </article>
    `;
  }

  function categoryRail() {
    return `
      <div class="category-rail" aria-label="Shop by research area">
        ${CATEGORIES.slice(1)
          .map(
            (category) => `
              <a class="category-tile" href="${path(`catalog.html?category=${category.key}`)}">
                <span class="category-tile-head">
                  <strong>${category.name}</strong>
                  <span class="category-arrow" aria-hidden="true">→</span>
                </span>
                <span class="category-tile-members">${PRODUCTS.filter((entry) => entry.categoryKey === category.key).map((entry) => escapeHtml(entry.name)).join(", ")}</span>
              </a>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function bundleCard(bundle) {
    const items = bundle.productSlugs.map((slug) => PRODUCTS.find((product) => product.slug === slug));
    return `
      <article class="bundle-card">
        <div class="bundle-body">
          <div class="bundle-head">
            <span class="bundle-thumb" aria-hidden="true"><img src="${path("assets/ovo-set-pair.webp")}" alt="" width="1536" height="1024" loading="lazy"></span>
            <div>
              <p class="product-category bundle-eyebrow"><span>Catalog set</span><span class="bundle-code">${escapeHtml(bundle.code)}</span></p>
              <h3>${escapeHtml(bundle.name)}</h3>
            </div>
          </div>
          <p>${escapeHtml(bundle.descriptor)}</p>
          <ul class="bundle-items">
            ${items
              .map(
                (product) =>
                  `<li><a href="${productPath(product)}">${escapeHtml(product.name)}</a><span>${escapeHtml(product.strength)}</span></li>`,
              )
              .join("")}
          </ul>
          ${(() => {
            const a = availabilityFor(bundle.slug);
            /* A set held back on position is not a sold-out set, but it is still a
               catalog position: the price stays on the record and the terminal row
               keeps the same shape as the two sellable cards, so all three sets
               align on one baseline instead of one card carrying a paragraph. */
            const held = items.filter((product) => restrictionFor(product.slug)).map((product) => product.name);
            return `
          <div class="bundle-footer">
            <div>
              <span class="price-label">Set price</span>
              <span class="price">${money.format(bundle.price)}</span>
            </div>
            ${a.sellable
              ? `<button class="add-button" type="button" data-add-product="${bundle.slug}">Add set to cart</button>`
              : a.restricted
                ? `<p class="bundle-unavailable" role="note"><span class="bundle-unavailable__label">Not offered</span><span>${escapeHtml(held.join(" and "))} cannot be ordered.</span></p>`
                : `<button class="add-button is-unavailable" type="button" disabled aria-disabled="true">${escapeHtml(a.label)}</button>`}
          </div>`;
          })()}
        </div>
      </article>
    `;
  }

  /* One derived component for the drawer and the cart page, so the two surfaces
     can never disagree about how far an order sits from free shipping. The fill
     is cobalt: it is progress, not a verified result, so green is not available
     to it. The met label is the one allowed green, because at that point the
     free shipping is applied rather than promised. */
  function shipProgressBar(subtotal, options = {}) {
    const { link = false } = options;
    const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
    const met = remaining <= 0;
    const percent = Math.min(100, Math.max(0, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100)));
    const pending = `Add <strong>${money.format(remaining)}</strong> for free standard shipping`;
    return `
      <div class="ship-progress-bar${met ? " is-met" : ""}" data-ship-progress>
        <div
          class="ship-progress-bar__track"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="${FREE_SHIPPING_THRESHOLD}"
          aria-valuenow="${Math.min(Math.round(subtotal), FREE_SHIPPING_THRESHOLD)}"
          aria-label="Progress to free standard shipping"
        >
          <div class="ship-progress-bar__fill" style="width:${percent}%"></div>
        </div>
        ${met
          ? `<p class="ship-progress-bar__label"><span class="status-dot" aria-hidden="true"></span> Free standard shipping applied.</p>`
          : `<p class="ship-progress-bar__label">${link ? `<a href="${path("catalog.html")}">${pending}</a>` : pending}</p>`}
      </div>
    `;
  }

  function newsletter() {
    return `
      <section class="section-tight">
        <div class="shell newsletter">
          <div>
            <h2>Get the catalog brief.</h2>
            <p>Get catalog additions, document updates, and practical explainers. No dosing or medical-use content.</p>
          </div>
          <form class="newsletter-form" data-newsletter novalidate>
            <label class="sr-only" for="newsletter-email">Email address</label>
            <input id="newsletter-email" name="email" type="email" placeholder="you@example.com" required>
            <button type="submit">Get updates</button>
          </form>
          <p class="newsletter-success" data-newsletter-success hidden role="status"></p>
        </div>
      </section>
    `;
  }

  function homePage() {
    /* One featured entry for the whole page. The hero chip, the hero testing card
       and the testing-status document each used to pick their own subject, and
       two of the three picked the entry that cannot be bought. */
    const featured = sellableFirst(PRODUCTS)[0];
    const featuredTesting = testingFor(featured.slug);
    return `
      <section class="home-hero">
        <div class="shell hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">Peptide research catalog</p>
            <h1>Peptides, <span>without the mystery.</span></h1>
            <p>A focused catalog with clear formats and a fast path from search to cart. Every entry names what was tested and what was not.</p>
            <div class="hero-actions">
              <a class="button button-primary" href="${path("catalog.html")}">Shop peptides ${icons.arrow}</a>
              <a class="button button-secondary" href="${path("testing.html")}">View testing & COAs</a>
            </div>
            ${(() => {
              /* The proof card floated on the photograph at 200px wide, and the
                 phone breakpoint set it to display:none, so the one contrast
                 this catalog is built on was a sticker at 1440 and did not
                 exist at 390. It moves into the copy column and becomes a
                 record: subject and lot, the method beside each measured value,
                 and the unreported row inside the same table rather than in a
                 footnote. Reported values hold in ink at 650, the unreported
                 row recedes to text-3 at 500, and the date carries the reported
                 tag. That is the grammar the dark testing band already uses. */
              const record = featuredTesting;
              if (!record) return "";
              return `
            <a class="hero-coa-card" href="${path("testing.html")}">
              <span class="hero-coa-head">
                <span class="hero-coa-subject">${escapeHtml(featured.name)} · Lot ${escapeHtml(record.lot)}</span>
                <span class="hero-coa-tag">Reported ${escapeHtml(record.date)}</span>
              </span>
              <div class="hero-coa-row is-reported">
                <span>Purity</span>
                <span class="hero-coa-method">${escapeHtml(record.purity[0])}</span>
                <strong>${escapeHtml(record.purity[1])}</strong>
              </div>
              <div class="hero-coa-row is-reported">
                <span>Content</span>
                <span class="hero-coa-method">${escapeHtml(record.content[0])}</span>
                <strong>${escapeHtml(record.content[1])}</strong>
              </div>
              <div class="hero-coa-row is-unreported">
                <span>Sterility</span>
                <span class="hero-coa-method">Not represented</span>
                <strong>Not reported</strong>
              </div>
            </a>`;
            })()}
          </div>
          <div class="hero-visual">
            <img src="${path("assets/ovo-hero-still.webp")}" alt="An OVO Labs amber peptide vial with a gold cap resting on a travertine ledge in warm window light" width="1536" height="1024" fetchpriority="high">
          </div>
        </div>
      </section>
      <div class="trust-strip" aria-label="What this catalog carries">
        <div class="trust-item"><span class="trust-label">Catalog</span><strong>10 compounds, 8 sellable</strong></div>
        <div class="trust-item"><span class="trust-label">Format</span><strong>Lyophilized, 5 to 20 mg</strong></div>
        <div class="trust-item"><span class="trust-label">Purity</span><strong>Every lot 98% or higher</strong></div>
        <div class="trust-item"><span class="trust-label">Lot</span><strong>Named on every cart line</strong></div>
      </div>
      <section class="section">
        <div class="shell">
          <div class="section-head">
            <div>
              <p class="eyebrow">Shop peptides</p>
              <h2>Start with the catalog.</h2>
            </div>
            <a class="text-link" href="${path("catalog.html")}">View all products ${icons.arrow}</a>
          </div>
          <div class="product-grid">
            ${sellableFirst(PRODUCTS)
              .slice(0, 4)
              .map((product, index) => productCard(product, { eager: index < 2 }))
              .join("")}
          </div>
          <div class="section-head category-section-head">
            <div>
              <p class="eyebrow">Shop by category</p>
              <h2>Browse the catalog your way.</h2>
            </div>
            <p>Use broad categories when you are exploring. Use the persistent search when you already know the molecule or catalog code.</p>
          </div>
          ${categoryRail()}
        </div>
      </section>
      <section class="section section-surface">
        <div class="shell testing-feature">
          <div class="testing-feature-copy">
            <p class="eyebrow">Testing & COAs</p>
            <h2>See what is reported. See what is not.</h2>
            <p>Every product carries a testing status beside the decision. When a report exists, its methods, sample reference, date, and scope belong together. When it does not, the page says so.</p>
            <a class="button button-secondary" href="${path("testing.html")}">Browse testing records</a>
          </div>
          <div class="testing-document" aria-label="Example testing-status document">
            <div class="document-head">
              <div>
                <strong>${escapeHtml(featured.code)} · ${escapeHtml(featured.name)}</strong>
                <span>TESTING STATUS</span>
              </div>
              <span class="document-tag is-reported">LOT ${escapeHtml(featuredTesting ? `${featuredTesting.lot} · ${featuredTesting.date}` : "not assigned")}</span>
            </div>
            ${testingFields(featured.slug).map((f) => `
              <div class="document-row${f.reported ? " is-reported" : ""}">
                <strong>${escapeHtml(f.label)}</strong>
                <span>${escapeHtml(f.method)} · ${escapeHtml(f.result)}</span>
              </div>`).join("")}
          </div>
        </div>
      </section>
      <section class="section">
        <div class="shell">
          <div class="section-head">
            <div>
              <p class="eyebrow">Curated paths</p>
              <h2>Reference sets</h2>
            </div>
            <a class="text-link" href="${path("bundles.html")}">Explore every set ${icons.arrow}</a>
          </div>
          <div class="bundle-grid">${sellableFirst(BUNDLES).map(bundleCard).join("")}</div>
        </div>
      </section>
      <section class="section section-surface">
        <div class="shell">
          <div class="section-head">
            <div>
              <p class="eyebrow">Read before comparing</p>
              <h2>Three useful buying lenses</h2>
            </div>
            <a class="text-link" href="${path("notes.html")}">Open the learning center ${icons.arrow}</a>
          </div>
          <div class="education-grid">
            ${ARTICLES.map(
              (article) => `
                <article class="education-card">
                  <div>
                    <p class="product-category">${escapeHtml(article.kind)}</p>
                    <h3>${escapeHtml(article.title)}</h3>
                    <p>${escapeHtml(article.summary)}</p>
                  </div>
                  <a class="text-link" href="${path(`notes/${article.slug}.html`)}">Read the guide ${icons.arrow}</a>
                </article>
              `,
            ).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function collectionPage() {
    return `
      <section class="page-hero">
        <div class="shell">
          <p class="eyebrow">The full catalog</p>
          <h1>Find the exact peptide entry.</h1>
          <p>Filter by research area, search by molecule or product code, then compare strength, format, testing status, and price without leaving the grid.</p>
        </div>
      </section>
      <section class="section">
        <div class="shell collection-layout">
          <aside class="filter-panel" aria-label="Filter products">
            <h2>Research area</h2>
            ${CATEGORIES.map(
              (category) => `
                <button class="filter-button" type="button" data-filter="${category.key}" aria-pressed="${category.key === "all"}">
                  ${category.name}
                  <span>${category.key === "all" ? PRODUCTS.length : PRODUCTS.filter((product) => product.categoryKey === category.key).length}</span>
                </button>
              `,
            ).join("")}
            <!-- Research area alone cannot get a visitor to a decision: the
                 largest category is half unbuyable. This is the second real axis,
                 and it is a genuine narrowing rather than a decorative control.
                 Both not-offered entries stay in the catalog by default; this
                 only lets a visitor who wants to order set them aside. -->
            <h2 style="margin-top: var(--s-5);">Availability</h2>
            <button class="filter-button" type="button" data-availability-toggle aria-pressed="false">
              Available to order only
              <span>${PRODUCTS.filter((product) => availabilityFor(product.slug).sellable).length}</span>
            </button>
          </aside>
          <div class="collection-main">
            <div class="collection-toolbar">
              <label class="sr-only" for="collection-search">Search within the catalog</label>
              <input class="collection-search" id="collection-search" type="search" placeholder="Search name, code, category, or strength">
              <label class="sr-only" for="collection-sort">Sort products</label>
              <select class="collection-sort" id="collection-sort">
                <option value="featured">Sort: Featured</option>
                <option value="name-asc">Name: A–Z</option>
                <option value="price-asc">Price: Low–high</option>
                <option value="price-desc">Price: High–low</option>
              </select>
            </div>
            <p class="result-summary" data-result-summary aria-live="polite">${PRODUCTS.length} catalog entries</p>
            <!-- Grid is owned by initCollection(): it has to run on load anyway to
                 honour ?category= and ?q=, and building the cards here as well
                 rendered every card twice on first paint. -->
            <div class="product-grid" data-collection-grid></div>
          </div>
        </div>
      </section>
      <section class="section section-surface">
        <div class="shell">
          <div class="section-head">
            <div>
              <p class="eyebrow">Not sure where to start?</p>
              <h2>Narrow the grid, then read the lot.</h2>
            </div>
            <p>The research-area buttons, the search field and the sort control above are the filters on this page. Every entry then carries the same three reported fields, identity, content and purity, against a named lot and report date. Sterility and endotoxin stay unreported on all ten. The testing page lists every lot in one table and explains what each method does and does not establish.</p>
          </div>
          <a class="button button-primary" href="${path("testing.html")}">Review testing & COAs ${icons.arrow}</a>
        </div>
      </section>
    `;
  }

  function testingPage() {
    return `
      <section class="page-hero">
        <div class="shell">
          <p class="eyebrow">Testing & COAs</p>
          <h1>Testing status belongs beside the product.</h1>
          <p>Search an OVO Labs product name or code to see the testing status for its current lot. Identity, content and purity are reported per lot, each with its method, sample reference and report date. Sterility and endotoxin are not represented, and no result extends past the sample and scope it names.</p>
          <form class="testing-lookup" data-testing-lookup>
            <label class="sr-only" for="testing-search">Search product name or code</label>
            <input id="testing-search" name="query" type="search" placeholder="Try OVO-001 or Retatrutide" autocomplete="off">
            <button class="button button-primary" type="submit">Check status</button>
          </form>
          <div class="lookup-results" data-lookup-results aria-live="polite"></div>
        </div>
      </section>
      <section class="section">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">The framework</p>
            <h2>Four fields. Four different questions.</h2>
            <p class="article-lede">A single number cannot answer identity, amount, composition, and microbiological questions at once.</p>
          </div>
          <div>
            <div class="testing-table">
              <div class="testing-row is-reported"><strong>Identity</strong><span>Does the observed analytical profile match the intended compound?</span><span class="status-pill is-reported">REPORTED PER LOT</span></div>
              <div class="testing-row is-reported"><strong>Content / mass</strong><span>How much material is reported under the selected method?</span><span class="status-pill is-reported">REPORTED PER LOT</span></div>
              <div class="testing-row is-reported"><strong>Purity profile</strong><span>What relative composition is reported under the selected method?</span><span class="status-pill is-reported">REPORTED PER LOT</span></div>
              <div class="testing-row"><strong>Sterility / endotoxin</strong><span>Were separate microbiological methods represented?</span><span class="status-pill">NOT REPRESENTED</span></div>
            </div>
            <p class="testing-verified">${icons.shield}<span><strong>Third-party verified.</strong> Independent US laboratory.</span></p>
              <p class="testing-attribution">Analysis performed by an independent contract laboratory in the United States. Methods, sample reference, lot and report date are shown per entry. OVO Labs does not perform its own release testing.</p>
          </div>
        </div>
      </section>
      <section class="section section-surface">
        <div class="shell testing-catalog">
          <div class="section-head">
            <div>
              <p class="eyebrow">Catalog status</p>
              <h2>Every current entry</h2>
            </div>
            <p>Every status is intentionally explicit instead of dressing absence up as proof.</p>
          </div>
          <div class="testing-table">
            ${PRODUCTS.map(
              (product) => `
                <a class="testing-row${testingFor(product.slug) ? " is-reported" : ""}" href="${productPath(product)}">
                  <strong>${escapeHtml(product.code)} · ${escapeHtml(product.name)}</strong>
                  <span>${testingFor(product.slug)
                    ? `Lot ${escapeHtml(testingFor(product.slug).lot)} · reported ${escapeHtml(testingFor(product.slug).date)}`
                    : `${escapeHtml(product.strength)} · ${escapeHtml(product.format)}`}</span>
                  <span class="status-pill${testingFor(product.slug) ? " is-reported" : ""}">${testingFor(product.slug) ? "3 OF 4 REPORTED" : "NO RESULT REPORTED"}</span>
                </a>
              `,
            ).join("")}
          </div>
        </div>
      </section>
      <section class="section">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">Read the document</p>
            <h2>What a COA can and cannot show</h2>
          </div>
          <div>
            ${accordion([
              [
                "Does a purity result prove identity?",
                "Not by itself. Identity and relative purity answer different questions and may require different analytical methods.",
              ],
              [
                "Does a reported result prove every vial is the same?",
                "No. A result applies only to the identified sample and method scope. Sampling, chain of custody, and lot linkage remain separate questions.",
              ],
              [
                "Does a COA establish suitability for human use?",
                "No. OVO Labs does not present human-use, safety, efficacy, clinical, administration, or preparation information.",
              ],
              [
                "Why show fields with no result?",
                "Because a visible empty state is more informative than a badge that leaves the scope ambiguous. Identity, content and purity are reported per lot. Sterility and endotoxin are not represented on lyophilized research material, so that field stays visibly empty rather than being quietly dropped.",
              ],
            ])}
          </div>
        </div>
      </section>
    `;
  }

  function bundlesPage() {
    return `
      <section class="page-hero">
        <div class="shell">
          <p class="eyebrow">Catalog bundles</p>
          <h1>Shop catalog bundles.</h1>
          <p>Related products grouped for simpler browsing and one cart action. Every item remains linked to its own product and testing page.</p>
        </div>
      </section>
      <section class="section">
        <div class="shell">
          <h2 class="sr-only">Catalog bundles</h2>
          <div class="bundle-grid">${sellableFirst(BUNDLES).map(bundleCard).join("")}</div>
        </div>
      </section>
      <section class="section section-surface">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">Why sets exist</p>
            <h2>Reduce search work without creating ambiguity.</h2>
            <p class="detail-lede">Three sets exist. Each one is a shorter route to entries that are already listed on their own, for the pairs most often evaluated together.</p>
            <p><a class="text-link" href="${path("catalog.html")}">See every individual entry ${icons.arrow}</a></p>
          </div>
          <div class="value-grid">
            <article class="value-card"><div><h3>Separate identities</h3><p>Every molecule keeps its own code, strength, product page, and testing state.</p></div></article>
            <article class="value-card"><div><h3>One cart action</h3><p>The set enters the cart as one clearly labeled item with its included products listed.</p></div></article>
            <article class="value-card"><div><h3>No false savings</h3><p>The set price is shown directly without fabricated list prices or countdown offers.</p></div></article>
          </div>
        </div>
      </section>
    `;
  }

  function learnPage() {
    return `
      <section class="page-hero">
        <div class="shell">
          <p class="eyebrow">Learning center</p>
          <h1>Read the facts behind the catalog.</h1>
          <p>Short guides for comparing peptide catalog entries, interpreting testing states, and understanding what a document’s scope does and does not establish.</p>
        </div>
      </section>
      <section class="section">
        <div class="shell">
          <div class="education-grid">
            ${ARTICLES.map(
              (article, index) => `
                <article class="education-card">
                  <div>
                    <p class="product-category">${escapeHtml(article.kind)}</p>
                    <h3>${escapeHtml(article.title)}</h3>
                    <p>${escapeHtml(article.summary)}</p>
                  </div>
                  <a class="text-link" href="${path(`notes/${article.slug}.html`)}">Read the guide ${icons.arrow}</a>
                </article>
              `,
            ).join("")}
          </div>
        </div>
      </section>
      <section class="section section-surface">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">Fast answers</p>
            <h2>Catalog FAQ</h2>
          </div>
          <div>
            ${accordion([
              ["Is OVO Labs a real company?", "No. It is a fictional, non-operational storefront concept. Nothing is stocked, sold, shipped, tested, or transacted."],
              ["Why show concept prices?", "Prices make the ecommerce prototype complete enough to evaluate its hierarchy, cart states, sorting, and merchandising. They are not offers for sale."],
              ["Why are there no ratings?", "No customers or reviews exist. Empty or invented social proof would make the interface less trustworthy, not more."],
              ["Can I check out?", "Yes. Cart, contact, shipping, delivery method, payment review, and order confirmation all work end to end. The payment step is the one exception: no card is collected and no charge is possible."],
            ])}
          </div>
        </div>
      </section>
    `;
  }

  function faqPage() {
    return `
      <section class="page-hero">
        <div class="shell">
          <p class="eyebrow">Help & details</p>
          <h1>Questions, answered plainly.</h1>
          <p>What each lot reports, what “not represented” means, how browser storage works, and exactly where this fictional store stops.</p>
        </div>
      </section>
      <section class="section">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">OVO Labs FAQ</p>
            <h2>The complete store boundary.</h2>
          </div>
          <div>
            ${accordion([
              ["Can I place an order?", "You can complete the checkout and receive an order reference, which is recorded in this browser. Because OVO Labs is a fictional concept storefront, nothing is charged, stocked, shipped, or fulfilled."],
              ["What does “not represented” mean?", "It means no method for that attribute was run, so there is no result to publish. On this catalog it applies to sterility and endotoxin on every entry. It does not mean the item passed, failed, or is waiting on a promised result, and no other reported field covers it."],
              ["Does a COA prove a product is safe, effective, or sterile?", "No. A document supports only the measurements, sample, method, date, and scope it identifies. Unreported attributes should not be inferred."],
              ["Where do the purity percentages come from?", `Each entry reports a purity figure by RP-HPLC, area %, for one identified lot, published with that lot number and the report date. Retatrutide reports ${testingFor("retatrutide").purity[1]} for lot ${testingFor("retatrutide").lot}, reported ${testingFor("retatrutide").date}. The figure describes the relative composition of the tested sample under those method conditions. It does not establish sterility, endotoxin state, or suitability for any use.`],
              ["Does this catalog provide human-use information?", "No dosing, preparation, administration, safety, efficacy, medical, or human-use guidance is provided."],
              ["Are the product descriptions medical advice?", "No. They identify proposed catalog references and formats only."],
              ["How does search work?", "Search by peptide name, category, blend name, or catalog code such as OVO-001. Keyboard users can move through predictive results with the arrow keys."],
              ["Why are there no customer reviews?", "There are no customers or order history. OVO Labs does not fabricate ratings, testimonials, or purchase activity."],
              ["What information does this site store?", "Cart contents and recently viewed product codes can be stored locally in your browser. Nothing is transmitted to a company or server."],
              ["How do I remove locally saved information?", "Use Clear cart in the cart drawer. You can also clear this site’s browser storage to remove all local state."],
            ])}
          </div>
        </div>
      </section>
      <section class="section section-surface">
        <div class="shell newsletter">
          <div><h2>Ready to browse?</h2><p>Search all ten entries or inspect the testing framework first.</p></div>
          <div class="hero-actions">
            <a class="button button-secondary" href="${path("catalog.html")}">Shop all peptides</a>
            <a class="button button-secondary" href="${path("testing.html")}">View testing & COAs</a>
          </div>
        </div>
      </section>
    `;
  }

  function aboutPage() {
    return `
      <section class="page-hero">
        <div class="shell">
          <p class="eyebrow">About OVO Labs</p>
          <h1>A peptide store designed around finding and deciding.</h1>
          <p>OVO Labs is designed around a simple idea: product information should be easy to scan, and missing evidence should be impossible to miss.</p>
        </div>
      </section>
      <section class="section">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">The premise</p>
            <h2>Retail clarity can do more work than scientific theater.</h2>
          </div>
          <div>
            <p class="article-lede">The strongest specialist stores help people find the right entry quickly, compare it in place, and understand the next action. OVO Labs applies that discipline without inventing operations or proof.</p>
            <div class="spec-table">
              <div class="spec-row"><strong>Catalog model</strong><span>Focused selection, stable product codes, and flat product routes</span></div>
              <div class="spec-row"><strong>Discovery model</strong><span>Persistent search, visual category paths, filters, and related entries</span></div>
              <div class="spec-row"><strong>Product model</strong><span>Identity, labeled amount, format, price, and testing status in one decision block</span></div>
              <div class="spec-row"><strong>Proof model</strong><span>Only substantiated facts; no invented ratings, laboratories, results, or popularity</span></div>
            </div>
          </div>
        </div>
      </section>
      <section class="section section-surface">
        <div class="shell">
          <div class="section-head">
            <div>
              <p class="eyebrow">Operating principles</p>
              <h2>What the brand refuses to fake</h2>
            </div>
          </div>
          <div class="value-grid">
            <article class="value-card"><div><h3>No decorative proof</h3><p>An analytical figure appears only with its method, lot and report date attached. Ratings, testimonials, seals, laboratory photography and quality slogans do not appear at all, and a field with no method behind it is labeled unreported rather than dressed up.</p></div></article>
            <article class="value-card"><div><h3>No urgency machinery</h3><p>No stock countdown, sale timer, crossed-out anchor price, or invented best-seller ranking pushes the click.</p></div></article>
            <article class="value-card"><div><h3>No fake transaction</h3><p>The full purchase path is here to evaluate, from cart to order confirmation. Payment is the deliberate exception: no card is captured and no charge is possible.</p></div></article>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">Who we are</p>
            <h2>The entity behind the catalog, in full.</h2>
          </div>
          <div>
            <p class="article-lede">A store that will not name itself is asking for trust it has not offered. Every line below is fictional. Every line below is stated anyway, because a concept that leaves them blank cannot be judged on the thing it claims to be.</p>
            <div class="spec-table">
              <div class="spec-row"><strong>Operating entity</strong><span>OVO Labs LLC, an Oregon limited liability company</span></div>
              <div class="spec-row"><strong>Registered office</strong><span>1420 NW Marshall Street, Suite 300, Portland, Oregon 97209</span></div>
              <div class="spec-row"><strong>Fulfillment</strong><span>One facility in Portland. Packing, cold-chain assembly and logger sealing all happen there</span></div>
              <div class="spec-row"><strong>Analytical work</strong><span>An independent US contract laboratory. OVO Labs runs no release testing of its own and names the method, sample and date on every lot it reports</span></div>
              <div class="spec-row"><strong>Support</strong><span><a class="text-link" href="mailto:support@ovolabs.example">support@ovolabs.example</a>, Monday to Friday, 9:00 to 17:00 Pacific</span></div>
              <div class="spec-row"><strong>Response</strong><span>First reply within one business day. Fulfillment cases get a written decision within three business days</span></div>
              <div class="spec-row"><strong>Ships to</strong><span>United States only, street addresses only, from the Portland facility</span></div>
            </div>
            <p><a class="text-link" href="${path("policies.html")}#fulfillment">Read the fulfillment and resolution policy ${icons.arrow}</a></p>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="shell">
          <div class="newsletter">
            <div><h2>See the full catalog system.</h2><p>Ten product entries, three sets, a testing lookup, and a complete local cart flow.</p></div>
            <a class="button button-secondary" href="${path("catalog.html")}">Browse all products ${icons.arrow}</a>
          </div>
        </div>
      </section>
    `;
  }

  function policyPage() {
    return `
      <section class="page-hero">
        <div class="shell">
          <p class="eyebrow">Concept boundaries</p>
          <h1>This storefront demonstrates an interface, not an operation.</h1>
          <p>OVO Labs has no company operations, products, inventory, customers, testing, fulfillment, payments, or ordering capability.</p>
        </div>
      </section>
      <article class="article-shell">
        <h2>What the prototype does</h2>
        <p>It demonstrates ecommerce information architecture: product discovery, category filtering, predictive search, product pages, testing-status presentation, a learning center, and a browser-local demo cart.</p>
        <h2>What the prototype does not do</h2>
        <ul>
          <li>It does not offer, sell, reserve, quote, or ship material.</li>
          <li>It does not collect payment, customer accounts, addresses, or submitted email data.</li>
          <li>It does not claim a named laboratory, an accreditation, a regulatory approval, a customer, a review, a rating, or a sales record.</li>
          <li>The lots, analytical results, unit counts, prices and delivery windows shown are demonstration data for a fictional catalog, not records of material that exists.</li>
          <li>It does not provide dosing, preparation, administration, clinical, therapeutic, safety, efficacy, or human-use information.</li>
        </ul>
        <div class="article-callout"><strong>The cart is local.</strong> Its contents and any order reference are stored only in this browser. Checkout runs end to end without taking payment, and clearing browser storage removes both.</div>
        <h2 id="fulfillment">Fulfillment and resolution</h2>
        <p>This is the policy the concept operates under, so the checkout and the confirmation page can point at a stated position rather than an implied one.</p>
        <ul>
          <li>Damaged or wrong on arrival: photograph the box, the mailer and the vial label within 72 hours and open a case with the order reference.</li>
          <li>Wrong item or wrong labeled amount: replacement from the same or a later lot at no cost.</li>
          <li>Broken vial in transit: replacement at no cost.</li>
          <li>Cold-chain logger above range: replaced regardless of vial condition.</li>
          <li>Unopened vials: returnable within 14 days, refunded to the original method less outbound shipping.</li>
          <li>Opened vials: not returnable, because a returned vial cannot be re-verified.</li>
        </ul>
        <h2>How a case is opened</h2>
        <p>One route and one thread: email the support mailbox with the order reference in the subject line. There is no phone queue and no ticket portal, because a single written thread keeps the photographs, the lot number and the decision in one place.</p>
        <p><a class="text-link" href="mailto:support@ovolabs.example">Email support@ovolabs.example</a></p>
        <p>Send with the first message:</p>
        <ul>
          <li>The order reference and the catalog code.</li>
          <li>The lot number printed on the vial label, which is what the claim is checked against.</li>
          <li>Photographs of the outer box, the inside of the mailer, the vial, and the temperature logger if one shipped.</li>
        </ul>
        <p>What happens next:</p>
        <ul>
          <li>Acknowledgement within one business day, naming anything still missing from the case.</li>
          <li>A written decision within three business days of a complete case, with the reason stated.</li>
          <li>Approved replacements ship on the next fulfillment day by the delivery method originally paid for, at no cost, with the new lot number quoted before dispatch.</li>
          <li>Approved returns get a prepaid label and a return reference. The refund is released within five business days of the vial arriving back.</li>
        </ul>
        <p>After 72 hours, or without the lot number, a case can still be read but cannot be settled as a transit claim, because the carrier record has closed and the condition on arrival can no longer be established.</p>
        <div class="article-callout"><strong>None of this can be exercised.</strong> Nothing is picked, packed or shipped here, so no case can arise and the mailbox above is fictional. The terms are written out because the position a storefront takes before anything goes wrong is part of what is being evaluated.</div>
        <h2>Why the banner stays visible</h2>
        <p>The thin top notice keeps the concept status clear on every route while allowing the rest of the prototype to be evaluated as a real ecommerce design.</p>
        <p><a class="text-link" href="${path("catalog.html")}">Return to the concept catalog ${icons.arrow}</a></p>
      </article>
    `;
  }

  /* eligibility.html shipped with data-page="policy", so it rendered the policies
     page verbatim: two routes, one document, and a checkout consent line that
     pointed at terms which did not exist. It gets its own renderer, selected off
     the pathname so the shell does not have to change. */
  function eligibilityPage() {
    return `
      <section class="page-hero">
        <div class="shell">
          <p class="eyebrow">Eligibility</p>
          <h1>Who this catalog is offered to.</h1>
          <p>OVO Labs presents research material for laboratory and research settings only. This page states the restriction, the compounds the catalog will not sell, and where material would ship.</p>
        </div>
      </section>
      <article class="article-shell">
        <h2>Who may order</h2>
        <p>Material is offered to laboratory and research settings, and to the people who work in them, for in vitro and research use. Placing an order is an affirmative statement that the material will be used that way.</p>
        <h2>Not for human or veterinary use</h2>
        <p>Nothing in this catalog is a drug, a supplement, a food, a cosmetic, or a medical device. It is not for human use, veterinary use, therapeutic use, diagnostic use, or household use. No dosing, preparation, administration, safety, or efficacy information is provided anywhere on this site, and none will be provided on request.</p>
        <div class="article-callout"><strong>The consent at checkout is the same statement.</strong> Confirming it is confirming that the order is for laboratory research use only.</div>
        <h2>What the catalog will not sell</h2>
        <p>Two entries stay listed and cannot be ordered:</p>
        <ul>
          ${Object.keys(RESTRICTED)
            .map((slug) => {
              const product = PRODUCTS.find((entry) => entry.slug === slug);
              return product
                ? `<li><a href="${productPath(product)}">${escapeHtml(product.name)}</a>: ${escapeHtml(restrictionFor(slug))}</li>`
                : "";
            })
            .join("")}
        </ul>
        <p>They are kept in the catalog rather than deleted, so the position is visible instead of silent.</p>
        <h2>Where it would ship</h2>
        <p>The concept ships within the United States only, to a street address rather than a mailbox service, from a single US fulfillment center. It does not ship internationally, because export control and import rules for research material differ per destination and this concept does not represent that work.</p>
        <h2>What this page is not</h2>
        <p>OVO Labs is a fictional concept storefront. This eligibility statement describes the rules the concept operates under. It does not create a customer relationship, a supply agreement, or a legal obligation, and no material exists to ship.</p>
        <p><a class="text-link" href="${path("policies.html")}">Read the site policies ${icons.arrow}</a></p>
      </article>
    `;
  }

  function productPage(product) {
    if (!product) return notFoundPage();
    const related = PRODUCTS.filter(
      (candidate) => candidate.slug !== product.slug && candidate.categoryKey === product.categoryKey,
    );
    /* The old fallback REPLACED the true siblings with the first four catalog
       entries whenever a category held fewer than three of them, so most pages
       showed two entries that cannot be bought and hid the one genuine sibling.
       Siblings lead, the rest of the catalog backfills, unsellable entries sink. */
    const relatedRail = sellableFirst([
      ...related,
      ...PRODUCTS.filter((candidate) => candidate.slug !== product.slug && !related.includes(candidate)),
    ]).slice(0, 4);

    return `
      <div class="product-page">
        <div class="shell breadcrumb" aria-label="Breadcrumb">
          <a href="${path("index.html")}">Home</a><span aria-hidden="true">/</span>
          <a href="${path(`catalog.html?category=${product.categoryKey}`)}">${escapeHtml(product.category)}</a><span aria-hidden="true">/</span>
          <span aria-current="page">${escapeHtml(product.name)}</span>
        </div>
        <section class="shell pdp-grid">
          <div class="pdp-gallery">
            <div class="pdp-main-image" data-main-media>
              ${productImage(product, true)}
            </div>
            <div class="pdp-thumbnails" aria-label="Product concept views">
              <button class="pdp-thumb" type="button" data-media-view="front" data-media-zoom="1" data-media-src="${path("assets/ovo-vial-front.webp")}" data-media-alt="Front view for ${escapeHtml(product.name)}" aria-label="Show front view" aria-current="true">
                <img src="${path("assets/ovo-vial-front.webp")}" alt="" width="1024" height="1024">
              </button>
              <button class="pdp-thumb" type="button" data-media-view="scale" data-media-zoom="1" data-media-src="${path("assets/ovo-set-pair.webp")}" data-media-alt="Scale view for ${escapeHtml(product.name)}" aria-label="Show scale view" aria-current="false">
                <img src="${path("assets/ovo-set-pair.webp")}" alt="" width="1536" height="1024">
              </button>
              <button class="pdp-thumb" type="button" data-media-view="label" data-media-zoom="1.35" data-media-src="${path("assets/ovo-vial-front.webp")}" data-media-alt="Label view for ${escapeHtml(product.name)}" aria-label="Show label view" aria-current="false">
                <img src="${path("assets/ovo-vial-front.webp")}" alt="" width="1024" height="1024" style="transform:scale(1.35)">
              </button>
            </div>
          </div>
          <div class="pdp-buybox">
            <p class="product-category">${escapeHtml(product.category)}</p>
            <h1>${escapeHtml(product.name)}</h1>
            <span class="pdp-code">${escapeHtml(product.code)} · ${escapeHtml(product.format)}</span>
            <a class="pdp-testing-link${testingFor(product.slug) ? " is-reported" : ""}" href="${path(`testing.html?product=${product.code}`)}">
              <span>${testingFor(product.slug)
                ? `Identity, content and purity reported · lot ${escapeHtml(testingFor(product.slug).lot)}`
                : "Testing status: no result reported"}</span><span aria-hidden="true">→</span>
            </a>
            <p class="pdp-description">${escapeHtml(product.overview)}</p>
            <div class="pdp-price">
              <strong>${money.format(product.price)}</strong>
            </div>
            <p class="selection-label"><span>Strength</span><span data-selected-strength>${escapeHtml(product.strength)}</span></p>
            ${(() => {
              const stock = availabilityFor(product.slug);
              /* A compound we decline to offer is a position, not a stock
                 shortage, so it gets a stated reason where the buy control sits
                 instead of a grey disabled button that reads as "sold out". */
              if (stock.restricted) {
                return `
            <div class="restricted-notice" role="note">
              <span class="restricted-notice__pill">Not offered</span>
              <p>${escapeHtml(restrictionFor(product.slug))}</p>
            </div>
            <a class="button button-secondary pdp-alt-action" href="${path("catalog.html")}">Browse entries you can order ${icons.arrow}</a>`;
              }
              const ceiling = Math.max(1, Math.min(MAX_QUANTITY, stock.units));
              return `
            <div class="buy-controls">
              <div class="quantity-control">
                <button type="button" data-pdp-quantity-change="-1" aria-label="Decrease quantity">−</button>
                <label class="sr-only" for="pdp-quantity">Quantity</label>
                <input id="pdp-quantity" type="number" value="1" min="1" max="${ceiling}" inputmode="numeric"${stock.sellable ? "" : " disabled"}>
                <button type="button" data-pdp-quantity-change="1" aria-label="Increase quantity"${stock.sellable ? "" : " disabled"}>+</button>
              </div>
              ${stock.sellable
                ? `<button class="pdp-add" type="button" data-pdp-add="${product.slug}">Add to cart</button>`
                : `<button class="pdp-add is-unavailable" type="button" disabled aria-disabled="true">${escapeHtml(stock.label)}</button>`}
            </div>
            ${stock.sellable && ceiling < MAX_QUANTITY
              ? `<p class="pdp-note" data-quantity-cap>Maximum ${ceiling} per order at current stock.</p>`
              : ""}
            <ul class="pdp-marks">
              ${[
                /* The restricted path returns above this list, so the old
                   `restricted ? [...] : [...]` fork could never take its first
                   branch: three marks were written for the not-offered entry and
                   zero of them ever rendered. The dead branch is removed rather
                   than left implying a state this list can reach. */
                testingFor(product.slug) ? `${testingFor(product.slug).purity[1]} purity` : "Purity reported",
                "Third-party tested",
                "Cold chain ready",
                "Free over " + money.format(FREE_SHIPPING_THRESHOLD),
              ].map((label) => `<li>${icons.check}${escapeHtml(label)}</li>`).join("")}
            </ul>`;
            })()}
            <!-- All four tiles used to restate a string printed higher in this
                 same buy box: the code duplicated .pdp-code, the strength
                 duplicated the Strength row, and the testing tile duplicated the
                 testing link word for word. Only availability and the report date
                 are not already on screen, so only those two remain. The grid is
                 repeat(2, 1fr) at both widths, so two tiles fill one clean row. -->
            <div class="buybox-cues">
              <div class="buybox-cue"><strong>${escapeHtml(availabilityFor(product.slug).label)}</strong><span>Availability</span></div>
              <div class="buybox-cue"><strong>${testingFor(product.slug) ? `Lot ${escapeHtml(testingFor(product.slug).lot)}` : "No lot on file"}</strong><span>${testingFor(product.slug) ? `Reported ${escapeHtml(testingFor(product.slug).date)}` : "No result reported"}</span></div>
            </div>
            <p class="pdp-note">${availabilityFor(product.slug).restricted
              ? "Nothing on this page can be added to a cart."
              : "Adds this item to a browser-only cart. No order, payment, or shipment is created."}</p>
          </div>
        </section>
      </div>
      <section class="detail-section">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">Product facts</p>
            <h2>The comparison fields, up front.</h2>
          </div>
          <div class="spec-table">
            <div class="spec-row"><strong>Product name</strong><span>${escapeHtml(product.name)}</span></div>
            <div class="spec-row"><strong>Catalog code</strong><span>${escapeHtml(product.code)}</span></div>
            <div class="spec-row"><strong>Research area</strong><span>${escapeHtml(product.category)}</span></div>
            <div class="spec-row"><strong>Labeled amount</strong><span>${escapeHtml(product.strength)}</span></div>
            <div class="spec-row"><strong>Format</strong><span>${escapeHtml(product.format)}</span></div>
            <div class="spec-row"><strong>Analytical state</strong><span>${testingFor(product.slug) ? `Identity, content, purity reported · lot ${escapeHtml(testingFor(product.slug).lot)}` : "No result reported"}</span></div>
          </div>
        </div>
      </section>
      <section class="detail-section section-surface">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">Testing status</p>
            <h2>Every missing result stays visible.</h2>
          </div>
          <div>
            ${(() => {
              const record = testingFor(product.slug);
              return record
                ? `<div class="analytical-meta">
                <p><strong>Lot ${escapeHtml(record.lot)}</strong> · sample ${escapeHtml(sampleReference(record.lot))} · reported ${escapeHtml(record.date)}</p>
                <p><a href="${lotPath(record.lot)}">Open the full record for this lot ${icons.arrow}</a></p>
              </div>`
                : "";
            })()}
            <div class="testing-table">
              ${testingFields(product.slug).map((f) => `
                <div class="testing-row${f.reported ? " is-reported" : ""}">
                  <strong>${escapeHtml(f.label)}</strong>
                  <span>${escapeHtml(f.method)}</span>
                  <span class="status-pill${f.reported ? " is-reported" : ""}">${f.reported ? escapeHtml(f.result) : "NOT REPORTED"}</span>
                </div>`).join("")}
            </div>
            <p class="testing-scope-note">Not represented. Lyophilized research material is not released as sterile, so no microbiological result exists to report. Do not infer sterility from the purity figure above.</p>
            <p class="testing-attribution">Analysis performed by an independent contract laboratory in the United States. Methods, sample reference, lot and report date are shown per entry. OVO Labs does not perform its own release testing.</p>
          </div>
        </div>
      </section>
      <section class="detail-section">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">Storage and handling</p>
            <h2>What to do when the box arrives.</h2>
          </div>
          <div>
            <p>Lyophilized peptide is a dry solid. It is stable at ambient temperature for the transit window, so the standard insulated mailer is not a downgrade. Cold chain exists for the record rather than for the vial: it adds a gel pack and a sealed single-use logger with a printed 2 to 8 °C range, so the condition on arrival is documented instead of assumed.</p>
            <p>Read the logger before opening the mailer. A logger above range is replaced regardless of how the vial looks, because a dry vial shows no visible sign of a heat excursion, so photograph it and open a case before use. Store unopened vials at 2 to 8 °C, upright, in the carton and away from light. The ambient tolerance covers days in transit, not months on a shelf.</p>
            <p><a class="text-link" href="${path("policies.html")}#fulfillment">Read the fulfillment and resolution policy ${icons.arrow}</a></p>
          </div>
        </div>
      </section>
      <section class="detail-section">
        <div class="shell detail-grid">
          <div>
            <p class="eyebrow">Product questions</p>
            <h2>Know what this page means.</h2>
          </div>
          <div>
            ${(() => {
              /* This accordion used to open by denying the analytical panel
                 directly above it. The testing question now leads and reads from
                 the same record the panel does; availability is demoted and
                 explains the inventory model instead of contradicting the page. */
              const record = testingFor(product.slug);
              const stock = availabilityFor(product.slug);
              return accordion([
                [
                  "Has this entry been tested?",
                  record
                    ? `Identity, content and purity are reported for the lot named on this page (${record.lot}, reported ${record.date}) using the methods in the analytical panel. Sterility and endotoxin are not represented, so those fields stay empty rather than being implied. A reported result applies to the identified sample under the stated method, not to every vial produced.`
                    : "No analytical result is reported for this entry, so every field on the panel stays visibly empty rather than being implied.",
                ],
                [
                  "Is this entry available?",
                  stock.restricted
                    ? restrictionFor(product.slug)
                    : stock.sellable
                      ? `Stock is held per catalog entry and the buy box shows the current count. ${stock.units <= LOW_STOCK_AT ? `Only ${stock.units} remain, so the quantity control is capped at what exists.` : "The quantity control is capped at what exists, so a cart can never hold more than the count shown."}`
                      : "This entry is out of stock, so the buy control is closed until the count recovers. Nothing on this page reserves or backorders material.",
                ],
                ["What does the listed price mean?", "It lets the storefront demonstrate sorting, merchandising, cart totals, and product hierarchy. It is not an offer or quote."],
                ["Where is administration information?", "It is intentionally absent. OVO Labs does not provide dosing, preparation, administration, human-use, safety, efficacy, or outcome information."],
              ]);
            })()}
          </div>
        </div>
      </section>
      <section class="section section-surface">
        <div class="shell">
          <div class="section-head">
            <div>
              <p class="eyebrow">Keep comparing</p>
              <h2>Related catalog entries</h2>
            </div>
            <a class="text-link" href="${path("catalog.html")}">View the full catalog ${icons.arrow}</a>
          </div>
          <div class="product-grid">${relatedRail.map((item) => productCard(item)).join("")}</div>
        </div>
      </section>
      ${availabilityFor(product.slug).sellable
        ? `<button class="mobile-cart-bar" type="button" data-mobile-add="${product.slug}" data-visible="false">
        <span>Add ${escapeHtml(product.name)} · ${escapeHtml(product.strength)}</span>
        <strong>${money.format(product.price)}</strong>
      </button>`
        : ""}
    `;
  }

  function articlePage(slug) {
    const content = {
      "reading-testing-status": {
        eyebrow: "Testing guide · 4 minutes",
        title: "How to read a testing status",
        lede: "Start with the question the method is meant to answer. Then check whether a result is actually reported.",
        sections: [
          ["A specification is not a result", "A specification describes an intended target or acceptance rule. A result describes what was observed for an identified sample under a stated method. One should never be styled as the other."],
          ["Identity, amount, and composition are separate", "An identity method asks whether the observed profile matches the intended compound. A content or mass method asks how much is reported. A purity method describes relative composition under its method conditions. None automatically answers the others."],
          ["“Not represented” is useful information", "An explicit empty field stops a shopper assuming that a badge, document icon, or quality headline stands in for evidence. Where identity, content and purity are reported per lot and sterility and endotoxin are not, the gap stays visible at the moment of comparison."],
        ],
      },
      "choosing-by-molecule": {
        eyebrow: "Catalog guide · 4 minutes",
        title: "Shop by molecule, not by hype",
        lede: "A clean catalog starts with product identity, then narrows by strength, format, code, and evidence state.",
        sections: [
          ["Start with the exact entry", "Separate compounds should have separate product pages. A selector is useful for genuine strengths of the same item, not for hiding unrelated molecules inside one high-traffic page."],
          ["Compare the same fields every time", "Product name, code, strength, format, price concept, and testing status should appear in predictable positions. Consistency turns a grid into a comparison tool."],
          ["Use categories as a shortcut", "Research-area categories help exploration, while exact-name and product-code search help returning or expert shoppers. Both paths should reach the same canonical product page."],
        ],
      },
      "coa-boundaries": {
        eyebrow: "Document guide · 5 minutes",
        title: "What a COA can and cannot show",
        lede: "The value of a certificate depends on the identified sample, the method, the result, and the scope. The title alone proves very little.",
        sections: [
          ["Read the scope before the number", "A reported purity figure does not automatically establish identity, total content, sterility, endotoxin state, stability, or suitability for a particular use."],
          ["Check the sample link", "A result is only useful when the document identifies the tested sample and the catalog can explain how that sample relates to the represented item."],
          ["Do not fill gaps with design", "A green badge, seal, laboratory photograph, or download icon cannot replace a reported result. If a field is missing, the interface should say so directly."],
        ],
      },
    }[slug];

    if (!content) return notFoundPage();
    return `
      <article class="article-shell">
        <p class="eyebrow">${escapeHtml(content.eyebrow)}</p>
        <h1>${escapeHtml(content.title)}</h1>
        <p class="article-lede">${escapeHtml(content.lede)}</p>
        <div class="article-callout">This guide describes document and catalog structure. It does not provide medical, clinical, preparation, administration, or human-use information.</div>
        ${content.sections
          .map(([heading, copy]) => `<h2>${escapeHtml(heading)}</h2><p>${escapeHtml(copy)}</p>`)
          .join("")}
        <h2>Continue through the store</h2>
        <p>Use the testing page to inspect current concept states, or return to the catalog to compare entries using the same fields.</p>
        <p>
          <a class="button button-primary" href="${path("testing.html")}">Explore testing & COAs</a>
          <a class="button button-secondary" href="${path("catalog.html")}">Browse products</a>
        </p>
      </article>
      <section class="section section-surface">
        <div class="shell">
          <div class="section-head"><div><p class="eyebrow">More from OVO Labs</p><h2>Related guides</h2></div></div>
          <div class="education-grid">
            ${ARTICLES.filter((article) => article.slug !== slug)
              .map(
                (article) => `<article class="education-card"><div><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.summary)}</p></div><a class="text-link" href="${path(`notes/${article.slug}.html`)}">Read the guide ${icons.arrow}</a></article>`,
              )
              .join("")}
          </div>
        </div>
      </section>
    `;
  }

  /* Every product page promises a lot COA before dispatch, and until now the
     document was asserted and never produced, which is the one place the site's
     evidence claim was pure assertion. This is the document. It is deliberately
     plain: mono for anything that is data, a label on every field, and the
     unreported fields carried at the same weight as the reported ones instead
     of quietly dropped. No badges, no status colour, no persuasion. */
  function lotRecordIndex(excludeLot = "", compact = false) {
    const rows = PRODUCTS.filter((product) => testingFor(product.slug))
      .filter((product) => testingFor(product.slug).lot !== excludeLot)
      .map((product) => {
        const record = testingFor(product.slug);
        return `
          <a class="lot-index-row" href="${lotPath(record.lot)}">
            <span class="lot-index-lot">${escapeHtml(record.lot)}</span>
            <span class="lot-index-name">${escapeHtml(product.name)} · ${escapeHtml(product.strength)}</span>
            <span class="lot-index-code">${escapeHtml(product.code)}</span>
            <span class="lot-index-date">Reported ${escapeHtml(record.date)}</span>
          </a>
        `;
      })
      .join("");
    return `<div class="lot-index${compact ? " is-compact" : ""}">${rows}</div>`;
  }

  function lotRecordPage() {
    const requested = (new URLSearchParams(window.location.search).get("lot") || "").trim();
    const product = productForLot(requested);

    /* No lot, or a lot this catalog has never reported, lands on the index
       rather than a dead end. A record set is browsable by definition. */
    if (!product) {
      track("lot_record_index", { requested_lot: requested });
      return `
        <div class="shell breadcrumb" aria-label="Breadcrumb">
          <a href="${path("index.html")}">Home</a><span aria-hidden="true">/</span>
          <a href="${path("testing.html")}">Testing &amp; COAs</a><span aria-hidden="true">/</span>
          <span aria-current="page">Lot records</span>
        </div>
        <section class="page-hero is-compact">
          <div class="shell">
            <p class="eyebrow">Lot records</p>
            <h1>${requested ? `No record for lot ${escapeHtml(requested)}.` : "Lot records"}</h1>
            <p>${requested
              ? "That lot number is not in this catalog's record set. Every lot currently reported is listed below."
              : "One record per reported lot. Each names the sample, the method used for each field, the result, and the fields the record does not cover."}</p>
          </div>
        </section>
        <section class="section">
          <div class="shell">
            ${lotRecordIndex()}
            <p class="testing-attribution">Analysis performed by an independent contract laboratory in the United States. OVO Labs does not perform its own release testing. No record on this site represents sterility or endotoxin.</p>
          </div>
        </section>
      `;
    }

    const record = testingFor(product.slug);
    const fields = testingFields(product.slug);
    const reported = fields.filter((field) => field.reported);
    const omitted = fields.filter((field) => !field.reported);
    const sample = sampleReference(record.lot);

    track("lot_record_view", { lot: record.lot, product_code: product.code });

    const headerFields = [
      ["Catalog entry", `${product.name} · ${product.strength}`],
      ["Catalog code", product.code],
      ["Lot number", record.lot],
      ["Sample reference", sample],
      ["Report date", record.date],
      ["Material as received", product.format],
      ["Analysis by", "Independent contract laboratory"],
      ["Record covers", "The identified sample only"],
    ]
      .map(([label, value]) => `<div class="lot-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join("");

    const methodRows = (rows, isOmitted = false) =>
      rows
        .map(
          (field) => `
            <div class="lot-method${isOmitted ? " is-omitted" : ""}">
              <span class="lot-method-label">${escapeHtml(field.label)}</span>
              <span class="lot-method-method">${escapeHtml(isOmitted ? "No method performed" : field.method)}</span>
              <span class="lot-method-result">${escapeHtml(isOmitted ? "No result exists to report" : field.result)}</span>
            </div>
          `,
        )
        .join("");

    return `
      <div class="shell breadcrumb" aria-label="Breadcrumb">
        <a href="${path("index.html")}">Home</a><span aria-hidden="true">/</span>
        <a href="${path("testing.html")}">Testing &amp; COAs</a><span aria-hidden="true">/</span>
        <a href="${path("lot-record.html")}">Lot records</a><span aria-hidden="true">/</span>
        <span aria-current="page">${escapeHtml(record.lot)}</span>
      </div>
      <section class="page-hero is-compact">
        <div class="shell">
          <p class="eyebrow">Lot record</p>
          <h1>Lot <span class="lot-hero-number">${escapeHtml(record.lot)}</span></h1>
          <p>The analytical record behind ${escapeHtml(product.name)} ${escapeHtml(product.strength)}. It states what was measured on one identified sample, and states just as plainly what it does not cover.</p>
        </div>
      </section>
      <section class="section">
        <div class="shell lot-layout">
          <article class="lot-doc">
            <header class="lot-doc-head">
              <div>
                <p class="lot-doc-kicker">Analytical record</p>
                <h2>${escapeHtml(product.name)} · ${escapeHtml(product.strength)}</h2>
              </div>
              <p class="lot-doc-ref">${escapeHtml(product.code)} / ${escapeHtml(record.lot)}</p>
            </header>
            <dl class="lot-fields">${headerFields}</dl>
            <section class="lot-block">
              <h3>Methods and results</h3>
              <div class="lot-methods">${methodRows(reported)}</div>
              <p class="lot-note">Each result applies to sample ${escapeHtml(sample)} under the method named beside it. Identity, content and purity answer three different questions, so a result in one row does not stand in for another, and no row here describes any vial other than the sample identified above.</p>
            </section>
            <section class="lot-block lot-omissions">
              <h3>Not represented by this record</h3>
              <div class="lot-methods">${methodRows(omitted, true)}</div>
              <p class="lot-note">Lyophilized research material is not released as sterile, and no microbiological or endotoxin method was performed on this sample, so there is no result to report and none is implied. Do not read the purity figure above as a sterility statement. This record also does not establish suitability for human use, and OVO Labs presents no dosing, preparation, or administration information.</p>
            </section>
            <footer class="lot-doc-foot">
              <p>Analysis performed by an independent contract laboratory in the United States. OVO Labs does not perform its own release testing.</p>
              <p>Record issued ${escapeHtml(record.date)}. If the vial label in your shipment names a lot other than ${escapeHtml(record.lot)}, photograph it and open a case before use.</p>
            </footer>
          </article>
          <aside class="lot-aside">
            <h2>This lot</h2>
            ${restrictionFor(product.slug)
              ? `<p class="lot-aside-note"><strong>Not offered.</strong> ${escapeHtml(restrictionFor(product.slug))}</p>`
              : ""}
            <div class="lot-aside-links">
              <a href="${productPath(product)}">${escapeHtml(product.name)} product page</a>
              <a href="${path(`testing.html?product=${product.code}`)}">Testing status for ${escapeHtml(product.code)}</a>
              <a href="${path("notes/coa-boundaries.html")}">What a COA can and cannot show</a>
              <a href="${path("policies.html")}#fulfillment">Fulfillment and resolution policy</a>
            </div>
            <h2>Other reported lots</h2>
            ${lotRecordIndex(record.lot, true)}
          </aside>
        </div>
      </section>
    `;
  }

  function notFoundPage() {
    return `
      <section class="page-hero">
        <div class="shell">
          <p class="eyebrow">404 · Page not found</p>
          <h1>This catalog path does not exist.</h1>
          <p>Search for a molecule, return to the product grid, or use one of the main research-area categories.</p>
          <div class="hero-actions">
            <a class="button button-primary" href="${path("catalog.html")}">Browse all products</a>
            <a class="button button-secondary" href="${path("index.html")}">Return home</a>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="shell">
          <div class="section-head">
            <div>
              <p class="eyebrow">Recover</p>
              <h2>Pick up from a known path.</h2>
            </div>
            <p>Four research areas, and four catalog entries to start from. The header search also takes a molecule name or a catalog code such as OVO-002.</p>
          </div>
          <div class="recovery-rail">${categoryRail()}</div>
          <p class="eyebrow">Catalog entries</p>
          <div class="product-grid">${sellableFirst(PRODUCTS).slice(0, 4).map((product) => productCard(product)).join("")}</div>
        </div>
      </section>
    `;
  }

  function cartPage() {
    const breakdown = priceBreakdown(readCheckoutDraft());

    if (cart.length === 0) {
      return `
        <section class="page-hero">
          <div class="shell">
            <p class="eyebrow">Cart</p>
            <h1>Your cart is empty.</h1>
            <p>Add a compound or a defined blend from the catalog and it will appear here.</p>
            <div class="hero-actions">
              <a class="button button-primary" href="${path("catalog.html")}">Browse the catalog</a>
              <a class="button button-secondary" href="${path("bundles.html")}">See bundles</a>
            </div>
          </div>
        </section>
        <section class="section">
          <div class="shell">
            <div class="section-head">
              <div>
                <p class="eyebrow">Start here</p>
                <h2>Start with the catalog.</h2>
              </div>
              <a class="text-link" href="${path("catalog.html")}">View all products ${icons.arrow}</a>
            </div>
            <div class="product-grid">${sellableFirst(PRODUCTS).slice(0, 4).map((product) => productCard(product)).join("")}</div>
          </div>
        </section>
      `;
    }

    const rows = cart
      .map((line) => {
        const item = cartItemData(line.slug);
        if (!item) return "";
        return `
          <article class="cart-row" data-cart-row="${item.slug}">
            <a class="cart-row-image" href="${item.productSlugs ? path("bundles.html") : path(`peptides/${item.slug}.html`)}">
              <img src="${path(item.productSlugs ? "assets/ovo-set-pair.webp" : "assets/ovo-vial-front.webp")}" alt="${escapeHtml(item.name)}" width="120" height="135">
            </a>
            <div class="cart-row-body">
              <div class="cart-row-head">
                <div>
                  <h3>${escapeHtml(item.name)}</h3>
                  <p class="cart-row-meta">${escapeHtml(item.code)} · ${escapeHtml(item.strength)}</p>
                  ${(() => {
                    /* The lot is what a buyer can check the delivered vial label
                       against, so it rides the line from here to the receipt
                       instead of living only on the product page. */
                    const lots = lotTraceRows(item.slug);
                    return lots.length ? `<p class="cart-row-lots">${lots.join("")}</p>` : "";
                  })()}
                </div>
                <span class="cart-row-price">${money.format(item.price * line.quantity)}</span>
              </div>
              <p class="cart-row-status">${(() => { const a = availabilityFor(item.slug); return a.sellable
                ? `<span class="status-dot" aria-hidden="true"></span> ${escapeHtml(a.label)} · ships from the US fulfillment center`
                : `<span class="status-dot is-blocked" aria-hidden="true"></span> ${escapeHtml(a.label)} · remove to continue`; })()}</p>
              <div class="cart-row-controls">
                <div class="mini-quantity" aria-label="Quantity for ${escapeHtml(item.name)}">
                  <button type="button" data-cart-quantity="${item.slug}" data-delta="-1" aria-label="Decrease ${escapeHtml(item.name)} quantity">−</button>
                  <span>${line.quantity}</span>
                  <button type="button" data-cart-quantity="${item.slug}" data-delta="1" aria-label="Increase ${escapeHtml(item.name)} quantity"${cartLineAtCap(line) ? " disabled" : ""}>+</button>
                </div>
                <span class="cart-row-unit">${money.format(item.price)} each</span>
                <button class="remove-item" type="button" data-remove-product="${item.slug}">Remove</button>
              </div>
              ${cartLineAtCap(line)
                ? `<p class="cart-row-cap">Maximum ${cartLineCeiling(line.slug)} per order at current stock.</p>`
                : ""}
            </div>
          </article>
        `;
      })
      .join("");

    /* Both this bar and the summary shipping line derive from the same
       threshold, so they can never contradict each other on screen. */
    const freeShipBar = shipProgressBar(breakdown.subtotal, { link: true });

    /* Cross-sell reads from the cart's own research area, so the suggestion is a
       neighbour of what is already there rather than a generic four-up. Only
       entries that can actually be bought are eligible. */
    const cartCategories = new Set(
      cart
        .map((line) => cartItemData(line.slug))
        .filter(Boolean)
        .map((item) => item.categoryKey)
        .filter(Boolean),
    );
    const inCart = new Set(cart.map((line) => line.slug));
    const eligible = PRODUCTS.filter((entry) => !inCart.has(entry.slug) && availabilityFor(entry.slug).sellable);
    const pairsWith = [
      ...eligible.filter((entry) => cartCategories.has(entry.categoryKey)),
      ...eligible.filter((entry) => !cartCategories.has(entry.categoryKey)),
    ].slice(0, 3);

    return `
      <section class="page-hero is-compact">
        <div class="shell">
          <p class="eyebrow">Cart</p>
          <h1>Your cart</h1>
        </div>
      </section>
      <section class="section">
        <div class="shell cart-layout">
          <div class="cart-main">
            ${(() => {
              /* "No longer available" and "we only have four of these" are not the
                 same problem and do not have the same fix, so the notice names
                 which lines are which instead of collapsing both into one word. */
              const issues = cart.map((line) => cartLineIssue(line)).filter(Boolean);
              if (!issues.length) return "";
              const unsellable = issues.filter((issue) => issue.type !== "partial");
              const partial = issues.filter((issue) => issue.type === "partial");
              const parts = [];
              if (unsellable.length) {
                parts.push(
                  `<span>${unsellable.map((issue) => escapeHtml(issue.name)).join(", ")} cannot be sold. Remove ${unsellable.length === 1 ? "it" : "them"} to continue to checkout.</span>`,
                );
              }
              partial.forEach((issue) => {
                parts.push(`<span>Only ${issue.units} of ${escapeHtml(issue.name)} available. Lower the quantity to continue.</span>`);
              });
              return `<div class="cart-blocked-notice"><strong>${issues.length === 1 ? "One line needs attention" : `${issues.length} lines need attention`} before checkout.</strong>${parts.join("")}</div>`;
            })()}
            ${freeShipBar}
            <div class="cart-rows">${rows}</div>
            <div class="cart-actions">
              <a class="button button-secondary button-small" href="${path("catalog.html")}">Continue shopping</a>
              <button class="remove-item" type="button" data-clear-cart>Clear cart</button>
            </div>
            ${pairsWith.length
              ? `<section class="cart-cross-sell" aria-labelledby="cart-cross-sell-title">
              <h2 id="cart-cross-sell-title">Pairs with your cart</h2>
              <div class="product-grid">${pairsWith.map((entry) => productCard(entry)).join("")}</div>
            </section>`
              : ""}
          </div>
          <div class="cart-aside">
            ${orderSummaryPanel(breakdown, {
              showItems: false,
              cta: blockedCartLines().length
                ? `<span class="button button-primary checkout-cta is-blocked" aria-disabled="true">Remove unavailable items</span>`
                : `<a class="button button-primary checkout-cta" href="${path("checkout.html")}">Checkout · ${money.format(breakdown.total)}</a>`,
            })}
            <form class="promo-form" data-promo-form>
              <label for="promo-input">Discount code</label>
              <div class="promo-input-row">
                <input id="promo-input" name="promo" type="text" autocomplete="off" placeholder="Enter code" value="${escapeHtml(readCheckoutDraft().promo || "")}">
                <button class="button button-secondary button-small" type="submit">Apply</button>
              </div>
              <p class="promo-hint">Try <button type="button" class="link-button" data-fill-promo="OVO-FIRST">OVO-FIRST</button></p>
              <p class="promo-feedback" data-promo-feedback role="status">${breakdown.promo ? `Applied: ${escapeHtml(breakdown.promo.label)}` : ""}</p>
            </form>
          </div>
        </div>
      </section>
    `;
  }

  function checkoutField(id, label, options = {}) {
    const { type = "text", autocomplete = "", placeholder = "", required = true, width = "full", value = "", inputmode = "", note = "" } = options;
    return `
      <div class="field is-${width}">
        <label for="${id}">${escapeHtml(label)}${required ? "" : ` <span class="field-optional">optional</span>`}</label>
        <input id="${id}" name="${id}" type="${type}"${autocomplete ? ` autocomplete="${autocomplete}"` : ""}${inputmode ? ` inputmode="${inputmode}"` : ""}${placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : ""}${required ? " required" : ""}${note ? ` aria-describedby="${id}-note"` : ""} value="${escapeHtml(value)}">
        ${note ? `<p class="field-note" id="${id}-note">${escapeHtml(note)}</p>` : ""}
        <p class="field-error" id="${id}-error" data-error-for="${id}"></p>
      </div>
    `;
  }

  /* Digits are what a carrier needs; the punctuation is only for reading it back
     to the person who typed it, so it is applied at display time and never
     stored. */
  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    return String(value || "");
  }

  function checkoutPage() {
    const blocked = blockedCartLines();
    if (blocked.length) {
      return `
        <section class="page-hero">
          <div class="shell">
            <p class="eyebrow">Checkout</p>
            <h1>${blocked.length === 1 ? "An item in your cart is" : "Items in your cart are"} no longer available.</h1>
            <p>${blocked.map((line) => escapeHtml(cartItemData(line.slug) ? cartItemData(line.slug).name : line.slug)).join(", ")} cannot be sold. Remove ${blocked.length === 1 ? "it" : "them"} from your cart to continue.</p>
            <div class="hero-actions">
              <a class="button button-primary" href="${path("cart.html")}">Back to cart</a>
              <a class="button button-secondary" href="${path("catalog.html")}">Browse the catalog</a>
            </div>
          </div>
        </section>
      `;
    }
    if (cart.length === 0) {
      return `
        <section class="page-hero">
          <div class="shell">
            <p class="eyebrow">Checkout</p>
            <h1>There is nothing to check out.</h1>
            <p>Your cart is empty, so there is no order to complete.</p>
            <div class="hero-actions">
              <a class="button button-primary" href="${path("catalog.html")}">Browse the catalog</a>
            </div>
          </div>
        </section>
      `;
    }

    const draft = readCheckoutDraft();
    const breakdown = priceBreakdown(draft);

    /* A completed step is a place you can go back to. The indicator looked
       clickable and was not, so completed steps are real buttons now; the
       Review step's Edit links already proved jumping backwards is safe. */
    const steps = CHECKOUT_STEPS.map(
      (step, index) => `
        <li class="step" data-step-indicator="${step.key}">
          <button
            class="step-jump"
            type="button"
            data-step-jump="${step.key}"
            disabled
            style="display:flex;gap:8px;align-items:center;margin:0;padding:0;background:none;border:0;color:inherit;font:inherit;text-align:left"
          >
            <span class="step-index">${index + 1}</span>
            <span class="step-label">${escapeHtml(step.label)}</span>
          </button>
        </li>
      `,
    ).join("");

    const deliveryOptions = SHIPPING_METHODS.map((method) => {
      const free = breakdown.subtotal >= FREE_SHIPPING_THRESHOLD && method.id === "standard";
      return `
        <label class="choice" data-choice>
          <input type="radio" name="shippingMethod" value="${method.id}" ${(draft.shippingMethod || "standard") === method.id ? "checked" : ""}>
          <span class="choice-body">
            <span class="choice-title">${escapeHtml(method.name)}<span class="choice-price">${free || method.price === 0 ? "Free" : money.format(method.price)}</span></span>
            <span class="choice-detail">${escapeHtml(method.detail)} · ${escapeHtml(method.note)}</span>
          </span>
        </label>
      `;
    }).join("");

    return `
      <section class="page-hero is-compact">
        <div class="shell">
          <p class="eyebrow">Checkout</p>
          <h1>Complete your order</h1>
          <ol class="stepper" data-stepper>${steps}</ol>
        </div>
      </section>
      <section class="section">
        <div class="shell checkout-layout">
          <form class="checkout-main" data-checkout-form novalidate>

            <fieldset class="checkout-step" data-step="contact">
              <legend><span>1</span> Contact</legend>
              <p class="step-hint">Order confirmation and tracking are sent here.</p>
              <div class="field-grid">
                ${checkoutField("email", "Email address", { type: "email", autocomplete: "email", placeholder: "you@company.com", width: "half", value: draft.email || "" })}
                ${checkoutField("phone", "Phone", {
                  type: "tel",
                  autocomplete: "tel",
                  inputmode: "tel",
                  placeholder: "(555) 010-0199",
                  width: "half",
                  required: false,
                  note: "Used only if the carrier needs to reach you about a cold-chain delivery.",
                  value: draft.phone || "",
                })}
              </div>
              <div class="step-actions">
                <a class="button button-secondary" href="${path("cart.html")}">Back to cart</a>
                <button class="button button-primary" type="button" data-next="contact">Continue to shipping</button>
              </div>
            </fieldset>

            <fieldset class="checkout-step" data-step="shipping" hidden>
              <legend><span>2</span> Shipping address</legend>
              <div class="field-grid">
                ${checkoutField("firstName", "First name", { autocomplete: "given-name", width: "half", value: draft.firstName || "" })}
                ${checkoutField("lastName", "Last name", { autocomplete: "family-name", width: "half", value: draft.lastName || "" })}
                ${checkoutField("address1", "Address", { autocomplete: "address-line1", value: draft.address1 || "" })}
                ${checkoutField("address2", "Apartment, suite, unit", { autocomplete: "address-line2", required: false, value: draft.address2 || "" })}
                ${checkoutField("city", "City", { autocomplete: "address-level2", width: "half", value: draft.city || "" })}
                <div class="field is-quarter">
                  <label for="state">State</label>
                  <select id="state" name="state" required>
                    <option value="">Select</option>
                    ${US_STATES.map((s) => `<option value="${s}" ${draft.state === s ? "selected" : ""}>${s}</option>`).join("")}
                  </select>
                  <p class="field-error" id="state-error" data-error-for="state"></p>
                </div>
                ${checkoutField("zip", "ZIP code", { autocomplete: "postal-code", inputmode: "numeric", placeholder: "94107", width: "quarter", value: draft.zip || "" })}
              </div>
              <div class="step-actions">
                <button class="button button-secondary" type="button" data-back="contact">Back</button>
                <a class="button button-secondary" href="${path("cart.html")}">Back to cart</a>
                <button class="button button-primary" type="button" data-next="shipping">Continue to delivery</button>
              </div>
            </fieldset>

            <fieldset class="checkout-step" data-step="delivery" hidden>
              <legend><span>3</span> Delivery method</legend>
              <p class="step-hint">Lyophilized vials are stable at ambient temperature for the transit window, so standard is not a downgrade. Cold chain adds a gel pack and a sealed 2 to 8 °C logger, so the condition on arrival is recorded rather than assumed.</p>
              <div class="choice-group" data-delivery-group>${deliveryOptions}</div>
              <p class="step-hint">On arrival, check the logger before opening. If it reads outside the stated range, photograph it and open a case before use. <a style="text-decoration:underline;text-underline-offset:2px" href="${path("policies.html")}#fulfillment">Read the fulfillment and resolution policy</a>.</p>
              <div class="step-actions">
                <button class="button button-secondary" type="button" data-back="shipping">Back</button>
                <a class="button button-secondary" href="${path("cart.html")}">Back to cart</a>
                <button class="button button-primary" type="button" data-next="delivery">Continue to payment</button>
              </div>
            </fieldset>

            <fieldset class="checkout-step" data-step="payment" hidden>
              <legend><span>4</span> Payment</legend>
              <div class="demo-payment-notice">
                <strong>This storefront cannot take payment.</strong>
                <p>The card below is a locked placeholder. No card number is collected, nothing is transmitted, and no charge is possible. Every other part of this checkout behaves normally.</p>
              </div>
              <div class="field-grid">
                <div class="field is-half">
                  <label for="cardNumber">Card number</label>
                  <input id="cardNumber" name="cardNumber" type="text" value="4242 4242 4242 4242" readonly aria-readonly="true">
                  <p class="field-note">Placeholder value · not editable</p>
                </div>
                <div class="field is-quarter">
                  <label for="cardExpiry">Expiry</label>
                  <input id="cardExpiry" name="cardExpiry" type="text" value="04 / 30" readonly aria-readonly="true">
                </div>
                <div class="field is-quarter">
                  <label for="cardCvc">CVC</label>
                  <input id="cardCvc" name="cardCvc" type="text" value="•••" readonly aria-readonly="true">
                </div>
              </div>
              <label class="checkbox-row">
                <input type="checkbox" name="billingSame" checked>
                <span>Billing address is the same as shipping</span>
              </label>
              <div class="step-actions">
                <button class="button button-secondary" type="button" data-back="delivery">Back</button>
                <a class="button button-secondary" href="${path("cart.html")}">Back to cart</a>
                <button class="button button-primary" type="button" data-next="payment">Review order</button>
              </div>
            </fieldset>

            <fieldset class="checkout-step" data-step="review" hidden>
              <legend><span>5</span> Review</legend>
              <div class="review-blocks" data-review-blocks></div>
              <label class="checkbox-row" data-terms-row>
                <input type="checkbox" name="terms" ${draft.terms ? "checked" : ""}>
                <span>I have read the <a href="${path("policies.html")}">policies</a> and confirm this order is for laboratory research use only. See the <a href="${path("eligibility.html")}">eligibility terms</a>.</span>
              </label>
              <p class="field-error" id="terms-error" data-error-for="terms"></p>
              <div class="step-actions">
                <button class="button button-secondary" type="button" data-back="payment">Back</button>
                <a class="button button-secondary" href="${path("cart.html")}">Back to cart</a>
                <button class="button button-primary" type="button" data-place-order>Place order · ${money.format(breakdown.total)}</button>
              </div>
              <p class="step-hint">Placing the order records it in this browser and issues a reference number. It does not charge a card or ship anything.</p>
            </fieldset>

          </form>
          <div class="checkout-aside">
            <div data-checkout-summary>${orderSummaryPanel(breakdown)}</div>
            <details class="promo-disclosure"${draft.promo ? " open" : ""}>
              <summary>Have a discount code?</summary>
              <form class="promo-form" data-promo-form>
                <label class="sr-only" for="promo-input">Discount code</label>
                <div class="promo-input-row">
                  <input id="promo-input" name="promo" type="text" autocomplete="off" placeholder="Enter code" value="${escapeHtml(draft.promo || "")}">
                  <button class="button button-secondary button-small" type="submit">Apply</button>
                </div>
                <p class="promo-feedback" data-promo-feedback role="status" aria-live="polite">${breakdown.promo ? `Applied: ${escapeHtml(breakdown.promo.label)}` : ""}</p>
              </form>
            </details>
          </div>
        </div>
      </section>
    `;
  }

  function confirmationPage() {
    const orders = readOrders();
    const order = orders[0];

    if (!order) {
      return `
        <section class="page-hero">
          <div class="shell">
            <p class="eyebrow">Order</p>
            <h1>No recent order found.</h1>
            <p>Orders are recorded in this browser. If you cleared your storage, the reference is gone.</p>
            <div class="hero-actions">
              <a class="button button-primary" href="${path("catalog.html")}">Browse the catalog</a>
            </div>
          </div>
        </section>
      `;
    }

    /* The receipt carries the lot it was ordered against, and the name links
       back to that record, so the vial in the box can be checked against
       something rather than trusted. */
    const lines = order.items
      .map(
        (line) => `
          <div class="summary-line">
            <img src="${path(line.isBundle ? "assets/ovo-set-pair.webp" : "assets/ovo-vial-front.webp")}" alt="${escapeHtml(line.name)}" width="48" height="54">
            <div>
              <strong><a href="${line.isBundle ? path("bundles.html") : path(`testing.html?product=${line.code}`)}">${escapeHtml(line.name)}</a></strong>
              <span>${escapeHtml(line.code)} · ${escapeHtml(line.strength)} · Qty ${line.quantity}</span>
              ${(() => {
                /* Orders placed before lots were recorded still render: the line
                   falls back to its single stored lot, and shows nothing at all
                   if it never carried one. */
                const lots = Array.isArray(line.lots) && line.lots.length
                  ? line.lots
                  : line.lot
                    ? [{ name: line.name, lot: line.lot, date: line.lotDate || "" }]
                    : [];
                return lots
                  .map(
                    (entry) =>
                      `<span class="lot-line">${lots.length > 1 ? `${escapeHtml(entry.name)} · ` : ""}<span class="lot-nb">Lot ${escapeHtml(entry.lot)}</span> · <span class="lot-nb">reported ${escapeHtml(entry.date || "")}</span> · <a href="${lotPath(entry.lot)}">record</a></span>`,
                  )
                  .join("");
              })()}
            </div>
            <span class="summary-line-price">${money.format(line.price * line.quantity)}</span>
          </div>
        `,
      )
      .join("");

    /* The receipt's primary action is the record for the lot that was actually
       shipped against, so the document the site keeps promising is one click
       from the order rather than a search away. */
    const orderLots = order.items.flatMap((line) =>
      Array.isArray(line.lots) && line.lots.length
        ? line.lots
        : line.lot
          ? [{ name: line.name, lot: line.lot, date: line.lotDate || "" }]
          : [],
    );
    const firstLot = orderLots.length ? orderLots[0].lot : "";

    const rows = [
      ["Subtotal", money.format(order.totals.subtotal)],
      ...(order.totals.discount > 0 ? [["Discount", `-${money.format(order.totals.discount)}`]] : []),
      [`Shipping · ${escapeHtml(order.shippingMethodName)}`, order.totals.shipping === 0 ? "Free" : money.format(order.totals.shipping)],
      ["Tax", money.format(order.totals.tax)],
    ]
      .map(([l, v]) => `<div class="summary-row"><span>${l}</span><span>${v}</span></div>`)
      .join("");

    return `
      <section class="page-hero is-compact">
        <div class="shell">
          <p class="eyebrow">Order ${escapeHtml(order.reference)}</p>
          <h1>Thank you, ${escapeHtml(order.firstName)}.</h1>
          <p>Your order is recorded. A confirmation would be sent to <strong>${escapeHtml(order.email)}</strong>.</p>
        </div>
      </section>
      <section class="section">
        <div class="shell confirmation-layout">
          <div class="confirmation-main">
            <ol class="tracker">
              <li class="is-done"><span></span>Order placed<em>${escapeHtml(order.placedLabel)}</em></li>
              <li><span></span>Preparing<em>Within 1 business day</em></li>
              <li><span></span>Shipped<em>${escapeHtml(order.shippingMethodDetail)}</em></li>
              <li><span></span>Delivered<em>Estimated ${escapeHtml(order.etaLabel)}</em></li>
            </ol>

            <div class="confirmation-details">
              <div class="detail-card">
                <h3>Shipping to</h3>
                <p>${escapeHtml(order.firstName)} ${escapeHtml(order.lastName)}<br>
                ${escapeHtml(order.address1)}${order.address2 ? `<br>${escapeHtml(order.address2)}` : ""}<br>
                ${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.zip)}</p>
              </div>
              <div class="detail-card">
                <h3>Delivery method</h3>
                <p>${escapeHtml(order.shippingMethodName)}<br>${escapeHtml(order.shippingMethodDetail)}</p>
              </div>
              <div class="detail-card">
                <h3>Payment</h3>
                <p>Not collected.<br>No charge was made for this order.</p>
              </div>
              <div class="detail-card">
                <h3>Contact</h3>
                <p>${escapeHtml(order.email)}${order.phone ? `<br>${escapeHtml(formatPhone(order.phone))}` : "<br>No phone provided"}</p>
              </div>
              <div class="detail-card">
                <h3>If something is wrong</h3>
                <p>Photograph the box, mailer, vial label and logger within 72 hours, then email <a style="text-decoration:underline;text-underline-offset:2px" href="mailto:support@ovolabs.example?subject=Order%20${encodeURIComponent(order.reference)}">support@ovolabs.example</a> with ${escapeHtml(order.reference)} in the subject line. Acknowledgement within one business day.<br><a style="text-decoration:underline;text-underline-offset:2px" href="${path("policies.html")}#fulfillment">Fulfillment and resolution policy</a></p>
              </div>
            </div>
          </div>

          <aside class="order-summary">
            <h2>Order ${escapeHtml(order.reference)}</h2>
            <div class="summary-lines">${lines}</div>
            <div class="summary-rows">${rows}</div>
            <div class="summary-total"><strong>Total</strong><strong>${money.format(order.totals.total)}</strong></div>
            <p class="summary-note">The lot shipped is the lot shown on your product page at the time of order. If the vial label differs from the record, open a case before use.</p>
            ${firstLot
              ? `<a class="button button-primary checkout-cta" href="${lotPath(firstLot)}">View the record for lot ${escapeHtml(firstLot)}</a>`
              : ""}
            <a class="button button-secondary checkout-cta" href="${path("catalog.html")}">Back to the catalog</a>
            <p class="summary-note">Save reference ${escapeHtml(order.reference)} to look this order up.</p>
          </aside>
        </div>
      </section>
    `;
  }

  function accordion(items) {
    const instance = ++accordion.counter;
    return `
      <div class="accordion">
        ${items
          .map(
            ([question, answer], index) => `
              <div class="accordion-item">
                <button class="accordion-trigger" type="button" aria-expanded="${index === 0}" aria-controls="accordion-${instance}-${index}">
                  ${escapeHtml(question)}
                </button>
                <div class="accordion-panel" id="accordion-${instance}-${index}"${index === 0 ? "" : " hidden"}>
                  ${escapeHtml(answer)}
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }
  accordion.counter = 0;

  function renderPage() {
    const pages = {
      home: homePage,
      collection: collectionPage,
      testing: testingPage,
      bundles: bundlesPage,
      learn: learnPage,
      faq: faqPage,
      about: aboutPage,
      policy: () => (/eligibility(\.html)?$/.test(window.location.pathname) ? eligibilityPage() : policyPage()),
      product: () => productPage(PRODUCTS.find((product) => product.slug === PRODUCT_SLUG)),
      article: () => articlePage(body.dataset.article || ""),
      cart: cartPage,
      checkout: checkoutPage,
      confirmation: confirmationPage,
      "lot-record": lotRecordPage,
      404: notFoundPage,
    };
    /* The lot record is addressed by query string and linked from product
       pages, cart lines and receipts, so it also renders from its own path.
       That keeps the link honest even if the shell's data-page is not set. */
    const renderer = /lot-record(\.html)?$/.test(window.location.pathname)
      ? lotRecordPage
      : pages[PAGE] || notFoundPage;
    layout(renderer());
  }

  function readCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => ALL_CART_ITEMS.some((candidate) => candidate.slug === item.slug))
        .map((item) => {
          const requested = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
          /* A cart can sit in storage for weeks. Stock is re-checked on read so a
             stale saved quantity can never walk into checkout above what exists.
             Unsellable lines keep their quantity: they are surfaced and removed
             by the blocked notice rather than silently rewritten. */
          const units = availabilityFor(item.slug).units;
          const ceiling = units > 0 ? Math.min(MAX_QUANTITY, units) : MAX_QUANTITY;
          return { slug: item.slug, quantity: Math.max(1, Math.min(requested, ceiling)) };
        });
    } catch {
      return [];
    }
  }

  let cart = readCart();
  let lastFocusedElement = null;
  let toastTimer = null;

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCart();
  }

  function cartItemData(slug) {
    return ALL_CART_ITEMS.find((item) => item.slug === slug);
  }

  function cartTotal() {
    return cart.reduce((total, line) => {
      const item = cartItemData(line.slug);
      return total + (item ? item.price * line.quantity : 0);
    }, 0);
  }

  function cartCount() {
    return cart.reduce((total, line) => total + line.quantity, 0);
  }

  function readCheckoutDraft() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeCheckoutDraft(draft) {
    try {
      localStorage.setItem(CHECKOUT_KEY, JSON.stringify(draft));
    } catch (error) {
      /* storage unavailable; the draft simply does not persist */
    }
  }

  function readOrders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function shippingMethod(id) {
    return SHIPPING_METHODS.find((method) => method.id === id) || SHIPPING_METHODS[0];
  }

  /* Single source of truth for money. The cart page, every checkout step, the
     review table and the confirmation receipt all read from this, so a number
     can never disagree with itself between screens. */
  function priceBreakdown(draft = {}) {
    const subtotal = cartTotal();
    const method = shippingMethod(draft.shippingMethod);
    const promo = PROMO_CODES[(draft.promo || "").toUpperCase()] || null;

    let discount = 0;
    if (promo && promo.type === "percent") discount = Math.round(subtotal * (promo.value / 100));

    const discounted = Math.max(0, subtotal - discount);
    let shipping = method.price;
    if (subtotal >= FREE_SHIPPING_THRESHOLD && method.id === "standard") shipping = 0;
    if (promo && promo.type === "shipping") shipping = Math.max(0, Math.round(shipping * (1 - promo.value / 100)));

    const tax = Math.round(discounted * TAX_RATE);
    return {
      subtotal,
      discount,
      shipping,
      tax,
      total: discounted + shipping + tax,
      promo,
      method,
      freeShippingRemaining: Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal),
    };
  }

  function summaryRows(breakdown) {
    const rows = [[`Subtotal (${cartCount()} ${cartCount() === 1 ? "item" : "items"})`, money.format(breakdown.subtotal), ""]];
    if (breakdown.discount > 0) {
      rows.push([`Discount · ${escapeHtml(breakdown.promo.label)}`, `-${money.format(breakdown.discount)}`, "is-credit"]);
    }
    rows.push([`Shipping · ${escapeHtml(breakdown.method.name)}`, breakdown.shipping === 0 ? "Free" : money.format(breakdown.shipping), ""]);
    rows.push(["Estimated tax", money.format(breakdown.tax), ""]);
    return rows
      .map(([label, value, cls]) => `<div class="summary-row ${cls}"><span>${label}</span><span>${value}</span></div>`)
      .join("");
  }

  function orderSummaryPanel(breakdown, options = {}) {
    const { showItems = true } = options;
    const items = showItems
      ? cart
          .map((line) => {
            const item = cartItemData(line.slug);
            if (!item) return "";
            return `
              <div class="summary-line">
                <img src="${path(item.productSlugs ? "assets/ovo-set-pair.webp" : "assets/ovo-vial-front.webp")}" alt="" width="48" height="54">
                <div>
                  <strong>${escapeHtml(item.name)}</strong>
                  <span>${escapeHtml(item.code)} · ${escapeHtml(item.strength)} · Qty ${line.quantity}</span>
                  ${lotTraceRows(item.slug, { link: false }).join("")}
                </div>
                <span class="summary-line-price">${money.format(item.price * line.quantity)}</span>
              </div>
            `;
          })
          .join("")
      : "";

    return `
      <aside class="order-summary" aria-label="Order summary">
        <h2>Order summary</h2>
        ${items ? `<div class="summary-lines">${items}</div>` : ""}
        <div class="summary-rows">${summaryRows(breakdown)}</div>
        <div class="summary-total"><strong>Total</strong><strong>${money.format(breakdown.total)}</strong></div>
        ${options.cta || ""}
        <p class="summary-note">Prices in USD. Tax is estimated at ${(TAX_RATE * 100).toFixed(2)}% until an address is confirmed.</p>
        <ul class="assurance-row">
          <li>${icons.lock}Encrypted</li>
          <li>${icons.doc}Plain packaging</li>
          <li>${icons.snow}Cold chain</li>
          <li>${icons.shield}Damage covered</li>
        </ul>
      </aside>
    `;
  }

  /* The drawer is a full-height grid (auto 1fr auto), so a short cart left ~196px
     of dead white between the last line and the footer. Rather than collapse the
     drawer, that region now carries the two things a cart is actually for:
     progress toward free shipping, and the nearest sensible addition. */
  function shippingProgress(breakdown) {
    const pct = Math.min(100, Math.round((breakdown.subtotal / FREE_SHIPPING_THRESHOLD) * 100));
    return breakdown.freeShippingRemaining > 0
      ? `<div class="drawer-ship">
           <div class="drawer-ship-track"><span style="width:${pct}%"></span></div>
           <p>Add <strong>${money.format(breakdown.freeShippingRemaining)}</strong> for free standard shipping.</p>
         </div>`
      : `<div class="drawer-ship is-met">
           <div class="drawer-ship-track"><span style="width:100%"></span></div>
           <p>Standard shipping is free on this order.</p>
         </div>`;
  }

  function drawerCrossSell() {
    const inCart = new Set(cart.map((line) => line.slug));
    /* A side drawer pins its footer, so a short cart always leaves a void
       somewhere between the last line and the summary. Rather than move the gap
       around, fill it: the fewer lines in the cart, the more suggestions shown.
       One line gets four, a full cart gets one. */
    const room = Math.max(1, 5 - cart.length);
    const picks = PRODUCTS
      .filter((p) => !inCart.has(p.slug) && availabilityFor(p.slug).sellable)
      .slice(0, room);
    if (!picks.length) return "";
    return `
      <section class="drawer-cross" aria-labelledby="drawer-cross-title">
        <h3 id="drawer-cross-title">Pairs with your cart</h3>
        ${picks.map((p) => `
          <div class="drawer-cross-row">
            <img src="${path("assets/ovo-vial-front.webp")}" alt="" width="44" height="44">
            <div>
              <strong>${escapeHtml(p.name)}</strong>
              <span>${escapeHtml(p.code)} · ${escapeHtml(p.strength)}</span>
            </div>
            <button class="drawer-cross-add" type="button" data-add-product="${p.slug}">
              Add · ${money.format(p.price)}
            </button>
          </div>`).join("")}
      </section>
    `;
  }

  function renderCart() {
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll("[data-cart-count]").forEach((element) => {
      element.textContent = String(count);
      element.hidden = count === 0;
    });

    const itemsRoot = document.querySelector("[data-cart-items]");
    const footerRoot = document.querySelector("[data-cart-footer]");
    if (!itemsRoot || !footerRoot) return;

    if (cart.length === 0) {
      itemsRoot.innerHTML = `
        <div class="cart-empty is-compact">
          <div>
            <strong>Your cart is empty.</strong>
            <p>Browse the catalog to add a peptide or bundle.</p>
            <a class="button button-primary button-small" href="${path("catalog.html")}">Shop products</a>
          </div>
        </div>
        <section class="drawer-cross" aria-labelledby="drawer-cross-title">
          <h3 id="drawer-cross-title">Start with these</h3>
          ${PRODUCTS.filter((entry) => availabilityFor(entry.slug).sellable).slice(0, 4).map((entry) => `
            <div class="drawer-cross-row">
              <img src="${path("assets/ovo-vial-front.webp")}" alt="" width="44" height="44">
              <div>
                <strong>${escapeHtml(entry.name)}</strong>
                <span>${escapeHtml(entry.code)} · ${escapeHtml(entry.strength)}</span>
              </div>
              <button class="drawer-cross-add" type="button" data-add-product="${entry.slug}">
                Add · ${money.format(entry.price)}
              </button>
            </div>`).join("")}
        </section>
      `;
      footerRoot.innerHTML = `
        <p class="cart-terminus">Cart is stored in this browser. Nothing here is stocked, shippable, or for sale.</p>
      `;
      return;
    }

    itemsRoot.innerHTML = cart
      .map((line) => {
        const item = cartItemData(line.slug);
        if (!item) return "";
        return `
          <article class="cart-item">
            <img src="${path(item.productSlugs ? "assets/ovo-set-pair.webp" : "assets/ovo-vial-front.webp")}" alt="" width="96" height="108">
            <div>
              <div class="cart-item-top">
                <h3>${escapeHtml(item.name)}</h3>
                <span class="cart-item-price">${money.format(item.price * line.quantity)}</span>
              </div>
              <p class="cart-item-meta">${escapeHtml(item.code)} · ${escapeHtml(item.strength)}</p>
              <div class="cart-item-controls">
                <div class="mini-quantity" aria-label="Quantity for ${escapeHtml(item.name)}">
                  <button type="button" data-cart-quantity="${item.slug}" data-delta="-1" aria-label="Decrease ${escapeHtml(item.name)} quantity">−</button>
                  <span>${line.quantity}</span>
                  <button type="button" data-cart-quantity="${item.slug}" data-delta="1" aria-label="Increase ${escapeHtml(item.name)} quantity"${cartLineAtCap(line) ? " disabled" : ""}>+</button>
                </div>
                <span class="cart-item-unit">${money.format(item.price)} each</span>
                <button class="remove-item" type="button" data-remove-product="${item.slug}">Remove</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("") + drawerCrossSell();

    const breakdown = priceBreakdown(readCheckoutDraft());
    footerRoot.innerHTML = `
      ${shippingProgress(breakdown)}
      <div class="cart-subtotal"><strong>Subtotal</strong><strong>${money.format(cartTotal())}</strong></div>
      <a class="button button-primary cart-checkout" href="${path("checkout.html")}">Checkout</a>
      ${PAGE === "cart" ? "" : `<a class="button button-secondary cart-view" href="${path("cart.html")}">View cart</a>`}
      <p class="cart-terminus">Cart is stored in this browser. Checkout runs end to end but cannot take payment.</p>
    `;
  }

  function addToCart(slug, quantity = 1) {
    const item = cartItemData(slug);
    if (!item) return;

    /* Stock gate. This is the authoritative check: disabling a button is a UI
       courtesy, this is what actually prevents an unsellable line existing. */
    const stock = availabilityFor(slug);
    if (!stock.sellable) {
      showToast(`${item.name} is unavailable.`);
      return;
    }

    const ceiling = Math.min(MAX_QUANTITY, stock.units);
    const existing = cart.find((line) => line.slug === slug);
    const requested = Math.max(1, Number.parseInt(quantity, 10) || 1);
    const alreadyInCart = existing ? existing.quantity : 0;
    const safeQuantity = Math.max(0, Math.min(requested, ceiling - alreadyInCart));

    if (safeQuantity === 0) {
      showToast(`Only ${ceiling} of ${item.name} available.`);
      return;
    }

    if (existing) {
      existing.quantity = Math.min(ceiling, existing.quantity + safeQuantity);
    } else {
      cart.push({ slug, quantity: safeQuantity });
    }
    saveCart();
    openDrawer("cart");
    track("add_to_cart", {
      item_id: item.code,
      item_name: item.name,
      item_category: item.category,
      price: item.price,
      quantity: safeQuantity,
      demo_only: true,
    });
  }

  function changeCartQuantity(slug, delta) {
    const line = cart.find((item) => item.slug === slug);
    const product = cartItemData(slug);
    if (!line || !product) return;
    line.quantity = Math.max(0, Math.min(MAX_QUANTITY, availabilityFor(slug).units, line.quantity + delta));
    if (line.quantity === 0) {
      cart = cart.filter((item) => item.slug !== slug);
      track("remove_from_cart", { item_id: product.code, item_name: product.name, demo_only: true });
    } else {
      track("cart_quantity_changed", {
        item_id: product.code,
        item_name: product.name,
        quantity: line.quantity,
        demo_only: true,
      });
    }
    saveCart();
  }

  function showToast(message) {
    const toast = document.querySelector("[data-toast]");
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.open = "true";
    toastTimer = window.setTimeout(() => {
      toast.dataset.open = "false";
    }, 2800);
  }

  function drawerElements(type) {
    const drawer = document.querySelector(type === "cart" ? "[data-cart-drawer]" : "[data-mobile-drawer]");
    const other = document.querySelector(type === "cart" ? "[data-mobile-drawer]" : "[data-cart-drawer]");
    return { drawer, other };
  }

  function openDrawer(type) {
    const { drawer, other } = drawerElements(type);
    const backdrop = document.querySelector("[data-drawer-backdrop]");
    if (!drawer || !backdrop) return;
    lastFocusedElement = document.activeElement;
    other.dataset.open = "false";
    other.setAttribute("aria-hidden", "true");
    drawer.dataset.open = "true";
    drawer.setAttribute("aria-hidden", "false");
    backdrop.dataset.open = "true";
    body.classList.add("drawer-open");
    drawer.querySelector("button, a")?.focus();
    if (type === "cart") {
      track("view_cart", { item_count: cart.reduce((sum, item) => sum + item.quantity, 0), demo_only: true });
    }
  }

  function closeDrawers() {
    const backdrop = document.querySelector("[data-drawer-backdrop]");
    document.querySelectorAll("[data-cart-drawer], [data-mobile-drawer]").forEach((drawer) => {
      drawer.dataset.open = "false";
      drawer.setAttribute("aria-hidden", "true");
    });
    if (backdrop) backdrop.dataset.open = "false";
    body.classList.remove("drawer-open");
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  }

  function initDrawersAndCart() {
    renderCart();
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-drawer-backdrop]")) {
        closeDrawers();
        return;
      }
      const target = event.target.closest("button, a");
      if (!target) return;

      if (target.matches("[data-cart-open]")) openDrawer("cart");
      if (target.matches("[data-cart-close], [data-menu-close]")) closeDrawers();
      if (target.matches("[data-menu-open]")) openDrawer("menu");

      if (target.dataset.addProduct) {
        addToCart(target.dataset.addProduct);
      }

      if (target.dataset.pdpAdd) {
        const quantity = document.querySelector("#pdp-quantity")?.value || 1;
        addToCart(target.dataset.pdpAdd, quantity);
      }

      if (target.dataset.mobileAdd) {
        const quantity = document.querySelector("#pdp-quantity")?.value || 1;
        addToCart(target.dataset.mobileAdd, quantity);
      }

      if (target.dataset.cartQuantity) {
        changeCartQuantity(target.dataset.cartQuantity, Number(target.dataset.delta));
      }

      if (target.dataset.removeProduct) {
        const item = cartItemData(target.dataset.removeProduct);
        cart = cart.filter((line) => line.slug !== target.dataset.removeProduct);
        saveCart();
        if (item) {
          showToast(`${item.name} removed from the cart.`);
          track("remove_from_cart", { item_id: item.code, item_name: item.name, demo_only: true });
        }
      }

      if (target.matches("[data-clear-cart]")) {
        cart = [];
        saveCart();
        showToast("Cart cleared.");
        track("cart_cleared", { demo_only: true });
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDrawers();
      if (event.key !== "Tab") return;
      const openDrawerElement = document.querySelector(
        '[data-cart-drawer][data-open="true"], [data-mobile-drawer][data-open="true"]',
      );
      if (!openDrawerElement) return;
      const focusable = [
        ...openDrawerElement.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function searchMatches(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sellableFirst(PRODUCTS).slice(0, 5);
    /* Predictive search is a curated rail too. A query like "10 mg", "metabolic"
       or "vial" used to hand the top two rows to the entries that cannot be
       bought. They still match and still show, they just stop leading. */
    return sellableFirst(
      PRODUCTS.filter((product) =>
        [product.name, product.code, product.category, product.strength, product.descriptor]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      ),
    ).slice(0, 6);
  }

  function initSearch() {
    const input = document.querySelector("#site-search");
    const results = document.querySelector("#search-results");
    if (!input || !results) return;
    let activeIndex = -1;

    const close = () => {
      results.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      activeIndex = -1;
    };

    const open = () => {
      const matches = searchMatches(input.value);
      results.setAttribute("role", matches.length ? "listbox" : "status");
      results.innerHTML = matches.length
        ? matches
            .map(
              (product, index) => `
                <a class="search-result" id="search-option-${index}" href="${productPath(product)}" role="option" aria-selected="false" data-search-result="${product.slug}">
                  <span class="search-result-image"><img src="${path("assets/ovo-vial-front.webp")}" alt="" width="52" height="52"></span>
                  <span><strong>${escapeHtml(product.name)} · ${escapeHtml(product.strength)}</strong><span>${escapeHtml(product.code)} · ${escapeHtml(product.category)}</span></span>
                  <span class="search-result-price">${money.format(product.price)}</span>
                </a>
              `,
            )
            .join("")
        : `<div class="empty-state"><strong>No matching catalog entry.</strong><p>Try a molecule name, product code, or research area.</p><a class="text-link" href="${path("catalog.html")}">Browse all products →</a></div>`;
      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };

    input.addEventListener("focus", open);
    input.addEventListener("input", () => {
      activeIndex = -1;
      open();
      if (input.value.trim()) track("search", { search_term: input.value.trim().toLowerCase(), result_count: searchMatches(input.value).length });
    });

    input.addEventListener("keydown", (event) => {
      const options = [...results.querySelectorAll('[role="option"]')];
      if (event.key === "Escape") {
        close();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key) || options.length === 0) return;
      if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        options[activeIndex].click();
        return;
      }
      if (event.key === "Enter") return;
      event.preventDefault();
      activeIndex =
        event.key === "ArrowDown"
          ? Math.min(options.length - 1, activeIndex + 1)
          : Math.max(0, activeIndex - 1);
      options.forEach((option, index) => option.setAttribute("aria-selected", String(index === activeIndex)));
      input.setAttribute("aria-activedescendant", options[activeIndex].id);
      options[activeIndex].scrollIntoView({ block: "nearest" });
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search-wrap")) close();
    });
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.focus();
      }
    });
    results.addEventListener("click", (event) => {
      const link = event.target.closest("[data-search-result]");
      if (!link) return;
      const product = PRODUCTS.find((item) => item.slug === link.dataset.searchResult);
      track("select_item", {
        item_id: product?.code,
        item_name: product?.name,
        item_list_name: "predictive_search",
      });
    });
  }

  function initCollection() {
    const grid = document.querySelector("[data-collection-grid]");
    if (!grid) return;
    const search = document.querySelector("#collection-search");
    const sort = document.querySelector("#collection-sort");
    const summary = document.querySelector("[data-result-summary]");
    const buttons = [...document.querySelectorAll("[data-filter]")];
    /* The page used to promise "use the testing state as a filter". Testing state
       is identical on all ten entries, so that control could only ever have been
       a no-op. Availability is the axis that actually splits the grid. */
    const availabilityToggle = document.querySelector("[data-availability-toggle]");
    const params = new URLSearchParams(window.location.search);
    let category = CATEGORIES.some((item) => item.key === params.get("category")) ? params.get("category") : "all";
    let onlySellable = params.get("available") === "1";

    const updateUrl = () => {
      const next = new URL(window.location.href);
      if (category === "all") next.searchParams.delete("category");
      else next.searchParams.set("category", category);
      if (search.value.trim()) next.searchParams.set("q", search.value.trim());
      else next.searchParams.delete("q");
      if (onlySellable) next.searchParams.set("available", "1");
      else next.searchParams.delete("available");
      window.history.replaceState({}, "", next);
    };

    const render = () => {
      const query = search.value.trim().toLowerCase();
      let filtered = PRODUCTS.filter((product) => {
        const categoryMatch = category === "all" || product.categoryKey === category;
        const queryMatch =
          !query ||
          [product.name, product.code, product.category, product.strength, product.descriptor]
            .join(" ")
            .toLowerCase()
            .includes(query);
        const availabilityMatch = !onlySellable || availabilityFor(product.slug).sellable;
        return categoryMatch && queryMatch && availabilityMatch;
      });

      if (sort.value === "name-asc") filtered.sort((a, b) => a.name.localeCompare(b.name));
      if (sort.value === "price-asc") filtered.sort((a, b) => a.price - b.price);
      if (sort.value === "price-desc") filtered.sort((a, b) => b.price - a.price);
      /* Featured is the editorial order, so it follows the same rule as every
         other curated list: all ten entries stay in the grid, the two that are
         not offered just stop taking the first two cards. An explicit name or
         price sort is the visitor's own instruction and is never overridden. */
      if (sort.value === "featured") filtered = sellableFirst(filtered);

      grid.innerHTML = filtered.length
        ? filtered.map((product) => productCard(product)).join("")
        : `
          <div class="empty-state">
            <h2>No catalog entries match.</h2>
            <p>Clear the search, widen the research area, or drop the availability filter.</p>
            <button class="button button-primary" type="button" data-reset-collection>Show all products</button>
          </div>
        `;
      summary.textContent = `${filtered.length} ${filtered.length === 1 ? "catalog entry" : "catalog entries"}${category === "all" ? "" : ` in ${CATEGORIES.find((item) => item.key === category).name}`}${onlySellable ? " available to order" : ""}`;
      buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === category)));
      if (availabilityToggle) availabilityToggle.setAttribute("aria-pressed", String(onlySellable));
      updateUrl();
    };

    search.value = params.get("q") || "";
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        category = button.dataset.filter;
        render();
        track("filter_apply", { filter_name: "research_area", filter_value: category });
      });
    });
    if (availabilityToggle) {
      availabilityToggle.addEventListener("click", () => {
        onlySellable = !onlySellable;
        render();
        track("filter_apply", { filter_name: "availability", filter_value: onlySellable ? "sellable_only" : "all" });
      });
    }
    if (availabilityToggle) {
      availabilityToggle.addEventListener("click", () => {
        onlySellable = !onlySellable;
        render();
        track("filter_apply", { filter_name: "availability", filter_value: onlySellable ? "sellable_only" : "all" });
      });
    }
    search.addEventListener("input", render);
    search.addEventListener("change", () => {
      track("search", { search_term: search.value.trim().toLowerCase(), surface: "collection" });
    });
    sort.addEventListener("change", () => {
      render();
      track("sort_changed", { sort_value: sort.value });
    });
    grid.addEventListener("click", (event) => {
      if (!event.target.closest("[data-reset-collection]")) return;
      category = "all";
      search.value = "";
      sort.value = "featured";
      onlySellable = false;
      render();
      search.focus();
    });
    render();
  }

  function initProduct() {
    if (PAGE !== "product") return;
    const product = PRODUCTS.find((item) => item.slug === PRODUCT_SLUG);
    if (!product) return;
    track("view_item", {
      item_id: product.code,
      item_name: product.name,
      item_category: product.category,
      price: product.price,
      demo_only: true,
    });

    try {
      const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((slug) => slug !== product.slug);
      localStorage.setItem(RECENT_KEY, JSON.stringify([product.slug, ...recent].slice(0, 6)));
    } catch {
      localStorage.setItem(RECENT_KEY, JSON.stringify([product.slug]));
    }

    const quantity = document.querySelector("#pdp-quantity");
    const normalizeQuantity = () => {
      quantity.value = String(Math.max(1, Math.min(MAX_QUANTITY, Number.parseInt(quantity.value, 10) || 1)));
    };
    document.querySelectorAll("[data-pdp-quantity-change]").forEach((button) => {
      button.addEventListener("click", () => {
        quantity.value = String(Number(quantity.value || 1) + Number(button.dataset.pdpQuantityChange));
        normalizeQuantity();
      });
    });
    quantity?.addEventListener("change", normalizeQuantity);

    document.querySelectorAll("[data-media-src]").forEach((button) => {
      button.addEventListener("click", () => {
        const media = document.querySelector("[data-main-media]");
        if (!media) return;
        media.innerHTML = productImage(product, true);
        const image = media.querySelector("img");
        const label = media.querySelector(".product-image-label");
        image.src = button.dataset.mediaSrc;
        image.alt = button.dataset.mediaAlt;
        image.style.transform = `scale(${button.dataset.mediaZoom || "1"})`;
        image.style.transformOrigin = button.dataset.mediaView === "label" ? "center 40%" : "center";
        if (label) label.hidden = button.dataset.mediaView === "scale";
        document.querySelectorAll("[data-media-src]").forEach((thumb) => thumb.setAttribute("aria-current", String(thumb === button)));
        track("product_media_selected", { item_id: product.code, media_label: button.getAttribute("aria-label") });
      });
    });

    const mainAdd = document.querySelector("[data-pdp-add]");
    const mobileBar = document.querySelector("[data-mobile-add]");
    if (mainAdd && mobileBar && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(([entry]) => {
        const hasScrolledPastPrimaryAction = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        mobileBar.dataset.visible = String(
          hasScrolledPastPrimaryAction && window.matchMedia("(max-width: 640px)").matches,
        );
      });
      observer.observe(mainAdd);
    }
  }

  function initAccordions() {
    document.querySelectorAll(".accordion-trigger").forEach((button) => {
      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        const panel = document.querySelector(`#${CSS.escape(button.getAttribute("aria-controls"))}`);
        if (panel) panel.hidden = expanded;
      });
    });
  }

  function initTestingLookup() {
    const form = document.querySelector("[data-testing-lookup]");
    if (!form) return;
    const input = form.querySelector("input");
    const results = document.querySelector("[data-lookup-results]");
    const params = new URLSearchParams(window.location.search);
    if (params.get("product")) input.value = params.get("product");

    const run = () => {
      const query = input.value.trim().toLowerCase();
      const matches = PRODUCTS.filter((product) => `${product.name} ${product.code}`.toLowerCase().includes(query));
      if (!query) {
        results.innerHTML = `<div class="lookup-card"><h3>Enter a product name or code.</h3><p>Examples: Retatrutide, OVO-001, or BPC-157.</p></div>`;
      } else if (matches.length === 0) {
        results.innerHTML = `<div class="lookup-card"><h3>No matching OVO Labs code.</h3><p>Try a product name, a code from OVO-001 through OVO-010, or browse the full testing table below.</p></div>`;
      } else {
        results.innerHTML = matches
          .map(
            (product) => `
              <div class="lookup-card">
                <p class="product-category">${escapeHtml(product.code)} · ${escapeHtml(product.category)}</p>
                <h3>${escapeHtml(product.name)} · ${escapeHtml(product.strength)}</h3>
                ${(() => { const t = testingFor(product.slug); return t
                  ? `<p class="lookup-lot">Lot ${escapeHtml(t.lot)} · reported ${escapeHtml(t.date)}</p>
                     <div class="lookup-fields">${testingFields(product.slug).map((f) => `
                       <div class="lookup-field${f.reported ? " is-reported" : ""}">
                         <span>${escapeHtml(f.label)}</span>
                         <strong>${escapeHtml(f.result)}</strong>
                         <em>${escapeHtml(f.method)}</em>
                       </div>`).join("")}</div>`
                  : `<p><strong>Testing status:</strong> No result reported for identity, content / mass, purity profile, sterility, or endotoxin.</p>`; })()}
                <p><a class="text-link" href="${productPath(product)}">Open the product page ${icons.arrow}</a></p>
              </div>
            `,
          )
          .join("");
      }
      track("quality_lookup", { search_term: query, result_count: matches.length });
    };

    form.addEventListener("click", (event) => {
      const fill = event.target.closest("[data-fill-promo]");
      if (!fill) return;
      event.preventDefault();
      form.querySelector("#promo-input").value = fill.getAttribute("data-fill-promo");
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      run();
    });
    if (input.value) run();
  }

  function initNewsletter() {
    document.querySelectorAll("[data-newsletter]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = form.querySelector('input[type="email"]');
        if (!input.checkValidity()) {
          input.reportValidity();
          return;
        }
        form.hidden = true;
        const success = form.parentElement.querySelector("[data-newsletter-success]");
        success.hidden = false;
        success.textContent = "Preference saved on this device. Nothing was transmitted, and no email will be sent.";
        track("newsletter_demo_completed", { storage: "none", transmitted: false });
      });
    });
  }

  function initLinkTracking() {
    document.addEventListener("click", (event) => {
      const productLink = event.target.closest("[data-product-link]");
      if (!productLink) return;
      const product = PRODUCTS.find((item) => item.slug === productLink.dataset.productLink);
      track("select_item", {
        item_id: product?.code,
        item_name: product?.name,
        item_list_name: PAGE,
      });
    });

    if (PAGE === "collection") {
      track("view_item_list", {
        item_list_name: "catalog",
        item_count: PRODUCTS.length,
      });
    }
  }

  /* Bound exactly once, outside initCartPage. An earlier version registered this
     inside initCartPage AND called initCartPage from within the handler, so every
     interaction doubled the listener count: 1, 2, 4, 8... Nine clicks produced 512
     full-page renders. The repaint below no longer re-binds. */
  let cartPageListenerBound = false;

  function bindCartPageRepaint() {
    if (cartPageListenerBound || PAGE !== "cart") return;
    cartPageListenerBound = true;

    /* Quantity and remove are handled by the shared cart handlers, which only
       repaint the drawer. On the cart page the summary, the free-shipping bar and
       the Checkout total all read from the same cart, so they must repaint too or
       the page shows a stale total. Deferred so the shared handler has already
       written the cart before we re-render from it. */
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-cart-quantity], [data-remove-product], [data-clear-cart]")) return;
      setTimeout(() => {
        renderPage();
        bindPromoForm();
        renderCart();
      }, 0);
    });
  }

  function initCartPage() {
    if (PAGE !== "cart") return;
    bindCartPageRepaint();
    bindPromoForm();
  }

  function bindPromoForm() {
    /* Two promo forms exist, one on the cart page and one in the checkout order
       summary. This bailed unless PAGE was "cart" and then bound only the first
       match, so the checkout Apply button was inert: a control that looks
       interactive and does nothing. */
    if (PAGE !== "cart" && PAGE !== "checkout") return;
    const form = document.querySelector("[data-promo-form]");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector("#promo-input");
      const feedback = form.querySelector("[data-promo-feedback]");
      const code = (input.value || "").trim().toUpperCase();
      const draft = readCheckoutDraft();

      if (!code) {
        delete draft.promo;
        writeCheckoutDraft(draft);
        feedback.textContent = "";
        feedback.classList.remove("is-error");
        renderPage();
        bindPromoForm();
        return;
      }

      if (!PROMO_CODES[code]) {
        feedback.textContent = `${code} is not a valid code.`;
        feedback.classList.add("is-error");
        return;
      }

      draft.promo = code;
      writeCheckoutDraft(draft);
      track("promo_applied", { code });
      renderPage();
      bindPromoForm();
    });
  }

  function initCheckout() {
    if (PAGE !== "checkout") return;

    const form = document.querySelector("[data-checkout-form]");
    if (!form) return;

    let current = "contact";

    const stepEl = (key) => form.querySelector(`[data-step="${key}"]`);
    const setError = (name, message) => {
      const el = form.querySelector(`[data-error-for="${name}"]`);
      if (el) el.textContent = message || "";
      const input = form.querySelector(`#${name}`) || form.querySelector(`[name="${name}"]`);
      if (input) input.classList.toggle("has-error", Boolean(message));
    };

    function paintStepper() {
      const order = CHECKOUT_STEPS.map((s) => s.key);
      const idx = order.indexOf(current);
      document.querySelectorAll("[data-step-indicator]").forEach((el, i) => {
        el.classList.toggle("is-current", i === idx);
        el.classList.toggle("is-done", i < idx);
        /* A completed step is a place you can go back to, so its pill becomes a
           live control. Everything at or ahead of the current step stays
           disabled: you cannot skip validation by clicking the stepper. */
        const jump = el.querySelector("[data-step-jump]");
        if (jump) jump.disabled = i >= idx;
      });
    }

    function show(key) {
      current = key;
      CHECKOUT_STEPS.forEach((s) => {
        const el = stepEl(s.key);
        if (el) el.hidden = s.key !== key;
      });
      paintStepper();
      if (key === "review") paintReview();
      window.scrollTo({ top: 0, behavior: "smooth" });
      track("checkout_step", { step: key });
    }

    function collect() {
      const data = readCheckoutDraft();
      new FormData(form).forEach((value, key) => {
        if (key === "cardNumber" || key === "cardExpiry" || key === "cardCvc") return; // never persisted
        data[key] = typeof value === "string" ? value.trim() : value;
      });
      const terms = form.querySelector('[name="terms"]');
      if (terms) data.terms = terms.checked;
      return data;
    }

    function persist() {
      writeCheckoutDraft(collect());
    }

    const RULES = {
      contact: [
        ["email", (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Enter a valid email address."],
        /* The label says optional and the input carries no required attribute,
           so an empty value must pass. A value that is present is still
           checked, because a half-typed number is worse than none. */
        ["phone", (v) => v === "" || v.replace(/\D/g, "").length >= 10, "Enter a phone number with at least 10 digits, or leave it blank."],
      ],
      shipping: [
        ["firstName", (v) => v.length >= 1, "Enter a first name."],
        ["lastName", (v) => v.length >= 1, "Enter a last name."],
        ["address1", (v) => v.length >= 4, "Enter a street address."],
        ["city", (v) => v.length >= 2, "Enter a city."],
        ["state", (v) => v.length === 2, "Select a state."],
        ["zip", (v) => /^\d{5}(-\d{4})?$/.test(v), "Enter a 5 digit ZIP code."],
      ],
      delivery: [],
      payment: [],
    };

    function validate(key) {
      const rules = RULES[key] || [];
      let ok = true;
      rules.forEach(([name, test, message]) => {
        const input = form.querySelector(`#${name}`) || form.querySelector(`[name="${name}"]`);
        const value = input ? String(input.value || "").trim() : "";
        if (!test(value)) {
          setError(name, message);
          if (ok && input) input.focus();
          ok = false;
        } else {
          setError(name, "");
        }
      });
      return ok;
    }

    function refreshSummary() {
      const holder = document.querySelector("[data-checkout-summary]");
      if (holder) holder.innerHTML = orderSummaryPanel(priceBreakdown(collect()));
      const total = priceBreakdown(collect()).total;
      const place = form.querySelector("[data-place-order]");
      if (place) place.textContent = `Place order · ${money.format(total)}`;
    }

    function paintReview() {
      const d = collect();
      const b = priceBreakdown(d);
      const holder = form.querySelector("[data-review-blocks]");
      if (!holder) return;
      const block = (title, bodyHtml, target) => `
        <div class="review-block">
          <div class="review-block-head">
            <h3>${escapeHtml(title)}</h3>
            <button class="link-button" type="button" data-edit="${target}">Edit</button>
          </div>
          <p>${bodyHtml}</p>
        </div>
      `;
      holder.innerHTML = [
        block("Contact", `${escapeHtml(d.email || "")}${d.phone ? `<br>${escapeHtml(formatPhone(d.phone))}` : ""}`, "contact"),
        block(
          "Ship to",
          `${escapeHtml(d.firstName || "")} ${escapeHtml(d.lastName || "")}<br>${escapeHtml(d.address1 || "")}${d.address2 ? `<br>${escapeHtml(d.address2)}` : ""}<br>${escapeHtml(d.city || "")}, ${escapeHtml(d.state || "")} ${escapeHtml(d.zip || "")}`,
          "shipping",
        ),
        block("Delivery", `${escapeHtml(b.method.name)} · ${escapeHtml(b.method.detail)}`, "delivery"),
        block("Payment", "Not collected. This storefront cannot charge a card.", "payment"),
      ].join("");
    }

    form.addEventListener("input", () => {
      persist();
      refreshSummary();
    });
    form.addEventListener("change", () => {
      persist();
      refreshSummary();
    });

    form.addEventListener("click", (event) => {
      const next = event.target.closest("[data-next]");
      const back = event.target.closest("[data-back]");
      const edit = event.target.closest("[data-edit]");
      const place = event.target.closest("[data-place-order]");

      if (next) {
        const key = next.getAttribute("data-next");
        if (!validate(key)) return;
        persist();
        const order = CHECKOUT_STEPS.map((s) => s.key);
        show(order[order.indexOf(key) + 1]);
      }
      if (back) show(back.getAttribute("data-back"));
      if (edit) show(edit.getAttribute("data-edit"));
      if (place) placeOrder();
    });

    function placeOrder() {
      const terms = form.querySelector('[name="terms"]');
      if (terms && !terms.checked) {
        setError("terms", "Please confirm you have read the policies.");
        terms.focus();
        return;
      }
      setError("terms", "");

      const d = collect();
      const b = priceBreakdown(d);
      const now = new Date();
      const eta = new Date(now.getTime() + (b.method.id === "cold" ? 1 : b.method.id === "express" ? 2 : 5) * 86400000);
      const fmt = { month: "short", day: "numeric" };

      const order = {
        reference: `OVO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`,
        placedAt: now.toISOString(),
        placedLabel: now.toLocaleDateString("en-US", fmt),
        etaLabel: eta.toLocaleDateString("en-US", fmt),
        email: d.email || "",
        phone: d.phone || "",
        firstName: d.firstName || "",
        lastName: d.lastName || "",
        address1: d.address1 || "",
        address2: d.address2 || "",
        city: d.city || "",
        state: d.state || "",
        zip: d.zip || "",
        shippingMethodName: b.method.name,
        shippingMethodDetail: b.method.detail,
        items: cart
          .map((line) => {
            const item = cartItemData(line.slug);
            if (!item) return null;
            /* The order records the lot it was placed against. Without this the
               receipt has nothing to match the delivered vial label to, and the
               promise of a lot COA before dispatch stays an assertion. */
            const lots = lotTrace(item.slug);
            return {
              slug: item.slug, name: item.name, code: item.code,
              strength: item.strength, price: item.price,
              quantity: line.quantity, isBundle: Boolean(item.productSlugs),
              lots,
              lot: lots.length === 1 ? lots[0].lot : "",
              lotDate: lots.length === 1 ? lots[0].date : "",
            };
          })
          .filter(Boolean),
        totals: { subtotal: b.subtotal, discount: b.discount, shipping: b.shipping, tax: b.tax, total: b.total },
      };

      try {
        localStorage.setItem(ORDER_KEY, JSON.stringify([order, ...readOrders()].slice(0, 10)));
      } catch (error) {
        /* storage full or blocked; the confirmation page will report no order */
      }

      cart = [];
      saveCart();
      localStorage.removeItem(CHECKOUT_KEY);
      track("order_placed", { reference: order.reference, value: order.totals.total });
      window.location.href = path("order-confirmation.html");
    }

    /* The aside's discount form had no handler on this page: bindPromoForm()
       returns early unless PAGE === "cart", so Apply fell through to a native
       GET, reloaded checkout.html?promo=... and dropped the shopper back on
       step 1 with no code applied and no message. It is bound here, against the
       same draft the summary already reads from, so nothing re-renders. */
    const promoForm = document.querySelector("[data-promo-form]");
    if (promoForm) {
      promoForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = promoForm.querySelector("#promo-input");
        const feedback = promoForm.querySelector("[data-promo-feedback]");
        const code = (input.value || "").trim().toUpperCase();
        const draft = readCheckoutDraft();
        if (!code) {
          delete draft.promo;
          writeCheckoutDraft(draft);
          feedback.textContent = "";
          feedback.classList.remove("is-error");
          refreshSummary();
          return;
        }
        if (!PROMO_CODES[code]) {
          feedback.textContent = `${code} is not a valid code.`;
          feedback.classList.add("is-error");
          return;
        }
        draft.promo = code;
        writeCheckoutDraft(draft);
        feedback.textContent = `Applied: ${PROMO_CODES[code].label}`;
        feedback.classList.remove("is-error");
        refreshSummary();
        track("promo_applied", { code });
      });
    }

    /* The stepper pills are buttons; paintStepper enables the completed ones.
       They reuse the same show() the Review step's Edit links already prove is
       safe to jump backwards with. */
    const stepper = document.querySelector("[data-stepper]");
    if (stepper) {
      stepper.addEventListener("click", (event) => {
        const jump = event.target.closest("[data-step-jump]");
        if (jump && !jump.disabled) show(jump.getAttribute("data-step-jump"));
      });
    }

    /* The locked card fields are readonly, not disabled, so they were live tab
       stops on values that can never change. */
    form.querySelectorAll("input[readonly]").forEach((el) => {
      el.tabIndex = -1;
    });

    show("contact");
    refreshSummary();
  }

  renderPage();
  initCartPage();
  initCheckout();
  initDrawersAndCart();
  initSearch();
  initCollection();
  initProduct();
  initAccordions();
  initTestingLookup();
  initNewsletter();
  initLinkTracking();
  track("page_view", { page_title: document.title, page_path: window.location.pathname });
})();

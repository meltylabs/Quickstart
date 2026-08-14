import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(
  ROOT,
  "biologix-strategy-board/research/retatrutide-vendor-universe-data.js"
);

const FINNRICK_ROOT = "https://www.finnrick.com";
const PEPTIDE_COMPARE_URL =
  "https://www.peptide-compare.com/best/retatrutide";

const RETAIL_CENSUS = {
  confirmed: `
    adaptpeptides.com advancedresearchpep.com agelessvitalitypeptides.com
    alphacarbonlabs.com alphaomegapeptide.com americanpeptides.us
    aminosequence.com arcticlabsupply.com behemothlabz.com biopepstore.com
    biopepusa.com bluumpeptides.com bulkpeptides.com epic-pep.com
    eternaaminos.com expertpeptides.com geneticpeptide.com getprimelabs.com
    greatestpeptides.com heartlandbiolabs.com hydroresearchpeptides.com
    ignitepeptides.com labtrustpeptides.com licensedpeptides.com
    lifelinkresearch.com longevitypeptides.us lotilabs.com luxaralabs.com
    matteprotocol.com milehighcompounds.is myoasislabs.com mytidelab.com
    neb.co nextechlaboratories.com ngpeptide.com northwestpeptides.com
    nosbarbersupply.com nupeps.com nurevpeptides.com nxtstate.co
    onyxbiolabs.com onyxresearch.shop optides.com orionpeptide.com
    pacificresearchpeptides.com peptalabs.com peptara.org peptide.express
    peptidedeck.com peptidehackers.com peptidelabsinc.com
    peptidescollective.com peptidology.co peptira.com peptomiq.com
    polarispeptides.com protidehealth.com pspeptides.com purepeps.com
    quantapeptides.com realpeptides.co regentide.net researchchemhq.co
    riptidewellness.com rivnpeptides.com royal-peptides.com simplepeptide.com
    skyepeptides.com somachems.com spartalabs.net spusa-labs.com stratelabs.is
    sunday-usa.com sunrisebioresearch.com thepeplabs.com tidetopia.com
    true-peptides.com truepeptidelabs.com trypureonepeptides.com
    umbrellalabs.is uspeptidescience.com veloraresearch.com vigorpeptides.com
    wholesalepeptide.com
  `.trim().split(/\s+/),
  probable: `
    aminoclub.com apollopeptidesciences.com ascendingpeptides.co
    ascensionlabs.bio ascensionlabsusa.com ascensionpeptides.com
    biolongevitylabs.com bulkglp.com compoundsciences.com corepeptides.com
    crushresearch.com evopeptidesus.com glacieraminos.shop
    limitlesslifenootropics.com lvluphealth.com lyvpeptides.com
    nusciencepeptides.com olympicpeptide.com orbitrexpeptidex.com
    paradigmpeptides.is pantheonpeptides.com peptide.partners
    peptideplugs.com premierbiolabs.com primepeptides.co profoundaminos.com
    societypeptide.com swisschems.is
  `.trim().split(/\s+/),
  excluded: `
    aminoasylum.shop elitebiogenetix.com felixchem.com gorillahealing.com
    hangzhousinopep.com modernaminos.com nexaph.com paradigm-peptide.com
    paradisopeptides.com peptide-sciences.com peptidesociety.com
    planetpeptide.com purerxpeptides.com r3juven8.com saf-research.com
    usapeptides.com vitanx.com wolverinepeptides.club
  `.trim().split(/\s+/)
};

const DIRECT_DISCOVERIES = [
  {
    name: "Sparta Labs",
    url: "https://spartalabs.net/",
    productUrl: "https://spartalabs.net/us/products/retatrutide",
    source: "Direct checkout audit"
  },
  {
    name: "Bluum Peptides",
    url: "https://bluumpeptides.com/",
    productUrl: "https://bluumpeptides.com/products/retatrutide",
    source: "Google result and direct product audit"
  },
  {
    name: "BioPep USA",
    url: "https://biopepusa.com/",
    productUrl: "https://biopepusa.com/product/glp-reta/",
    source: "Google result and direct checkout audit"
  },
  {
    name: "Pepta Labs",
    url: "https://peptalabs.com/",
    productUrl: "https://peptalabs.com/peptides/retatrutide-20mg",
    source: "Google result and direct checkout audit"
  },
  {
    name: "American Peptides",
    url: "https://www.americanpeptides.us/",
    productUrl: "https://www.americanpeptides.us/products/retatrutide",
    source: "Google result and direct product audit"
  },
  {
    name: "Heartland Bio Labs",
    url: "https://heartlandbiolabs.com/",
    productUrl: "https://heartlandbiolabs.com/product/retatrutide/",
    source: "Google result"
  },
  {
    name: "Arctic Lab Supply",
    url: "https://arcticlabsupply.com/",
    productUrl: "https://arcticlabsupply.com/products/retatrutide-10mg",
    source: "Google result"
  },
  {
    name: "Optides",
    url: "https://optides.com/",
    productUrl: "https://optides.com/shop/retatrutide",
    source: "Google result"
  },
  {
    name: "Biologix Labs Research",
    url: "https://biologixlabsresearch.com/",
    productUrl: "https://biologixlabsresearch.com/product/retatrutide/",
    source: "Direct checkout audit"
  },
  {
    name: "Pure Compounding Labs",
    url: "https://purecompoundinglabs.com/",
    productUrl: "https://purecompoundinglabs.com/product/glp-3/",
    source: "Direct checkout audit"
  },
  {
    name: "SMT Peptides",
    url: "https://smtpeptides.com/",
    productUrl: "https://smtpeptides.com/product/glp3-r/",
    source: "Direct checkout audit"
  },
  {
    name: "Xcel Peptides",
    url: "https://www.xcelpeptides.com/",
    productUrl: "https://www.xcelpeptides.com/product/glp-3/",
    source: "Direct checkout audit"
  },
  {
    name: "Pink Pony Peptides",
    url: "https://pinkponypeptides.com/",
    productUrl: "https://pinkponypeptides.com/",
    source: "Direct checkout and FDA enforcement audit"
  },
  {
    name: "Prime Sciences",
    url: "https://prime-sciences.com/",
    productUrl: "https://prime-sciences.com/customer/register",
    source: "Direct checkout and FDA enforcement audit"
  },
  {
    name: "PekCura Labs",
    url: "https://pekcuralabs.com/",
    productUrl: "https://pekcuralabs.com/shop/pcl-glp-3-r-10mg/",
    source: "Direct checkout audit"
  },
  {
    name: "Modern Peptides",
    url: "https://modern-peptides.com/",
    productUrl: "https://modern-peptides.com/product/glp-3-r/",
    source: "Direct checkout audit"
  },
  {
    name: "GL Peptides",
    url: "https://www.glpeptides.is/",
    productUrl: "https://www.glpeptides.is/products/retatrutide",
    source: "Direct checkout audit"
  },
  {
    name: "Gentleman Peptides",
    url: "https://gentlemanpeptides.com/",
    productUrl: "https://gentlemanpeptides.com/",
    source: "Direct checkout audit"
  },
  {
    name: "Ion Peptide",
    url: "https://ionpeptide.com/",
    productUrl: "https://ionpeptide.com/product/ion3r/",
    source: "Direct checkout audit"
  },
  {
    name: "Battle Born Research",
    url: "https://battlebornresearch.com/",
    productUrl: "https://battlebornresearch.com/product/glp3-10mg/",
    source: "Direct checkout audit"
  },
  {
    name: "Prime Peptides",
    url: "https://primepeptides.co/",
    productUrl: "https://primepeptides.co/products/retatrutide/",
    source: "Direct checkout and FDA enforcement audit"
  }
];

const CHECKOUT_SNAPSHOT = {
  "advancedresearchpep.com": {
    platform: "WooCommerce",
    methods: ["Link Money", "Zelle", "Seamless", "BTCPay", "SHKeeper"],
    evidence: "Live anonymous Store API"
  },
  "agelessvitalitypeptides.com": {
    platform: "WooCommerce",
    methods: ["Authorize.net adapter", "Bank transfer"],
    evidence: "Live anonymous Store API"
  },
  "alphaomegapeptide.com": {
    platform: "WooCommerce",
    methods: ["Quantum ePay", "SDCC crypto", "SnappaPay"],
    evidence: "Live anonymous Store API"
  },
  "aminosequence.com": {
    platform: "WooCommerce",
    methods: ["eDebit Direct ACH", "IDEM", "Custom gateway", "MyCryptoCheckout"],
    evidence: "Live anonymous Store API"
  },
  "behemothlabz.com": {
    platform: "WooCommerce",
    methods: ["PayPal post-order", "Venmo", "InstaOnramp", "Crypto", "ForumPay"],
    evidence: "Live anonymous Store API"
  },
  "biopepstore.com": {
    platform: "WooCommerce",
    methods: ["ChargeAnywhere", "Zelle", "OpenNode"],
    evidence: "Live anonymous Store API"
  },
  "bulkpeptides.com": {
    platform: "WooCommerce",
    methods: ["Link Money", "IDEM"],
    evidence: "Live anonymous Store API"
  },
  "geneticpeptide.com": {
    platform: "WooCommerce",
    methods: ["Custom card/Cash App", "NMI", "ByteNFT", "AMGExpress ACH", "Blockonomics"],
    evidence: "Rendered live checkout"
  },
  "hydroresearchpeptides.com": {
    platform: "WooCommerce",
    methods: ["MGPay", "MNet", "IDEM", "PayPal adapter", "FinGrid", "Custom gateway"],
    evidence: "Live anonymous Store API"
  },
  "ignitepeptides.com": {
    platform: "WooCommerce",
    methods: ["Link Money", "Venmo adapter", "CLKK"],
    evidence: "Live anonymous Store API"
  },
  "longevitypeptides.us": {
    platform: "WooCommerce",
    methods: ["NMI", "Green Money", "Zelle", "Check"],
    evidence: "Live anonymous Store API"
  },
  "milehighcompounds.is": {
    platform: "WooCommerce",
    methods: ["NMI", "Link Money", "SSTG adapter", "MAEF adapter"],
    evidence: "Live anonymous Store API"
  },
  "myoasislabs.com": {
    platform: "WooCommerce",
    methods: ["NMI profiles", "OrderShield", "Link Money"],
    evidence: "Live anonymous Store API"
  },
  "nextechlaboratories.com": {
    platform: "WooCommerce",
    methods: ["CardsShield/PayPal adapter"],
    evidence: "Live anonymous Store API"
  },
  "ngpeptide.com": {
    platform: "WooCommerce",
    methods: ["NMI", "Link Money"],
    evidence: "Live anonymous Store API"
  },
  "northwestpeptides.com": {
    platform: "WooCommerce",
    methods: ["Venmo", "Zelle", "Alternative card on-ramp", "IDEM card/eCheck"],
    evidence: "Rendered live checkout"
  },
  "nupeps.com": {
    platform: "WooCommerce",
    methods: ["Opaque HL Hunt adapter"],
    evidence: "Live anonymous Store API"
  },
  "onyxresearch.shop": {
    platform: "WooCommerce",
    methods: ["Truvo card", "Veylo card", "Link Money", "PayerURL crypto"],
    evidence: "Rendered live checkout"
  },
  "peptidology.co": {
    platform: "WooCommerce",
    methods: ["NMI-style adapter", "Link Money", "Zelle", "Custom Apple Pay"],
    evidence: "Live anonymous Store API"
  },
  "peptidescollective.com": {
    platform: "WooCommerce",
    methods: ["Tagada", "FinGrid"],
    evidence: "Live anonymous Store API"
  },
  "peptira.com": {
    platform: "WooCommerce",
    methods: ["NMI profiles", "Apple Pay", "Google Pay", "Link Money", "Purchase order"],
    evidence: "Live anonymous Store API"
  },
  "polarispeptides.com": {
    platform: "WooCommerce",
    methods: ["Paynote", "NMI", "Blockonomics", "DePay", "Custom gateway"],
    evidence: "Live anonymous Store API"
  },
  "protidehealth.com": {
    platform: "WooCommerce",
    methods: ["NMI-style adapter"],
    evidence: "Live anonymous Store API"
  },
  "purepeps.com": {
    platform: "WooCommerce",
    methods: ["Venmo", "Zelle"],
    evidence: "Live anonymous Store API"
  },
  "realpeptides.co": {
    platform: "WooCommerce",
    methods: ["Link Money", "Tagada", "CryptoPay", "NMI"],
    evidence: "Rendered live checkout"
  },
  "researchchemhq.co": {
    platform: "WooCommerce",
    methods: ["Link Money", "NoRamp", "PayPal adapter", "IDEM", "PipePay", "PayGate.to"],
    evidence: "Live anonymous Store API"
  },
  "riptidewellness.com": {
    platform: "WooCommerce",
    methods: ["MAEF adapter", "CircoFlows", "DFinSell", "eDebit Direct", "CashEnvoy"],
    evidence: "Live anonymous Store API"
  },
  "royal-peptides.com": {
    platform: "WooCommerce",
    methods: ["Link Money", "PayGate.to card", "P2P", "Wire/ACH", "PayGate.to crypto"],
    evidence: "Rendered live checkout"
  },
  "simplepeptide.com": {
    platform: "WooCommerce",
    methods: ["Paynote", "NMI-style card", "SDCC crypto", "SnappaPay"],
    evidence: "Live anonymous Store API"
  },
  "skyepeptides.com": {
    platform: "WooCommerce",
    methods: ["Three NMI gateway profiles"],
    evidence: "Live anonymous Store API"
  },
  "sunrisebioresearch.com": {
    platform: "WooCommerce",
    methods: ["Zelle/Chime", "Card later by Xero invoice"],
    evidence: "Rendered live checkout"
  },
  "truepeptidelabs.com": {
    platform: "WooCommerce",
    methods: ["Link Money", "CLKK"],
    evidence: "Live anonymous Store API"
  },
  "umbrellalabs.is": {
    platform: "WooCommerce",
    methods: ["Link Money", "BTCPay", "Paynote", "IDEM"],
    evidence: "Live anonymous Store API"
  },
  "americanpeptides.us": {
    platform: "Next.js / headless commerce",
    methods: ["Cards claimed", "ACH/wire claimed", "BTC/ETH/USDT claimed"],
    evidence: "Current public terms; provider not named"
  },
  "biopepusa.com": {
    platform: "WooCommerce",
    methods: ["Link Money", "PayVantage adapter", "NOWPayments", "Cash App", "Zelle"],
    evidence: "Rendered live checkout"
  },
  "biologixlabsresearch.com": {
    platform: "WooCommerce",
    methods: ["Bankful", "CardsShield/PayPal", "Link Money", "Zelle", "Venmo"],
    evidence: "Rendered live checkout"
  },
  "battlebornresearch.com": {
    platform: "WooCommerce",
    methods: ["Zelle", "Apple Cash", "Wire", "Crypto", "Check", "Venmo"],
    evidence: "Rendered live checkout"
  },
  "gentlemanpeptides.com": {
    platform: "WooCommerce",
    methods: ["NMI", "Apple Pay", "Google Pay", "Link Money"],
    evidence: "Live anonymous Store API"
  },
  "glpeptides.is": {
    platform: "Next.js",
    methods: ["Card brands claimed"],
    evidence: "Current public FAQ; provider not named"
  },
  "ionpeptide.com": {
    platform: "WooCommerce",
    methods: ["Authorize.net", "NMI profiles", "FinGrid", "Monarch ACH", "IDEM"],
    evidence: "Live anonymous Store API"
  },
  "modern-peptides.com": {
    platform: "WooCommerce",
    methods: ["Link Money", "SeamlessACH"],
    evidence: "Live anonymous Store API"
  },
  "primepeptides.co": {
    platform: "WooCommerce",
    methods: ["iMerchant", "CircoFlows", "Klarna", "MNet", "Link Money"],
    evidence: "Rendered live checkout"
  },
  "spartalabs.net": {
    platform: "Next.js / Medusa",
    methods: ["SpartaPay", "Stripe Elements", "BTC", "ETH", "USDT", "USDC"],
    evidence: "Deep live checkout handoff; no order submitted",
    note: "CircoFlows and P2P code exists, but the tested runtime used SpartaPay and Stripe."
  },
  "bluumpeptides.com": {
    platform: "Shopify",
    methods: ["Visa", "American Express", "Discover", "Apple Pay", "Google Pay"],
    evidence: "Current payment policy; processor and acquirer not public",
    note: "Account gate prevented live payment-step inspection. Mastercard is explicitly not accepted."
  }
};

function domainFromUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "").replace(/^shop\./, "");
  } catch {
    return null;
  }
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Noli research index builder/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response.json();
}

function statusBucket(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "trading" || normalized === "active") return "Listed active";
  if (normalized.includes("payment")) return "Payment problems";
  if (normalized.includes("deactivated") || normalized.includes("no products")) {
    return "Inactive";
  }
  if (normalized.includes("not found")) return "Not found";
  return "Unverified";
}

function retailStatusForDomain(domain) {
  if (RETAIL_CENSUS.confirmed.includes(domain)) return "Confirmed US storefront";
  if (RETAIL_CENSUS.probable.includes(domain)) return "Probable or gated US storefront";
  if (RETAIL_CENSUS.excluded.includes(domain)) return "Excluded from current US retail";
  return "Vendor identity not retail-classified";
}

const [retaPageOne, retaPageTwo, vendorDirectory] = await Promise.all([
  getJson(`${FINNRICK_ROOT}/api/v1/products/retatrutide?page=1&page_size=500`),
  getJson(`${FINNRICK_ROOT}/api/v1/products/retatrutide?page=2&page_size=500`),
  getJson(`${FINNRICK_ROOT}/api/v1/vendors`)
]);

const directoryBySlug = new Map(
  vendorDirectory.items.map((vendor) => [vendor.slug, vendor])
);

const vendors = [
  ...retaPageOne.vendor_leaderboard,
  ...retaPageTwo.vendor_leaderboard
].map((reta) => {
  const directory = directoryBySlug.get(reta.vendor_slug) || {};
  const url = directory.contact_url || null;
  const domain = domainFromUrl(url);
  const checkout = domain ? CHECKOUT_SNAPSHOT[domain] || null : null;

  return {
    name: reta.vendor_name,
    slug: reta.vendor_slug,
    domain,
    url,
    productUrl: null,
    finnrickUrl: `${FINNRICK_ROOT}/products/retatrutide/vendors/${reta.vendor_slug}`,
    source: ["Finnrick Retatrutide testing index"],
    status: directory.status || "Unverified",
    statusBucket: statusBucket(directory.status),
    retailStatus: retailStatusForDomain(domain),
    latestTest: reta.latest_test_display || null,
    testCount: reta.tests_count || 0,
    pricePerMg: reta.price_range_label || null,
    platform: checkout?.platform || null,
    payments: checkout?.methods || [],
    paymentEvidence: checkout?.evidence || null,
    paymentNote: checkout?.note || null
  };
});

for (const discovery of DIRECT_DISCOVERIES) {
  const discoveryDomain = domainFromUrl(discovery.url);
  const existing = vendors.find(
    (vendor) =>
      vendor.domain === discoveryDomain ||
      vendor.name.toLowerCase() === discovery.name.toLowerCase()
  );
  const checkout = CHECKOUT_SNAPSHOT[discoveryDomain] || null;

  if (existing) {
    existing.productUrl ||= discovery.productUrl;
    existing.source = Array.from(new Set([...existing.source, discovery.source]));
    if (checkout) {
      existing.platform = checkout.platform;
      existing.payments = checkout.methods;
      existing.paymentEvidence = checkout.evidence;
      existing.paymentNote = checkout.note || null;
    }
    existing.retailStatus = retailStatusForDomain(discoveryDomain);
    continue;
  }

  vendors.push({
    name: discovery.name,
    slug: null,
    domain: discoveryDomain,
    url: discovery.url,
    productUrl: discovery.productUrl,
    finnrickUrl: null,
    source: [discovery.source],
    status: "Search-discovered",
    statusBucket: "Search-discovered",
    retailStatus: retailStatusForDomain(discoveryDomain),
    latestTest: null,
    testCount: 0,
    pricePerMg: null,
    platform: checkout?.platform || null,
    payments: checkout?.methods || [],
    paymentEvidence: checkout?.evidence || null,
    paymentNote: checkout?.note || null
  });
}

for (const [group, domains] of Object.entries(RETAIL_CENSUS)) {
  for (const domain of domains) {
    const existing = vendors.find((vendor) => vendor.domain === domain);
    const retailStatus =
      group === "confirmed"
        ? "Confirmed US storefront"
        : group === "probable"
          ? "Probable or gated US storefront"
          : "Excluded from current US retail";

    if (existing) {
      existing.retailStatus = retailStatus;
      existing.source = Array.from(new Set([...existing.source, "Current US storefront census"]));
      continue;
    }

    const checkout = CHECKOUT_SNAPSHOT[domain] || null;
    vendors.push({
      name: domain,
      slug: null,
      domain,
      url: `https://${domain}/`,
      productUrl: null,
      finnrickUrl: null,
      source: ["Current US storefront census"],
      status: group === "confirmed" ? "Current product page confirmed" : "Census review",
      statusBucket: group === "confirmed" ? "Search-discovered" : "Unverified",
      retailStatus,
      latestTest: null,
      testCount: 0,
      pricePerMg: null,
      platform: checkout?.platform || null,
      payments: checkout?.methods || [],
      paymentEvidence: checkout?.evidence || null,
      paymentNote: checkout?.note || null
    });
  }
}

vendors.sort((left, right) => {
  const leftAudited = left.payments.length > 0 ? 0 : 1;
  const rightAudited = right.payments.length > 0 ? 0 : 1;
  return (
    leftAudited - rightAudited ||
    right.testCount - left.testCount ||
    left.name.localeCompare(right.name)
  );
});

const statusCounts = Object.entries(
  vendors.reduce((counts, vendor) => {
    counts[vendor.statusBucket] = (counts[vendor.statusBucket] || 0) + 1;
    return counts;
  }, {})
)
  .map(([label, count]) => ({ label, count }))
  .sort((left, right) => right.count - left.count);

const payload = {
  generatedAt: new Date().toISOString(),
  sourceDate: retaPageOne.product?.publishing_date || "2026-07-25",
  methodology:
    "Finnrick Retatrutide vendor index joined to its public vendor directory, then expanded with current search and direct-checkout discoveries. A listing is not an endorsement, proof of legal status, proof of product quality, or proof of active checkout.",
  sources: [
    `${FINNRICK_ROOT}/products/retatrutide`,
    PEPTIDE_COMPARE_URL
  ],
  stats: {
    total: vendors.length,
    finnrickRetatrutideVendors:
      retaPageOne.total_vendors || retaPageOne.vendor_leaderboard.length + retaPageTwo.vendor_leaderboard.length,
    linkedWebsites: vendors.filter((vendor) => vendor.url).length,
    listedActive: vendors.filter((vendor) => vendor.statusBucket === "Listed active").length,
    checkoutAudited: vendors.filter((vendor) => vendor.payments.length > 0).length,
    confirmedRetailStorefronts: vendors.filter(
      (vendor) => vendor.retailStatus === "Confirmed US storefront"
    ).length,
    probableRetailStorefronts: vendors.filter(
      (vendor) => vendor.retailStatus === "Probable or gated US storefront"
    ).length,
    statusCounts
  },
  vendors
};

const banner =
  "/* Generated by scripts/build-retatrutide-vendor-universe.mjs. Do not edit by hand. */\n";
await writeFile(
  OUTPUT,
  `${banner}window.NOLI_RETATRUTIDE_VENDOR_UNIVERSE = ${JSON.stringify(payload)};\n`,
  "utf8"
);

console.log(
  `Wrote ${vendors.length} Retatrutide vendor records to ${path.relative(ROOT, OUTPUT)}`
);

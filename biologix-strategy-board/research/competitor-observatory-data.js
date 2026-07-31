(function () {
  "use strict";

  const capturedAt = "2026-07-28T20:43:44.412Z";
  const processorEvidence = "./noli-processor-code-census-2026-07-27.md";

  const rows = [
    {
      domain: "biologixlabsresearch.com",
      name: "Biologix Labs Research",
      url: "https://biologixlabsresearch.com/",
      created: "2025-09-14",
      platform: "WooCommerce",
      products: 72,
      reta: [5, 37.99, 164.99, 4, 5],
      checkout: ["Bankful"],
      marketing: ["Affiliate page", "15% commission claim", "Weekly payout claim"]
    },
    {
      domain: "northlinelabs.org",
      name: "Northline Labs",
      url: "https://northlinelabs.org/",
      created: "2025-12-19",
      platform: "WooCommerce",
      products: 43,
      reta: [5, 79.99, 299.99, 5, 5],
      traffic: [57470, 150859, 195455, 301718],
      checkout: ["American Express", "Discover", "Google Pay", "Visa"],
      marketing: ["Google Tag Manager", "Google Analytics", "15% first order", "BOGO 50% observed"]
    },
    {
      domain: "bluumpeptides.com",
      name: "Bluum Peptides",
      url: "https://bluumpeptides.com/",
      created: "2024-05-15",
      platform: "Shopify",
      products: 46,
      reta: [5, 125, 469, 5, 5],
      traffic: [15647, 15647, 54765, 117352],
      marketing: ["Google Tag Manager", "Google Analytics", "Google Ads", "Meta Pixel", "Microsoft Clarity"]
    },
    {
      domain: "spartalabs.net",
      name: "Sparta Labs",
      url: "https://spartalabs.net/",
      created: "2026-01-28",
      platform: "Medusa",
      products: 12,
      reta: [4, 80, 225, 4, 4],
      ui: [8.7, 9],
      checkout: ["American Express", "Crypto", "Discover", "Mastercard", "Visa"],
      marketing: ["Affiliate signal", "Google Analytics", "Reddit Pixel"]
    },
    {
      domain: "royal-peptides.com",
      name: "Royal Peptides",
      url: "https://royal-peptides.com/",
      created: "2024-08-20",
      platform: "WooCommerce",
      products: 133,
      reta: [30, 55, 1500, 28, 30],
      ui: [8, 9],
      checkout: ["Bank transfer", "Link Money", "PayGate.to", "Card brands"],
      marketing: ["Google Analytics"]
    },
    {
      domain: "northwestpeptides.com",
      name: "Northwest Peptides",
      url: "https://northwestpeptides.com/product/glp-3/",
      created: "2025-12-04",
      platform: "WooCommerce",
      products: 52,
      reta: [6, 109.99, 279.99, 6, 6],
      ui: [8.8, 9],
      checkout: ["Bank transfer", "PsiFi token", "Zelle", "ACH"],
      marketing: ["Google Tag Manager"]
    },
    {
      domain: "lifelinkresearch.com",
      name: "LifeLink Research",
      url: "https://lifelinkresearch.com/product/retatrutide-glp-3-20mg/",
      created: "2023-10-12",
      platform: "WooCommerce",
      products: 47,
      reta: [5, 123, 475, 5, 5],
      ui: [9.2, 9],
      checkout: ["AMG Express token", "BTCPay Server", "Stripe", "ACH"],
      marketing: ["Affiliate signal", "Google Tag Manager"]
    },
    {
      domain: "adaptpeptides.com",
      name: "Adapt Peptides",
      url: "https://adaptpeptides.com/product/retatrutide/",
      created: "2025-08-08",
      platform: "WooCommerce",
      products: 25,
      reta: [9, 89, 299, 9, 9],
      traffic: [10291, 10291, 36018, 77182],
      ui: [6.08, 4],
      checkout: ["Link Money", "NOWPayments", "Zelle", "Card brands"],
      marketing: ["Google Analytics", "Klaviyo"]
    },
    {
      domain: "geneticpeptide.com",
      name: "Genetic Peptide",
      url: "https://geneticpeptide.com/product/glp-r-vial-2/",
      created: "2024-01-04",
      platform: "WooCommerce",
      products: 154,
      reta: [11, 85, 750, 11, 11],
      ui: [7.25, 8],
      checkout: ["AMG Express token", "Blockonomics", "NMI"]
    },
    {
      domain: "onyxbiolabs.com",
      name: "Onyx Bio Labs",
      url: "https://onyxbiolabs.com/product/retatrutide-peptide/",
      created: "2025-08-23",
      platform: "WooCommerce",
      products: 32,
      reta: [6, 54.99, 249.99, 6, 6],
      traffic: [15541, 15541, 54394, 116557],
      ui: [7.9, 9],
      checkout: ["Cash App", "ForumPay", "Link Money", "Zelle"],
      marketing: ["Google Analytics", "Google Tag Manager", "TikTok Pixel"]
    },
    {
      domain: "umbrellalabs.is",
      name: "Umbrella Labs",
      url: "https://umbrellalabs.is/",
      created: "2020-02-12",
      platform: "WooCommerce",
      products: 613,
      reta: [6, 64.99, 249.99, 6, 6],
      traffic: [95119, 128411, 370964, 727660],
      ui: [7.6, 8],
      checkout: ["BTCPay Server", "Link Money", "Paynote", "ACH"],
      marketing: ["Google Analytics", "Google Tag Manager", "Meta Pixel", "TikTok Pixel"]
    },
    {
      domain: "riptidewellness.com",
      name: "Riptide Wellness",
      url: "https://riptidewellness.com/",
      created: "2014-04-08",
      platform: "WooCommerce",
      products: 52,
      reta: [8, 109.99, 289.99, 6, 8],
      ui: [7.5, 9],
      checkout: ["CircoFlows", "eDebit Direct", "CashEnvoy"],
      marketing: ["Google Tag Manager", "Meta Pixel", "TikTok Pixel"]
    },
    {
      domain: "rivnpeptides.com",
      name: "RIVN Peptides",
      url: "https://rivnpeptides.com/",
      created: "2026-01-21",
      platform: "WooCommerce",
      products: 42,
      reta: [4, 99.99, 259.99, 4, 4],
      ui: [7.7, 9],
      checkout: ["NMI", "PayPal", "NOWPayments", "Crypto"],
      marketing: ["Google Tag Manager"]
    },
    {
      domain: "nurevpeptides.com",
      name: "Nurev Peptides",
      url: "https://nurevpeptides.com/product/glp-3-rt-30mg-retatrutride/",
      created: "2025-12-03",
      platform: "WooCommerce",
      products: 44,
      reta: [5, 89, 269, 5, 5],
      ui: [7.2, 8],
      checkout: ["eDebit Direct", "NOWPayments", "Yodlee"],
      marketing: ["Google Tag Manager", "Meta Pixel"]
    },
    {
      domain: "orionpeptide.com",
      name: "Orion Peptide",
      url: "https://orionpeptide.com/product/retatrutide-10mg/",
      created: "2026-01-13",
      platform: "WooCommerce",
      products: 86,
      reta: [6, 54, 328, 4, 6],
      ui: [7.5, 8],
      checkout: ["eDebit Direct", "Zelle", "WooPayments", "ACH"],
      marketing: ["Klaviyo", "Microsoft Clarity"]
    },
    {
      domain: "researchchemhq.co",
      name: "ResearchChemHQ",
      url: "https://researchchemhq.co/",
      created: "2024-08-26",
      platform: "WooCommerce",
      products: 29,
      reta: [2, 119.99, 299.99, 2, 2],
      ui: [4.8, 7],
      checkout: ["Link Money", "NoRamp", "PayGate.to", "PayPal"],
      marketing: ["Google Analytics", "Google Tag Manager"]
    },
    {
      domain: "polarispeptides.com",
      name: "Polaris Peptides",
      url: "https://polarispeptides.com/",
      created: "2024-01-07",
      platform: "WooCommerce",
      products: 62,
      reta: [5, 50, 400, 5, 5],
      traffic: [38843, 66033, 186446, 361240],
      ui: [5.9, 8],
      checkout: ["Blockonomics", "Paynote", "ACH"],
      marketing: ["Google Analytics", "Google Tag Manager", "Hotjar"]
    },
    {
      domain: "peptide.partners",
      name: "Peptide Partners",
      url: "https://peptide.partners/product/glp-3-retatrutide-12mg-vials/",
      created: "2025-03-18",
      platform: "WooCommerce",
      products: 40,
      reta: [8, 124, 1512, 4, 8],
      traffic: [89173, 89173, 312106, 668798],
      ui: [7.1, 8],
      marketing: ["Google Analytics", "Google Tag Manager"]
    },
    {
      domain: "skyepeptides.com",
      name: "Skye Peptides",
      url: "https://skyepeptides.com/",
      created: "2023-05-28",
      platform: "Unknown",
      products: null,
      reta: null,
      traffic: [64789, 77747, 226762, 447044],
      ui: [2.5, 3]
    },
    {
      domain: "simplepeptide.com",
      name: "Simple Peptide",
      url: "https://simplepeptide.com/",
      created: "2023-12-19",
      platform: "WooCommerce",
      products: 138,
      reta: [7, 75, 449, 7, 7],
      traffic: [258965, 349603, 1009964, 1981082],
      ui: [6.5, 8],
      checkout: ["NMI", "Paynote", "ACH"],
      marketing: ["Google Tag Manager"]
    },
    {
      domain: "myoasislabs.com",
      name: "Oasis Peptides",
      url: "https://myoasislabs.com/product/glp3r/",
      created: "2024-11-25",
      platform: "WooCommerce",
      products: 54,
      reta: [7, 47, 358, 7, 7],
      traffic: [37773, 37773, 132206, 283298],
      ui: [7.2, 8],
      checkout: ["NMI"],
      marketing: ["Google Tag Manager"]
    },
    {
      domain: "peptalabs.com",
      name: "Pepta Labs",
      url: "https://peptalabs.com/peptides/retatrutide-20mg",
      created: "2026-02-07",
      platform: "Unknown",
      products: 40,
      reta: [9, 101.19, 737.84, 6, 9],
      ui: [9.3, 10],
      checkout: ["Card brands", "Bitcoin", "Cash App", "Crypto"],
      marketing: ["Google Analytics"]
    },
    {
      domain: "peptidehackers.com",
      name: "Peptide Hackers",
      url: "https://www.peptidehackers.com/products/retatrutide",
      created: "2024-05-21",
      platform: "Vercel",
      products: 122,
      reta: [7, 100, 1250, 7, 7],
      traffic: [14916, 14916, 52206, 111870],
      ui: [8.8, 10],
      marketing: ["Sentry"]
    },
    {
      domain: "greatestpeptides.com",
      name: "Greatest Peptides",
      url: "https://greatestpeptides.com/product/retatrutide-40-mg/",
      created: "2025-11-23",
      platform: "WooCommerce",
      products: 37,
      reta: [4, 80, 220, 4, 4],
      ui: [8.08, 6],
      checkout: ["Authorize.Net", "Bank transfer", "Bitcoin", "Ethereum", "USDT"],
      marketing: ["Google Analytics", "Klaviyo"]
    },
    {
      domain: "peptira.com",
      name: "Peptira",
      url: "https://peptira.com/",
      created: "2025-05-29",
      platform: "WooCommerce",
      products: 91,
      reta: [3, 99, 179, 3, 3],
      traffic: [92109, 96714, 276327, 538838],
      ui: [5.6, 7.5],
      checkout: ["Link Money", "NMI", "PeachPay", "Card brands"],
      marketing: ["Google Tag Manager", "Meta Pixel", "TikTok Pixel"]
    }
  ];

  const companyByDomain = new Map(rows.map((row) => [row.domain, row]));
  const idFor = (domain) => `company-${domain.replace(/[^a-z0-9]+/gi, "-").replace(/-+$/u, "")}`;
  const money = (value) => `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  const companies = rows.map((row, index) => {
    const reta = row.reta
      ? {
          variantCount: row.reta[0],
          minimumPrice: row.reta[1],
          maximumPrice: row.reta[2],
          inStockOffers: row.reta[3],
          totalOffers: row.reta[4],
          currency: "USD",
          state: "Observed"
        }
      : {
          variantCount: null,
          minimumPrice: null,
          maximumPrice: null,
          inStockOffers: null,
          totalOffers: null,
          currency: "USD",
          state: "Unknown"
        };

    const traffic = row.traffic
      ? {
          monthlyVisits: row.traffic[0],
          gmvLow: row.traffic[1],
          gmvBase: row.traffic[2],
          gmvHigh: row.traffic[3],
          state: "Estimated",
          method: "Rank.to power-law traffic scenario multiplied by stated conversion and AOV assumptions. Not analytics, settled revenue, or profit."
        }
      : {
          monthlyVisits: null,
          gmvLow: null,
          gmvBase: null,
          gmvHigh: null,
          state: "Unknown",
          method: "No usable public traffic series was captured. Unknown does not mean zero."
        };

    const checkout = row.checkout?.length
      ? {
          signals: row.checkout,
          state: "Observed",
          boundary: "Public labels, code, plugins, or anonymous checkout signals only. They do not prove activation, underwriting, transaction success, MID, acquirer, reserves, or settlement."
        }
      : {
          signals: [],
          state: "Unknown",
          boundary: "No defensible public checkout signal was retained in this baseline."
        };

    const marketing = row.marketing?.length
      ? {
          signals: row.marketing,
          state: "Observed"
        }
      : {
          signals: [],
          state: "Unknown"
        };

    const history = [
      {
        observedAt: capturedAt,
        state: reta.state,
        type: "Catalog",
        text: reta.state === "Observed"
          ? `Baseline captured ${reta.variantCount} public Reta offer${reta.variantCount === 1 ? "" : "s"} from ${money(reta.minimumPrice)} to ${money(reta.maximumPrice)}.`
          : "The public catalog baseline did not expose a defensible Reta offer."
      }
    ];

    if (row.traffic) {
      history.push({
        observedAt: capturedAt,
        state: "Estimated",
        type: "Traffic",
        text: `Public rank scenario modeled ${row.traffic[0].toLocaleString("en-US")} monthly visits and ${money(row.traffic[1])}–${money(row.traffic[3])} gross checkout volume.`
      });
    }
    if (row.ui) {
      history.push({
        observedAt: capturedAt,
        state: "Observed",
        type: "UI",
        text: `Screenshot review scored the public experience ${row.ui[0]}/10 overall and ${row.ui[1]}/10 on mobile.`
      });
    }

    return {
      id: idFor(row.domain),
      priority: index + 1,
      name: row.name,
      domain: row.domain,
      url: row.url,
      baselineAt: capturedAt,
      domainCreated: {
        value: row.created,
        state: "Verified"
      },
      platform: {
        value: row.platform === "Unknown" ? null : row.platform,
        state: row.platform === "Unknown" ? "Unknown" : "Observed"
      },
      catalog: {
        productCount: row.products,
        state: Number.isFinite(row.products) ? "Observed" : "Unknown"
      },
      reta,
      traffic,
      ui: row.ui
        ? { overall: row.ui[0], mobile: row.ui[1], state: "Observed" }
        : { overall: null, mobile: null, state: "Unknown" },
      checkout,
      marketing,
      history,
      evidence: [
        {
          label: "Registry lookup",
          url: `https://rdap.org/domain/${row.domain}`,
          state: "Verified"
        },
        {
          label: "Public storefront",
          url: row.url,
          state: "Observed"
        },
        ...(row.traffic
          ? [{
              label: "Traffic model input",
              url: `https://rank.to/api/?d=${row.domain}&n=30`,
              state: "Estimated"
            }]
          : []),
        ...(row.checkout?.length
          ? [{
              label: "Payment code census",
              url: processorEvidence,
              state: "Observed"
            }]
          : [])
      ]
    };
  });

  const change = (domain, type, state, title, detail) => {
    const company = companyByDomain.get(domain);
    return {
      id: `${domain}-${type.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
      companyId: idFor(domain),
      company: company.name,
      domain,
      observedAt: capturedAt,
      type,
      state,
      title,
      detail,
      sourceUrl: company.url
    };
  };

  const changes = [
    change("biologixlabsresearch.com", "Pricing", "Observed", "Biologix baseline captured", "Four of five captured Reta offers were in stock, spanning $37.99 to $164.99."),
    change("northlinelabs.org", "Traffic", "Estimated", "Northline demand scenario established", "The trailing public-rank model produced 57,470 monthly visits and a $150,859–$301,718 gross-checkout scenario."),
    change("bluumpeptides.com", "Marketing", "Observed", "Bluum exposes a mature measurement stack", "Google Ads, Meta Pixel, Microsoft Clarity, Google Analytics, and GTM were observed publicly."),
    change("spartalabs.net", "UI", "Observed", "Sparta enters the visual shortlist", "The captured Reta path scored 8.7/10 overall and 9/10 on mobile."),
    change("royal-peptides.com", "Catalog", "Observed", "Royal has the widest monitored Reta ladder", "Thirty captured public Reta offers spanned single-vial and kit configurations from $55 to $1,500."),
    change("peptalabs.com", "Availability", "Observed", "Pepta shows mixed availability", "Six of nine captured Reta offers were in stock; the three 30mg quantity tiers were captured out of stock."),
    change("simplepeptide.com", "Traffic", "Estimated", "Simple leads the modeled traffic cohort", "The public-rank scenario produced 258,965 monthly visits and a wide $349,603–$1,981,082 gross-checkout range."),
    change("umbrellalabs.is", "Catalog", "Observed", "Umbrella sets the catalog-scale benchmark", "The public catalog exposed 613 products, six captured Reta offers, and a $64.99–$249.99 Reta range."),
    change("lifelinkresearch.com", "UI", "Observed", "LifeLink scores near the top", "The captured product experience scored 9.2/10 overall and 9/10 on mobile."),
    change("skyepeptides.com", "Coverage", "Unknown", "Skye catalog remains unresolved", "The public crawl did not retain a defensible Reta catalog baseline. Traffic remains modeled separately and does not cure the catalog gap.")
  ];

  window.NOLI_COMPETITOR_OBSERVATORY = {
    schemaVersion: 1,
    cohortName: "Noli fixed competitor cohort",
    generatedAt: capturedAt,
    capturedAt,
    windowDays: 90,
    expectedCompanyCount: 25,
    states: ["Verified", "Observed", "Estimated", "Unknown"],
    companies,
    changes,
    methodology: {
      scope: "Fixed 25-company cohort selected for a 90-day operating watch. The committed file is a safe baseline, not an automatic claim that a change occurred.",
      freshness: "The page attempts a bounded live refresh from the sanitized observatory API. If that fails or is invalid, this committed baseline remains usable.",
      pricing: "Anonymous public catalog prices and stock cues are point-in-time observations. They are not completed orders, physical inventory, quality, or legality.",
      traffic: "Traffic and GMV are modeled scenarios. They are not first-party analytics, measured revenue, processor settlements, or profit.",
      checkout: "Public code and checkout labels can name a provider or method. They do not prove a successful transaction, underwriting, MID, acquirer, reserves, or durability.",
      marketing: "Pixels, tags, affiliate pages, promotions, and content are public signals. Their presence does not prove spend, attribution, traffic share, or profitable acquisition.",
      safety: "Only public, anonymous, non-transactional evidence is represented. No credentials, payment submission, gate bypass, private customer data, or leaked personal information."
    }
  };
})();

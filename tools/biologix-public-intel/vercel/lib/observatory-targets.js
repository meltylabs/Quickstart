const definitions = [
  ["biologix", "Biologix Labs Research", "biologixlabsresearch.com", "https://biologixlabsresearch.com/product/retatrutide/", "anchor", 0, "woocommerce"],
  ["royal", "Royal Peptides", "royal-peptides.com", "https://royal-peptides.com/shop/retatrutide-vial/", "commerce", 0, "woocommerce"],
  ["riptide", "Riptide Wellness", "riptidewellness.com", "https://riptidewellness.com/product/glp3-r/", "payment", 0, "woocommerce"],
  ["polaris", "Polaris Peptides", "polarispeptides.com", "https://polarispeptides.com/product/retatrutide-10mg-2/", "testing", 0, "woocommerce"],
  ["pepta", "Pepta Labs", "peptalabs.com", "https://peptalabs.com/peptides/retatrutide-20mg", "design_growth", 0, "product_page"],

  ["northline", "Northline Labs", "northlinelabs.org", "https://northlinelabs.org/product/reta-glp-3/", "anchor", 1, "woocommerce"],
  ["northwest", "Northwest Peptides", "northwestpeptides.com", "https://northwestpeptides.com/product/glp-3/", "commerce", 1, "woocommerce"],
  ["rivn", "RIVN Peptides", "rivnpeptides.com", "https://rivnpeptides.com/product/reta/", "payment", 1, "woocommerce"],
  ["peptide-partners", "Peptide Partners", "peptide.partners", "https://peptide.partners/product/glp-3-retatrutide/", "testing", 1, "woocommerce"],
  ["peptide-hackers", "Peptide Hackers", "peptidehackers.com", "https://www.peptidehackers.com/products/retatrutide", "design_growth", 1, "product_page"],

  ["bluum", "Bluum Peptides", "bluumpeptides.com", "https://bluumpeptides.com/products/retatrutide", "anchor", 2, "shopify"],
  ["lifelink", "LifeLink Research", "lifelinkresearch.com", "https://lifelinkresearch.com/product/retatrutide-glp-3-20mg/", "commerce", 2, "woocommerce"],
  ["nurev", "Nurev Peptides", "nurevpeptides.com", "https://nurevpeptides.com/product/retatrutide/", "payment", 2, "woocommerce"],
  ["skye", "Skye Peptides", "skyepeptides.com", "https://skyepeptides.com/", "testing", 2, "product_page"],
  ["greatest", "Greatest Peptides", "greatestpeptides.com", "https://greatestpeptides.com/product/retatrutide-40-mg/", "design_growth", 2, "woocommerce"],

  ["sparta", "Sparta Labs", "spartalabs.net", "https://spartalabs.net/us/products/retatrutide", "anchor", 3, "product_page"],
  ["adapt", "Adapt Peptides", "adaptpeptides.com", "https://adaptpeptides.com/product/retatrutide/", "commerce", 3, "woocommerce"],
  ["orion", "Orion Peptide", "orionpeptide.com", "https://orionpeptide.com/product/retatrutide-10mg/", "payment", 3, "woocommerce"],
  ["simple", "Simple Peptide", "simplepeptide.com", "https://simplepeptide.com/", "testing", 3, "woocommerce"],
  ["peptira", "Peptira", "peptira.com", "https://peptira.com/product/reta3-9/", "design_growth", 3, "woocommerce"],

  ["genetic", "Genetic Peptide", "geneticpeptide.com", "https://geneticpeptide.com/product/glp-r-vial-2/", "commerce", 4, "woocommerce"],
  ["onyx-bio", "Onyx Bio Labs", "onyxbiolabs.com", "https://onyxbiolabs.com/product/retatrutide-peptide/", "commerce", 4, "woocommerce"],
  ["umbrella", "Umbrella Labs", "umbrellalabs.is", "https://umbrellalabs.is/shop/peptides/peptide-glps/retatrutide-ly-3437943/", "commerce", 4, "woocommerce"],
  ["research-chem-hq", "ResearchChemHQ", "researchchemhq.co", "https://researchchemhq.co/product/rc-3r/", "payment", 4, "woocommerce"],
  ["oasis", "Oasis Peptides", "myoasislabs.com", "https://myoasislabs.com/product/glp3r/", "testing", 4, "woocommerce"],
];

function normalizeHost(value) {
  return String(value).trim().toLowerCase().replace(/^www\./, "");
}

const retaAliasesById = Object.freeze({
  biologix: ["glp-3r"],
  northline: ["reta-glp-3"],
  northwest: ["glp-3"],
  riptide: ["glp3-r"],
  genetic: ["glp-r-vial-2", "glp-r"],
  "research-chem-hq": ["rc-3r"],
});

export const OBSERVATORY_TARGETS = definitions.map(
  ([id, name, domain, productUrl, cohort, shard, catalogAdapter]) => {
    const normalizedDomain = normalizeHost(domain);
    return Object.freeze({
      id,
      name,
      domain: normalizedDomain,
      homepage_url: `https://${normalizedDomain}/`,
      product_url: productUrl,
      catalog_adapter: catalogAdapter,
      catalog_url:
        catalogAdapter === "woocommerce"
          ? `https://${normalizedDomain}/wp-json/wc/store/v1/products`
          : catalogAdapter === "shopify"
            ? `https://${normalizedDomain}/products.json`
            : null,
      reta_aliases: Object.freeze(retaAliasesById[id] ?? []),
      cohort,
      shard,
      allowed_hosts: Object.freeze([
        normalizedDomain,
        `www.${normalizedDomain}`,
      ]),
    });
  },
);

export const SHARD_COUNT = 5;
export const TARGETS_PER_SHARD = 5;

export function targetsForShard(shard) {
  const parsed = Number.parseInt(shard, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= SHARD_COUNT) {
    throw new Error(`Invalid observatory shard: ${shard}`);
  }
  return OBSERVATORY_TARGETS.filter((target) => target.shard === parsed);
}

export function assertTargetRegistry() {
  if (OBSERVATORY_TARGETS.length !== SHARD_COUNT * TARGETS_PER_SHARD) {
    throw new Error("Observatory registry must contain exactly 25 targets");
  }
  for (let shard = 0; shard < SHARD_COUNT; shard += 1) {
    if (targetsForShard(shard).length !== TARGETS_PER_SHARD) {
      throw new Error(`Observatory shard ${shard} must contain five targets`);
    }
  }
  const ids = new Set(OBSERVATORY_TARGETS.map((target) => target.id));
  const domains = new Set(OBSERVATORY_TARGETS.map((target) => target.domain));
  if (ids.size !== OBSERVATORY_TARGETS.length || domains.size !== OBSERVATORY_TARGETS.length) {
    throw new Error("Observatory target ids and domains must be unique");
  }
  return true;
}

assertTargetRegistry();

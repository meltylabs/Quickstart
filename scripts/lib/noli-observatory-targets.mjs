const target = (domain, brand, cohort, catalogAdapter) =>
  Object.freeze({
    domain,
    brand,
    cohort,
    catalogAdapter,
    homepageUrl: `https://${domain}/`,
    catalogUrl:
      catalogAdapter === "woocommerce"
        ? `https://${domain}/wp-json/wc/store/v1/products`
        : catalogAdapter === "shopify"
          ? `https://${domain}/products.json`
          : null,
  });

/**
 * This cohort is intentionally fixed for a complete 90-day comparison window.
 * Changing it requires a new registry version rather than silently rewriting
 * the meaning of an existing time series.
 */
export const NOLI_OBSERVATORY_REGISTRY = Object.freeze({
  version: "2026-07-29.top25.v1",
  validFrom: "2026-07-29",
  lockedUntil: "2026-10-27",
  targets: Object.freeze([
    target("biologixlabsresearch.com", "Biologix Labs Research", "anchors", "woocommerce"),
    target("northlinelabs.org", "Northline Labs", "anchors", "woocommerce"),
    target("bluumpeptides.com", "Bluum Peptides", "anchors", "shopify"),
    target("spartalabs.net", "Sparta Labs", "anchors", "page_only"),

    target("royal-peptides.com", "Royal Peptides", "commerce", "woocommerce"),
    target("northwestpeptides.com", "Northwest Peptides", "commerce", "woocommerce"),
    target("lifelinkresearch.com", "LifeLink Research", "commerce", "woocommerce"),
    target("adaptpeptides.com", "Adapt Peptides", "commerce", "woocommerce"),
    target("geneticpeptide.com", "Genetic Peptide", "commerce", "woocommerce"),
    target("onyxbiolabs.com", "Onyx Bio Labs", "commerce", "woocommerce"),
    target("umbrellalabs.is", "Umbrella Labs", "commerce", "woocommerce"),

    target("riptidewellness.com", "Riptide Wellness", "payment", "woocommerce"),
    target("rivnpeptides.com", "RIVN Peptides", "payment", "woocommerce"),
    target("nurevpeptides.com", "Nurev Peptides", "payment", "woocommerce"),
    target("orionpeptide.com", "Orion Peptide", "payment", "woocommerce"),
    target("researchchemhq.co", "Research Chem HQ", "payment", "woocommerce"),

    target("polarispeptides.com", "Polaris Peptides", "testing", "woocommerce"),
    target("peptide.partners", "Peptide Partners", "testing", "woocommerce"),
    target("skyepeptides.com", "Skye Peptides", "testing", "page_only"),
    target("simplepeptide.com", "Simple Peptide", "testing", "woocommerce"),
    target("myoasislabs.com", "My Oasis Labs", "testing", "woocommerce"),

    target("peptalabs.com", "Pepta Labs", "design_growth", "page_only"),
    target("peptidehackers.com", "Peptide Hackers", "design_growth", "page_only"),
    target("greatestpeptides.com", "Greatest Peptides", "design_growth", "woocommerce"),
    target("peptira.com", "Peptira", "design_growth", "woocommerce"),
  ]),
});

export const NOLI_OBSERVATORY_TARGETS = NOLI_OBSERVATORY_REGISTRY.targets;

export function assertObservatoryRegistry(registry = NOLI_OBSERVATORY_REGISTRY) {
  const domains = registry.targets.map(({ domain }) => domain);
  if (domains.length !== 25) {
    throw new Error(`Observatory registry must contain exactly 25 targets; got ${domains.length}`);
  }
  if (new Set(domains).size !== domains.length) {
    throw new Error("Observatory registry contains duplicate domains");
  }
  if (!registry.version || !registry.validFrom || !registry.lockedUntil) {
    throw new Error("Observatory registry is missing version or lock dates");
  }
  return registry;
}

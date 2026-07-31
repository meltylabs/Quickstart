import assert from "node:assert/strict";
import test from "node:test";

import { collectObservatoryTarget } from "../lib/observatory-collector.js";
import { OBSERVATORY_TARGETS } from "../lib/observatory-targets.js";

const NOW = Date.parse("2026-07-29T01:00:00.000Z");
const LOOKUP = async () => [{ address: "8.8.8.8", family: 4 }];

function target(adapter = "woocommerce") {
  return {
    id: "fixture",
    name: "Fixture Labs",
    domain: "catalog.example",
    homepage_url: "https://catalog.example/",
    product_url: "https://catalog.example/product/retatrutide/",
    catalog_adapter: adapter,
    catalog_url:
      adapter === "woocommerce"
        ? "https://catalog.example/wp-json/wc/store/v1/products"
        : adapter === "shopify"
          ? "https://catalog.example/products.json"
          : null,
    cohort: "fixture",
    shard: 0,
    allowed_hosts: ["catalog.example"],
  };
}

function wooProduct(id, overrides = {}) {
  return {
    id,
    parent: 0,
    type: "simple",
    name: `Peptide ${id}`,
    permalink: `https://catalog.example/product/${id}/`,
    sku: `SKU-${id}`,
    prices: {
      price: String(id * 100),
      regular_price: String(id * 125),
      currency_code: "USD",
      currency_minor_unit: 2,
    },
    is_in_stock: true,
    is_on_backorder: false,
    categories: [{ name: "Research peptides" }],
    ...overrides,
  };
}

function dependencies(fetchImpl) {
  return {
    fetchImpl,
    lookupImpl: LOOKUP,
    now: () => NOW,
  };
}

test("the fixed panel routes 21 stores to full public feeds and four to page fallback", () => {
  assert.equal(
    OBSERVATORY_TARGETS.filter((entry) => entry.catalog_adapter === "woocommerce").length,
    20,
  );
  assert.equal(
    OBSERVATORY_TARGETS.filter((entry) => entry.catalog_adapter === "shopify").length,
    1,
  );
  assert.equal(
    OBSERVATORY_TARGETS.filter((entry) => entry.catalog_adapter === "product_page").length,
    4,
  );
  assert.ok(
    OBSERVATORY_TARGETS
      .filter((entry) => entry.catalog_adapter !== "product_page")
      .every((entry) => entry.catalog_url?.startsWith(`https://${entry.domain}/`)),
  );
});

test("daily Woo collection paginates the complete parent and variation feeds", async () => {
  const calls = [];
  const parents = Array.from({ length: 100 }, (_, index) =>
    wooProduct(index + 1, index === 0 ? { type: "variable", name: "Retatrutide" } : {}),
  );
  const variation = wooProduct(1001, {
    parent: 1,
    type: "variation",
    name: "Retatrutide",
    variation: [{ attribute: "Size", value: "10mg" }],
    prices: {
      price: "8000",
      regular_price: "9000",
      currency_code: "USD",
      currency_minor_unit: 2,
    },
  });
  const fetchImpl = async (url, options) => {
    calls.push(url.toString());
    assert.equal(options.method, "GET");
    assert.ok(options.dispatcher);
    assert.match(options.headers["User-Agent"], /^NoliCompetitorObservatory\/1\.0/);
    if (url.pathname === "/") {
      return new Response("<title>Fixture Labs</title>", { status: 200 });
    }
    const page = Number(url.searchParams.get("page"));
    const isVariation = url.searchParams.get("type") === "variation";
    const payload = isVariation
      ? page === 1
        ? [variation]
        : []
      : page === 1
        ? parents
        : page === 2
          ? [wooProduct(101)]
          : [];
    return Response.json(payload);
  };

  const result = await collectObservatoryTarget(
    target("woocommerce"),
    "daily",
    dependencies(fetchImpl),
  );

  assert.equal(result.status, "complete");
  assert.equal(result.commerce.catalog_complete, true);
  assert.equal(result.commerce.coverage, "complete_public_woocommerce_feed");
  assert.equal(result.commerce.product_count, 101);
  assert.equal(result.commerce.variant_count, 101);
  assert.equal(result.commerce.reta_offer_count, 1);
  assert.equal(result.commerce.offers.find((offer) => offer.public_variant_id === "1001").price, 80);
  assert.ok(calls.some((url) => /page=2/.test(url) && !/type=variation/.test(url)));
  assert.ok(calls.every((url) => !/cart|checkout|account/i.test(new URL(url).pathname)));
});

test("daily Shopify collection paginates every public product and variant", async () => {
  const calls = [];
  const shopifyProduct = (id) => ({
    id,
    title: id === 1 ? "Retatrutide" : `Peptide ${id}`,
    handle: `peptide-${id}`,
    product_type: "Research",
    variants: [{
      id: id * 10,
      sku: `SHOP-${id}`,
      price: String(50 + id / 100),
      compare_at_price: null,
      available: true,
      option1: "10mg",
    }],
  });
  const firstPage = Array.from({ length: 250 }, (_, index) => shopifyProduct(index + 1));
  const fetchImpl = async (url) => {
    calls.push(url.toString());
    if (url.pathname === "/") return new Response("<title>Fixture Labs</title>");
    const page = Number(url.searchParams.get("page"));
    return Response.json({
      products: page === 1 ? firstPage : page === 2 ? [shopifyProduct(251)] : [],
    });
  };

  const result = await collectObservatoryTarget(
    target("shopify"),
    "daily",
    dependencies(fetchImpl),
  );

  assert.equal(result.status, "complete");
  assert.equal(result.commerce.catalog_complete, true);
  assert.equal(result.commerce.coverage, "complete_public_shopify_feed");
  assert.equal(result.commerce.product_count, 251);
  assert.equal(result.commerce.variant_count, 251);
  assert.equal(result.commerce.reta_offer_count, 1);
  assert.ok(calls.some((url) => /page=2/.test(url)));
});

test("JSON catalog copy is not mistaken for an HTML account interstitial", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname === "/") return new Response("<title>Fixture Labs</title>");
    const isVariation = url.searchParams.get("type") === "variation";
    return Response.json(
      isVariation
        ? []
        : [wooProduct(1, { name: "Sign in to continue shopping research reference" })],
    );
  };
  const result = await collectObservatoryTarget(
    target("woocommerce"),
    "daily",
    dependencies(fetchImpl),
  );
  assert.equal(result.status, "complete");
  assert.equal(result.commerce.offers.length, 1);
});

test("fixed GLP-R, RC-3R, and GLP3-R aliases classify their catalog offers as Reta", async () => {
  const cases = [
    ["genetic", "GLP-R Vial 2"],
    ["research-chem-hq", "RC-3R"],
    ["riptide", "GLP3-R"],
  ];
  for (const [id, productName] of cases) {
    const configured = OBSERVATORY_TARGETS.find((entry) => entry.id === id);
    const fetchImpl = async (url) => {
      if (url.pathname === "/") return new Response(`<title>${configured.name}</title>`);
      const isVariation = url.searchParams.get("type") === "variation";
      return Response.json(
        isVariation
          ? []
          : [wooProduct(1, {
              name: productName,
              permalink: `https://${configured.domain}/product/alternate-path/`,
            })],
      );
    };
    const result = await collectObservatoryTarget(
      configured,
      "daily",
      dependencies(fetchImpl),
    );
    assert.equal(result.commerce.reta_offer_count, 1, id);
    assert.equal(result.commerce.offers[0].is_retatrutide, true, id);
  }
});

test("a later non-2xx feed page yields a bounded partial catalog and is never parsed", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => wooProduct(index + 1));
  const fetchImpl = async (url) => {
    if (url.pathname === "/") return new Response("<title>Fixture Labs</title>");
    const page = Number(url.searchParams.get("page"));
    const isVariation = url.searchParams.get("type") === "variation";
    if (isVariation) return Response.json([]);
    if (page === 1) return Response.json(firstPage);
    return new Response(
      JSON.stringify([wooProduct(999, { name: "Must not be parsed" })]),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  };

  const result = await collectObservatoryTarget(
    target("woocommerce"),
    "daily",
    dependencies(fetchImpl),
  );

  assert.equal(result.status, "partial");
  assert.equal(result.commerce.catalog_complete, false);
  assert.equal(result.commerce.coverage, "partial_public_woocommerce_feed");
  assert.equal(result.commerce.offers.length, 100);
  assert.ok(!result.commerce.offers.some((offer) => offer.public_variant_id === "999"));
  assert.match(result.errors.map((error) => error.message).join(" "), /HTTP 503/);
});

test("failed catalog pages never fall back to homepage commerce", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname === "/") {
      return new Response(
        `<title>Homepage</title><script type="application/ld+json">
          {"@type":"Offer","price":"1.00","priceCurrency":"USD"}
        </script>`,
      );
    }
    return new Response("catalog unavailable", { status: 403 });
  };
  const result = await collectObservatoryTarget(
    target("woocommerce"),
    "daily",
    dependencies(fetchImpl),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.commerce, undefined);
  assert.match(result.errors.map((error) => error.message).join(" "), /HTTP 403/);
});

test("ordinary login and shop navigation does not become an account gate", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname === "/") {
      return new Response(
        "<title>Fixture Labs</title><nav><a>Log in</a><a>Shop peptides</a></nav>",
      );
    }
    return new Response(
      `<title>Retatrutide</title>
       <script type="application/ld+json">
         {"@type":"Offer","price":"80","priceCurrency":"USD","availability":"InStock"}
       </script>`,
      { headers: { "content-type": "text/html" } },
    );
  };
  const result = await collectObservatoryTarget(
    target("product_page"),
    "daily",
    dependencies(fetchImpl),
  );
  assert.equal(result.status, "complete");
  assert.equal(result.commerce.collection_mode, "limited");
  assert.equal(result.commerce.coverage, "limited_public_product_page");
  assert.equal(result.commerce.catalog_complete, false);
  assert.equal(result.errors.length, 0);
});

test("an ordinary public page may load CAPTCHA code without becoming a block page", async () => {
  const fixtureTarget = target("product_page");
  const result = await collectObservatoryTarget(
    fixtureTarget,
    "weekly",
    dependencies(async () =>
      new Response(
        "<html><title>Store</title><script src='https://captcha.example/widget.js'></script><p>Shop public products</p></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    ),
  );
  assert.equal(result.status, "complete");
});

test("challenge, login, and gate pages are failed observations even with HTTP 200", async () => {
  for (const body of [
    "<title>Just a moment</title>Verify you are human. Cloudflare Ray ID",
    "<title>Login</title>Sign in to continue shopping",
    "<title>Age check</title>Confirm your age. Are you 21?",
  ]) {
    const result = await collectObservatoryTarget(
      target("product_page"),
      "daily",
      dependencies(async () => new Response(body)),
    );
    assert.equal(result.status, "failed");
    assert.equal(result.commerce, undefined);
    assert.match(
      result.errors.map((error) => error.message).join(" "),
      /gate/,
    );
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_BOUNDARY,
  buildPaymentProviderRollup,
  classifyPaymentProvider,
  enrichPaymentProviders,
} from "../scripts/payment-provider-taxonomy.mjs";

test("active cart identifiers preserve the named provider and its actual layer", () => {
  const stripe = classifyPaymentProvider(
    {
      id: "mecom_stripe",
      status: "active_for_reta_cart_api",
      evidenceUrl: "https://lifelinkresearch.com/wp-json/wc/store/v1/cart",
    },
    "cart_method_id",
  );
  const nmi = classifyPaymentProvider(
    { id: "nmi", status: "active_for_reta_cart_api" },
    "cart_method_id",
  );
  const authorize = classifyPaymentProvider(
    { id: "authorize_net_cim_credit_card", status: "active_for_reta_cart_api" },
    "cart_method_id",
  );

  assert.equal(stripe.provider, "Stripe");
  assert.equal(stripe.providerClass, "processor_or_full_stack_psp");
  assert.equal(stripe.evidenceStatus, "active_for_reta_cart_api");
  assert.equal(nmi.provider, "NMI");
  assert.equal(nmi.providerClass, "gateway");
  assert.equal(authorize.provider, "Authorize.Net");
  assert.equal(authorize.providerClass, "gateway");
});

test("installed code, inactive config, and manual instructions are not promoted to active processing", () => {
  const woo = classifyPaymentProvider(
    { value: "woocommerce-payments" },
    "integration",
  );
  const disabledStripe = classifyPaymentProvider(
    { value: "Stripe", status: "configured_not_active_for_reta_cart" },
    "integration",
  );
  const paypalInstructions = classifyPaymentProvider(
    {
      id: "pr_paypal_post_order_instructions",
      status: "active_for_reta_cart_api",
    },
    "cart_method_id",
  );

  assert.equal(woo.provider, "WooPayments");
  assert.equal(woo.evidenceStatus, "public_code_marker");
  assert.equal(disabledStripe.provider, "Stripe");
  assert.equal(disabledStripe.evidenceStatus, "configured_not_active");
  assert.equal(paypalInstructions.provider, "PayPal");
  assert.equal(paypalInstructions.providerClass, "payment_method");
});

test("custom checkout IDs remain searchable instead of disappearing as unknown", () => {
  const signal = classifyPaymentProvider(
    { id: "shield_gateway", status: "active_for_reta_cart_api" },
    "cart_method_id",
  );

  assert.equal(signal.provider, "shield");
  assert.equal(signal.providerClass, "unresolved_provider");
  assert.equal(signal.codeIdentified, true);
});

test("rollups count code and active evidence without erasing the private-chain boundary", () => {
  const providerSignals = enrichPaymentProviders({
    methods: [
      {
        id: "bankful_hosted_gateway",
        status: "active_for_reta_cart_api",
      },
      {
        id: "pay_with_affirm_shopify",
        status: "active_for_reta_cart_api",
      },
    ],
  });
  const rollup = buildPaymentProviderRollup({
    "example.test": { payment: { providerSignals } },
  });

  assert.equal(rollup.providers.Bankful.activeRetaCartDomainCount, 1);
  assert.equal(rollup.providers.Affirm.activeRetaCartDomainCount, 1);
  assert.match(PROVIDER_BOUNDARY, /Public code can identify a payment provider/i);
  assert.match(PROVIDER_BOUNDARY, /acquiring/i);
});

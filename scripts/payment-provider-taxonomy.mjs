const PROVIDER_BOUNDARY =
  "Public code can identify a payment provider or integration. It does not by itself prove activation, a successful transaction, written underwriting for the catalog, the merchant of record, the downstream processor when a gateway can route to several, or the acquiring and sponsor-bank chain.";

export const PAYMENT_PROVIDER_TAXONOMY = Object.freeze([
  {
    provider: "Stripe",
    pattern: /(?:\bstripe\b|mecom[_-]stripe|stripe[_-](?:payment|gateway)|js\.stripe\.com)/i,
    roles: ["payment service provider", "payment processor"],
    providerClass: "processor_or_full_stack_psp",
    officialUrl: "https://stripe.com/resources/more/payment-service-providers",
  },
  {
    provider: "WooPayments",
    pattern: /(?:\bwoopayments\b|woocommerce[_-]payments|\bwcpay\b)/i,
    roles: ["payment service provider", "payment processing product"],
    providerClass: "processor_or_full_stack_psp",
    officialUrl: "https://woocommerce.com/payments/",
  },
  {
    provider: "Square",
    pattern: /(?:\bsquare\b|squareup\.com|woocommerce[_-]square)/i,
    roles: ["payment service provider", "payment processor"],
    providerClass: "processor_or_full_stack_psp",
    officialUrl: "https://squareup.com/us/en/legal/general/payment",
  },
  {
    provider: "PayPal",
    pattern: /(?:\bpaypal\b|mecom[_-]paypal|pr[_-]paypal)/i,
    roles: ["digital wallet", "payment service provider", "payment processor"],
    providerClass: "processor_or_full_stack_psp",
    officialUrl: "https://www.paypal.com/us/brc/article/how-paypal-works-for-sellers",
  },
  {
    provider: "Airwallex",
    pattern: /(?:\bairwallex\b|airwallex[_-]online[_-]payments)/i,
    roles: ["payment service provider", "payment processor"],
    providerClass: "processor_or_full_stack_psp",
    officialUrl: "https://www.airwallex.com/en-uk/blog/payment-service-provider",
  },
  {
    provider: "Amazon Pay",
    pattern: /(?:\bamazon pay\b|amazon[_-]payments[_-]advanced)/i,
    roles: ["digital wallet", "payment service provider"],
    providerClass: "processor_or_full_stack_psp",
    officialUrl: "https://pay.amazon.com/",
  },
  {
    provider: "QuickBooks Payments",
    pattern: /(?:quickbooks payments|intuit qbms|gateway[_-]intuit[_-]qbms)/i,
    roles: ["payment processor"],
    providerClass: "processor_or_full_stack_psp",
    officialUrl: "https://quickbooks.intuit.com/payments/",
  },
  {
    provider: "Braintree",
    pattern: /(?:\bbraintree\b|braintreegateway\.com)/i,
    roles: ["payment gateway", "payment service provider"],
    providerClass: "gateway_or_psp",
    officialUrl: "https://developer.paypal.com/braintree/docs/guides/overview",
  },
  {
    provider: "Adyen",
    pattern: /(?:\badyen\b|checkoutshopper-live\.adyen\.com)/i,
    roles: ["payment service provider", "acquirer"],
    providerClass: "processor_or_full_stack_psp",
    officialUrl: "https://www.adyen.com/knowledge-hub/payment-service-provider",
  },
  {
    provider: "NMI",
    pattern: /(?:\bnmi\b|\bnmipay\b|network merchants|secure\.networkmerchants\.com)/i,
    roles: ["payment gateway"],
    providerClass: "gateway",
    officialUrl: "https://www.nmi.com/products/payment-gateway/",
  },
  {
    provider: "Authorize.Net",
    pattern: /(?:authorize[._ -]?net|\banet\b|accept\.authorize\.net)/i,
    roles: ["payment gateway"],
    providerClass: "gateway",
    officialUrl: "https://www.authorize.net/payments.html",
  },
  {
    provider: "Bankful",
    pattern: /\bbankful\b/i,
    roles: ["payment gateway", "payment service provider", "conditional payment facilitator"],
    providerClass: "gateway_or_psp",
    officialUrl: "https://bankful.com/",
  },
  {
    provider: "Link Money",
    pattern: /(?:\blinkmoney\b|link[._ -]?money|\blink\.money\b)/i,
    roles: ["pay-by-bank provider"],
    providerClass: "bank_payment_provider",
    officialUrl: "https://link.money/product/pay-by-bank",
  },
  {
    provider: "Paynote / Seamless ACH",
    pattern: /(?:\bpaynote\b|seamlesschex|seamless ach)/i,
    roles: ["ACH payment provider", "bank checkout"],
    providerClass: "bank_payment_provider",
    officialUrl: "https://developers-ach.seamlesschex.com/docs/overview",
  },
  {
    provider: "eDebit Direct",
    pattern: /(?:\bedebit\b|e-debit direct|edd[_-]draft[_-]yodlee|direct-draft-plaid)/i,
    roles: ["bank payment provider", "card processing provider"],
    providerClass: "bank_payment_provider",
    officialUrl: "https://edebitdirect.com/low-fee-payment-processing/",
  },
  {
    provider: "CircoFlows",
    pattern: /\bcircoflows\b/i,
    roles: ["payment processing provider"],
    providerClass: "processor_or_full_stack_psp",
    officialUrl: "https://circoflows.com/solutions",
  },
  {
    provider: "NOWPayments",
    pattern: /\bnowpayments\b/i,
    roles: ["crypto payment gateway"],
    providerClass: "crypto_payment_provider",
    officialUrl: "https://nowpayments.io/payment-integration",
  },
  {
    provider: "Blockonomics",
    pattern: /\bblockonomics\b/i,
    roles: ["crypto payment gateway"],
    providerClass: "crypto_payment_provider",
    officialUrl: "https://www.blockonomics.co/merchants",
  },
  {
    provider: "BTCPay Server",
    pattern: /(?:\bbtcpay\b|btcpaygf)/i,
    roles: ["self-hosted crypto payment server"],
    providerClass: "crypto_payment_provider",
    officialUrl: "https://docs.btcpayserver.org/Guide/",
  },
  {
    provider: "ForumPay",
    pattern: /\bforumpay\b/i,
    roles: ["crypto payment gateway"],
    providerClass: "crypto_payment_provider",
    officialUrl: "https://forumpay.com/",
  },
  {
    provider: "PayGate.to",
    pattern: /(?:\bpaygate\.to\b|paygatedotto|paygate[_-]to)/i,
    roles: ["checkout integration"],
    providerClass: "unresolved_provider",
    officialUrl: "https://paygate.to/",
  },
  {
    provider: "Coinbase Commerce",
    pattern: /(?:coinbase commerce|coinbase[_-]commerce|commerce\.coinbase\.com)/i,
    roles: ["crypto payment platform"],
    providerClass: "crypto_payment_provider",
    officialUrl: "https://www.coinbase.com/commerce",
  },
  {
    provider: "OpenNode",
    pattern: /\bopennode\b/i,
    roles: ["bitcoin payment provider"],
    providerClass: "crypto_payment_provider",
    officialUrl: "https://www.opennode.com/",
  },
  {
    provider: "IDEM",
    pattern: /(?:^|\W)idem(?:\W|$)/i,
    roles: ["bank checkout integration"],
    providerClass: "unresolved_provider",
    officialUrl: null,
  },
  {
    provider: "Truvo",
    pattern: /\btruvo\b/i,
    roles: ["checkout integration"],
    providerClass: "unresolved_provider",
    officialUrl: null,
  },
  {
    provider: "Veylo",
    pattern: /\bveylo\b/i,
    roles: ["checkout integration"],
    providerClass: "unresolved_provider",
    officialUrl: null,
  },
  {
    provider: "PipePay",
    pattern: /\bpipepay\b/i,
    roles: ["checkout integration"],
    providerClass: "unresolved_provider",
    officialUrl: null,
  },
  {
    provider: "Quiklie",
    pattern: /\bquiklie\b/i,
    roles: ["checkout integration"],
    providerClass: "unresolved_provider",
    officialUrl: null,
  },
  {
    provider: "Zelle",
    pattern: /(?:^|\W)(?:zelle|gp[_-]zelle|regentide[_-]zelle)(?:\W|$)/i,
    roles: ["P2P payment method"],
    providerClass: "payment_method",
    officialUrl: "https://www.zellepay.com/",
  },
  {
    provider: "Venmo",
    pattern: /(?:^|\W)(?:venmo|peptipay[_-]venmo)(?:\W|$)/i,
    roles: ["digital wallet", "P2P payment method"],
    providerClass: "payment_method",
    officialUrl: "https://venmo.com/business/",
  },
  {
    provider: "Cash App",
    pattern: /(?:cash ?app|cashapp|regentide[_-]cashapp)/i,
    roles: ["wallet or manual payment method"],
    providerClass: "payment_method",
    officialUrl: "https://cash.app/business",
  },
  {
    provider: "CashEnvoy",
    pattern: /\bcashenvoy\b/i,
    roles: ["payment gateway"],
    providerClass: "gateway",
    officialUrl: "https://cashenvoy.com/",
  },
  {
    provider: "Apple Pay",
    pattern: /(?:apple ?pay|pep[_-]applepay)/i,
    roles: ["digital wallet"],
    providerClass: "payment_method",
    officialUrl: "https://developer.apple.com/apple-pay/",
  },
  {
    provider: "Affirm",
    pattern: /\baffirm\b/i,
    roles: ["buy now, pay later provider"],
    providerClass: "payment_method",
    officialUrl: "https://www.affirm.com/business",
  },
  {
    provider: "Bank transfer / ACH",
    pattern: /(?:^|\W)(?:bacs|wise[_-]ach|bank transfer|ach)(?:\W|$)/i,
    roles: ["bank transfer method"],
    providerClass: "payment_method",
    officialUrl: null,
  },
  {
    provider: "Manual check or cash on delivery",
    pattern: /(?:^|\W)(?:cheque|check|cod)(?:\W|$)/i,
    roles: ["manual payment method"],
    providerClass: "payment_method",
    officialUrl: null,
  },
  {
    provider: "Generic crypto method",
    pattern: /(?:^|\W)(?:crypto|cryptopay|mycryptocheckout|gp[_-](?:btc|eth|usdt)|bytenft)(?:\W|$)/i,
    roles: ["crypto payment method or custom integration"],
    providerClass: "crypto_payment_provider",
    officialUrl: null,
  },
]);

const textFor = (value) => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value !== "object") return "";
  return [
    value.provider,
    value.value,
    value.name,
    value.id,
    value.label,
    value.method,
  ].filter(Boolean).join(" ");
};

const evidenceStatusFor = (value, sourceLayer) => {
  const status = String(value?.status || "").toLowerCase();
  if (
    status.includes("configured_not_active") ||
    status.includes("configured_but_not_active") ||
    (status.includes("configured") && status.includes("inactive"))
  ) {
    return "configured_not_active";
  }
  if (status.includes("active_for_reta_cart")) return "active_for_reta_cart_api";
  if (status.includes("rendered")) return "rendered_at_checkout";
  if (status.includes("public_claim") || sourceLayer === "visible_method") {
    return "public_claim_or_logo";
  }
  return "public_code_marker";
};

const confidenceFor = (value, evidenceStatus) => {
  if (evidenceStatus === "active_for_reta_cart_api") return "high";
  if (evidenceStatus === "rendered_at_checkout") return "high";
  if (evidenceStatus === "configured_not_active") return "medium";
  if (evidenceStatus === "public_claim_or_logo") return "low";
  return value?.confidence || "medium";
};

const humanizeIdentifier = (value) =>
  String(value || "")
    .replace(/(?:_gateway|_payments?|_payment)$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function classifyPaymentProvider(value, sourceLayer = "integration", options = {}) {
  const token = textFor(value).trim();
  if (!token) return null;
  const sourceToken =
    value?.id || value?.value || value?.name || value?.label || token;
  const normalizedSourceToken = String(sourceToken).replace(/[._-]+/g, " ");
  const normalizedToken = token.replace(/[._-]+/g, " ");
  const manualPayPalInstructions = /pr[_-]paypal[_-]post[_-]order[_-]instructions/i.test(
    String(sourceToken)
  );
  const taxonomy =
    PAYMENT_PROVIDER_TAXONOMY.find(
      (entry) =>
        entry.pattern.test(String(sourceToken)) ||
        entry.pattern.test(normalizedSourceToken)
    ) ||
    PAYMENT_PROVIDER_TAXONOMY.find(
      (entry) => entry.pattern.test(token) || entry.pattern.test(normalizedToken)
    );
  const evidenceStatus = evidenceStatusFor(value, sourceLayer);
  const unresolvedIntegration =
    !taxonomy &&
    sourceLayer !== "visible_method" &&
    (sourceLayer === "cart_method_id" ||
      value?.id ||
      /(?:gateway|pay|payment|checkout|processor)/i.test(token));
  if (!taxonomy && !unresolvedIntegration) return null;

  return {
    provider: taxonomy?.provider || humanizeIdentifier(sourceToken),
    roles: manualPayPalInstructions
      ? ["manual post-order payment instruction"]
      : taxonomy?.roles || ["custom checkout integration"],
    providerClass: manualPayPalInstructions
      ? "payment_method"
      : taxonomy?.providerClass || "unresolved_provider",
    sourceToken: String(sourceToken),
    sourceLayer,
    evidenceStatus,
    evidenceUrl: value?.evidenceUrl || options.evidenceUrl || null,
    capturedAt: value?.observedAt || value?.capturedAt || options.capturedAt || null,
    confidence: confidenceFor(value, evidenceStatus),
    officialUrl: taxonomy?.officialUrl || null,
    codeIdentified: evidenceStatus !== "public_claim_or_logo",
    whatCodeProves:
      evidenceStatus === "active_for_reta_cart_api"
        ? "The storefront returned this provider-branded method for the tested anonymous Reta cart."
        : evidenceStatus === "rendered_at_checkout"
          ? "The provider-branded method rendered in the public checkout state."
          : evidenceStatus === "configured_not_active"
            ? "The provider integration was configured or exposed but was not active for the tested Reta cart."
            : "A provider-branded integration marker was present in public HTML, JavaScript, plugin, or API output.",
    boundary: PROVIDER_BOUNDARY,
  };
}

const valuesFor = (payment, key) => {
  const value = payment?.[key];
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
};

export function enrichPaymentProviders(payment = {}, options = {}) {
  const candidates = [
    ...valuesFor(payment, "methods").map((value) => [value, value?.id ? "cart_method_id" : "visible_method"]),
    ...valuesFor(payment, "checkoutIntegration").map((value) => [value, "integration"]),
    ...valuesFor(payment, "gatewayPsp").map((value) => [value, "gateway_or_psp"]),
    ...valuesFor(payment, "processorIso").map((value) => [value, "processor_or_iso"]),
    ...valuesFor(payment, "acquirerSponsorBank").map((value) => [value, "acquirer_or_bank"]),
  ];
  const seen = new Set();
  return candidates
    .map(([value, sourceLayer]) => {
      const evidenceIds = Array.isArray(value?.evidenceIds) ? value.evidenceIds : [];
      const evidenceUrl =
        value?.evidenceUrl ||
        evidenceIds.map((id) => options.evidenceById?.get(id)?.url).find(Boolean) ||
        null;
      return classifyPaymentProvider(value, sourceLayer, {
        evidenceUrl,
        capturedAt: options.capturedAt,
      });
    })
    .filter(Boolean)
    .filter((signal) => {
      const key = [
        signal.provider,
        signal.sourceToken,
        signal.evidenceStatus,
        signal.evidenceUrl,
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function buildPaymentProviderRollup(audits = {}) {
  const byProvider = new Map();
  let domainsWithCodeIdentifiedProviders = 0;
  let domainsWithActiveProviderMethods = 0;

  for (const [domain, audit] of Object.entries(audits)) {
    const signals = audit?.payment?.providerSignals || [];
    if (signals.some((signal) => signal.codeIdentified)) {
      domainsWithCodeIdentifiedProviders += 1;
    }
    if (signals.some((signal) => signal.evidenceStatus === "active_for_reta_cart_api")) {
      domainsWithActiveProviderMethods += 1;
    }
    for (const signal of signals) {
      const record = byProvider.get(signal.provider) || {
        provider: signal.provider,
        roles: signal.roles,
        providerClass: signal.providerClass,
        officialUrl: signal.officialUrl,
        codeDomains: new Set(),
        activeRetaCartDomains: new Set(),
        renderedCheckoutDomains: new Set(),
      };
      if (signal.codeIdentified) record.codeDomains.add(domain);
      if (signal.evidenceStatus === "active_for_reta_cart_api") {
        record.activeRetaCartDomains.add(domain);
      }
      if (signal.evidenceStatus === "rendered_at_checkout") {
        record.renderedCheckoutDomains.add(domain);
      }
      byProvider.set(signal.provider, record);
    }
  }

  return {
    domainsWithCodeIdentifiedProviders,
    domainsWithActiveProviderMethods,
    providers: Object.fromEntries(
      [...byProvider.values()]
        .sort((left, right) =>
          right.codeDomains.size - left.codeDomains.size ||
          left.provider.localeCompare(right.provider)
        )
        .map((record) => [
          record.provider,
          {
            roles: record.roles,
            providerClass: record.providerClass,
            officialUrl: record.officialUrl,
            codeDomains: [...record.codeDomains].sort(),
            codeDomainCount: record.codeDomains.size,
            activeRetaCartDomains: [...record.activeRetaCartDomains].sort(),
            activeRetaCartDomainCount: record.activeRetaCartDomains.size,
            renderedCheckoutDomains: [...record.renderedCheckoutDomains].sort(),
            renderedCheckoutDomainCount: record.renderedCheckoutDomains.size,
          },
        ])
    ),
    boundary: PROVIDER_BOUNDARY,
  };
}

export { PROVIDER_BOUNDARY };

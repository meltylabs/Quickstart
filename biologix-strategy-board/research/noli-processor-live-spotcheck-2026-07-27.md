# Noli processor / gateway live-code spot check

Captured: 2026-07-27 16:19 PDT / 23:19 UTC

Scope: current public product pages, cart pages, HTML, enqueued assets, and provider SDKs. GET requests only. No cart mutation, checkout submission, account, credentials, PII, order creation, payment attempt, or gate bypass.

## Correction

Provider and gateway names **are recoverable from public code**. The useful distinction is not “known versus unknown”; it is which layer the code proves:

1. Official SDK plus public client configuration can strongly identify the checkout provider/gateway.
2. A payment-method ID plus an enqueued provider plugin can strongly identify the storefront integration.
3. A plugin asset alone only proves that the code is installed/enqueued, not that it is currently offered.
4. Copy, logos, and generic card icons are claims, not runtime proof.
5. Even a verified gateway generally does not disclose the downstream ISO, processor relationship, sponsor/acquiring bank, merchant category treatment, reserves, or whether a transaction will settle.

The earlier statement that no processors could be identified was too broad. The public code identifies many integration/gateway/PSP names. What usually remains hidden is the **full merchant-account and acquiring chain**.

## Strong current findings

| Provider / layer | Storefront and current public evidence | Code/runtime marker | Confidence | What this proves | What it does not prove |
|---|---|---|---|---|---|
| Stripe-branded integration | [LifeLink cart](https://lifelinkresearch.com/cart/) and [public gateway JS](https://lifelinkresearch.com/wp-content/plugins/cardsshield-gateway-stripe/assets/js/checkout_hook.js?ver=2.6.6) | `cardsshield-gateway-stripe`, `mecom_stripe`, `payment_method=mecom_stripe`, Stripe-hosted-flow messaging | High for integration | A Stripe-branded CardsShield checkout integration is installed and current cart code lists `mecom_stripe`. The same-day Reta-cart audit also returned `mecom_stripe`. | It does not show the underlying merchant account, ISO/acquirer, settlement, or whether CardsShield routes every transaction directly through Stripe. |
| Stripe code present but disabled | [ResearchChemHQ Reta page](https://researchchemhq.co/product/rc-3r/) | `wcStripeSettings`; `stripe_cc`, Apple Pay, Google Pay, ACH, etc. all expose `enabled:false` and `available:false` in the current public state | High | Stripe code/configuration is present. | It is direct evidence **against** calling Stripe active in the observed state. The current configured Reta methods were other IDs, including Link Money, `mecom_paypal`, IDEM, and hosted alternatives. |
| Stripe-named drop-in | [Onyx Research cart](https://onyxresearch.shop/cart/) and [public plugin directory](https://onyxresearch.shop/wp-content/plugins/truvo-stripe-dropin/) | `truvo_dropin` in current `payment_options`; `truvo-stripe-dropin` directory resolves as an existing protected directory, unlike a nonexistent plugin path | Medium-high | A Truvo card drop-in is configured and its installed plugin is explicitly Stripe-named. The same-day Reta-cart runtime also returned `truvo_dropin`. | It does not expose the merchant/acquiring chain or prove a successful Stripe settlement. |
| Authorize.Net | [Ageless Vitality cart](https://agelessvitalitypeptides.com/cart/) | `https://js.authorize.net/v1/Accept.js`, `anet_params_cc`, public `login_id` and `client_key`, `test_mode:""` | Very high | A live-mode Authorize.Net Accept.js integration is configured. The same-day Reta-cart audit returned `anet`. | Public client identifiers are not proof of a successful transaction, current underwriting, processor/ISO, or acquiring bank. |
| Authorize.Net CIM | [Greatest Peptides cart](https://greatestpeptides.com/cart/) | `woocommerce-gateway-authorize-net-cim`, `authorize_net_cim_credit_card`, public login/client configuration | Very high | Authorize.Net CIM is installed and materially configured, not merely mentioned in copy. The same-day Reta-cart audit returned `authorize_net_cim_credit_card`. | No settlement, approval, acquirer, reserve, or merchant-account terms are exposed. |
| Authorize.Net | [Velora Research cart](https://veloraresearch.com/cart/) | No provider marker surfaced in the fresh empty-cart HTML; the same-day Reta-cart runtime returned `authorize_net` with label `Credit Card` | Medium | The item-specific runtime evidence identifies the configured method ID. | The independent empty-state source did not revalidate an official SDK or public client config, so this is weaker than Ageless/Greatest. |
| NMI | [Rivn cart](https://rivnpeptides.com/cart/) | `https://secure.nmi.com/token/Collect.js`, public tokenization key, `wc_nmi_params`, `paymentMethodSortOrder:["nmi", ...]` | Very high | NMI Collect.js tokenization and the NMI WooCommerce gateway are actively configured in public runtime code. The same-day Reta-cart audit returned `nmi`. | NMI is the gateway/tokenization layer; the merchant’s downstream processor/acquirer is not exposed. |
| NMI | [Mile High cart](https://milehighcompounds.is/cart/) | `wp-nmi-gateway-pci-woocommerce`, `wc_nmi_params` with public key, `paymentMethodSortOrder` containing `nmi` | Very high | NMI is materially configured, and the same-day Reta-cart audit returned `nmi`. | Processor/ISO/acquirer and transaction success remain unknown. |
| NMI | [Peptira cart](https://peptira.com/cart/) | `nmi3_google_pay`, `nmi3_apple_pay`, `peachpay_nmi_card`, `nmi`, `nmi_gateway_woocommerce_credit_card`, `robust_nmi_gateway` in current method order | High | Multiple NMI-facing card/wallet routes are configured in current runtime code. | The list may include fallback/rotator routes; it does not prove which path receives a given completed order. |
| NMI installed | [Genetic Peptide Reta page](https://geneticpeptide.com/product/glp-r-vial-2/) and [Real Peptides Reta page](https://www.realpeptides.co/products/trinity-x/) | `wp-nmi-gateway-pci-woocommerce` assets; current carts list `nmi` on Genetic and the same-day Reta audit returned `nmi` on Real | High on Genetic; medium-high on Real | NMI gateway code is installed; Genetic also exposes `nmi` in current cart configuration. | An enqueued stylesheet by itself is weaker than official NMI SDK/public-key evidence. |
| Bankful | [NewBioRx cart](https://newbiorx.com/cart/) and [public Bankful CSS](https://newbiorx.com/wp-content/plugins/bankful/assets/css/bf-style.css?ver=3.0.3) | `bankful`, `payment_method_bankful_hosted_gateway` selectors in the live asset; same-day Reta runtime returned `bankful_hosted_gateway` with `Venmo` label | High | Bankful’s hosted gateway integration is installed, and the Reta-specific runtime exposed it. | The visible label is not the underlying card/ACH processor, and no transaction or acquiring bank is proven. |
| Link Money | [Adapt cart](https://adaptpeptides.com/cart/), [Mile High cart](https://milehighcompounds.is/cart/), [Peptira cart](https://peptira.com/cart/), [Onyx Research cart](https://onyxresearch.shop/cart/), [Onyx BioLabs cart](https://onyxbiolabs.com/cart/), [Ignite cart](https://ignitepeptides.com/cart/) | Current public `payment_options` or `paymentMethodSortOrder` includes `linkmoney`; Peptira/Mile High expose titles/descriptions such as “Same-Day Bank Payment” and “Secure bank transfer via Link Money” | High | Link Money is a configured pay-by-bank integration across multiple current storefronts. The same-day Reta-cart audit returned it on 11 stores. | An empty-cart method list does not by itself prove item eligibility; the Reta-cart result supplies that stronger item-specific evidence. Settlement and sponsor-bank details remain hidden. |
| IDEM | [Northwest Peptides cart](https://northwestpeptides.com/cart/) | Current `payment_options:["bacs","zelle","linkmoney","idem"]` | High | IDEM is currently configured in the cart runtime. The same-day Reta-cart audit also returned `idem`. | It does not disclose the bank/acquirer relationship or transaction success. |
| IDEM installed | [Genetic Peptide Reta page](https://geneticpeptide.com/product/glp-r-vial-2/) | `woocommerce-gateway-easyprocess-idem` asset and `payment_method_easyprocess_idem` selectors | Medium | The IDEM/EasyProcess plugin is installed/enqueued. | Genetic’s current empty-cart method list did not include IDEM, so installed does not equal active. |
| eDebit Direct / Yodlee | [Nurev cart](https://nurevpeptides.com/cart/) | `edebit-direct-draft-yodlee-gateway`, current `edd_draft_yodlee_gateway` method ID | High | eDebit Direct’s Yodlee-based bank-draft integration is configured now; same-day Reta runtime returned the same ID. | It does not expose the downstream ACH originator, sponsor bank, returns profile, or settlement outcome. |
| eDebit Direct / Plaid + Yodlee | [Riptide cart](https://riptidewellness.com/cart/) | Both `edebit-direct-draft-plaid-gateway` and `edebit-direct-draft-yodlee-gateway` assets; current method list includes `edd_draft_yodlee_gateway` | High | eDebit Direct code for two bank-linking routes is installed; Yodlee is currently listed. | The presence of both plugins does not prove both are simultaneously active for every product. |
| eDebit Direct + CryptoPay | [Orion cart](https://orionpeptide.com/cart/) | `edd_draft_yodlee_gateway` in current methods, eDebit plugin assets, and `cryptopay-woocommerce` JS | High | Yodlee bank-draft and CryptoPay integrations are present; same-day Reta runtime exposed eDebit and crypto. | No payment settlement or banking chain is disclosed. |
| Paynote + Plaid | [Umbrella Labs cart](https://umbrellalabs.is/cart/) and [public Paynote CSS](https://umbrellalabs.is/wp-content/plugins/paynote/css/blocks_style.css) | `paynote` plugin, `paynote_plaid-js`, `https://cdn.plaid.com/link/v2/stable/link-initialize.js`; same-day Reta runtime returned `paynote` | High | Paynote’s Plaid-linked bank-account integration is installed and was returned for the Reta cart. | Plaid is the account-linking/data layer, not proof of the ACH processor, ODFI, sponsor bank, settlement, or approval. |
| PayPal official SDK | [Tidetopia Reta page](https://tidetopia.com/products/retatrutide-30mg) | Shopify payment button loads `https://www.paypal.com/sdk/js?...intent=capture` with a public client ID; source says `shopifyPaymentsEnabled:false` | Very high | PayPal is a directly configured accelerated checkout option on the Reta product page. | It does not prove a completed PayPal payment or disclose PayPal’s internal acquiring route. |
| PayPal-named custom gateway | [Rivn cart](https://rivnpeptides.com/cart/) | Current method order includes `mecom_paypal` and `mecom_paypal_cardfields`; same-day Reta runtime returned `mecom_paypal` | High for integration ID | A PayPal-named custom card/wallet integration is currently configured. | Without an official PayPal SDK call in this state, code alone does not prove the precise PayPal product or settlement path. |
| PayPal copy only / false-positive risk | [ResearchChemHQ Reta page](https://researchchemhq.co/product/rc-3r/), [Rivn Reta page](https://rivnpeptides.com/product/reta/), [Behemoth Reta page](https://behemothlabz.com/product/retatrutide-peptide/) | ResearchChem has payment copy; Rivn has a “secure PayPal” image; Behemoth exposes PayPal social-login code and a PayPal-instructions method ID | Low from copy/logo; medium from method ID | These sources identify claims or custom integration labels. | They do not independently prove an official PayPal checkout SDK or successful payment. Tidetopia is the clean direct-code example. |
| NOWPayments | [Rivn Reta page](https://rivnpeptides.com/product/reta/) | `nowpayments-for-woocommerce-premium` CSS/JS and crypto widgets | High for installed integration | NOWPayments code is directly present on the storefront. | The fresh empty-cart method list did not show NOWPayments; installed is not the same as currently eligible. |
| ForumPay | [Onyx BioLabs cart](https://onyxbiolabs.com/cart/) | Current `payment_options` includes `forumpay` | High | ForumPay is currently configured in the cart runtime and was returned in the same-day Reta cart. | No completed crypto invoice/payment is proven. |
| Blockonomics | [Genetic Peptide cart](https://geneticpeptide.com/cart/) | Current `payment_options` includes `blockonomics`; product source exposes `payment_method_blockonomics` | High | Blockonomics is a configured Bitcoin checkout route. | No invoice creation or payment is proven. |
| MyCryptoCheckout | [LabTrust cart](https://labtrustpeptides.com/cart/) and [public plugin JS](https://labtrustpeptides.com/wp-content/plugins/mycryptocheckout/src/static/js/mycryptocheckout.min.js?ver=2.163) | Current method ID `mycryptocheckout` and plugin assets | High | MyCryptoCheckout is currently configured. | No specific wallet, coin, invoice, or settlement is proven. |
| BTCPay | [LifeLink cart](https://lifelinkresearch.com/cart/) | Current method IDs `amgexpress` and `btcpaygf_default`, with BTCPay labels in the same-day Reta runtime | High | A BTCPay route is configured for LifeLink’s cart/Reta path. | This does not identify the node operator, wallet custody, or payment success. |
| PayerURL | [Onyx Research cart](https://onyxresearch.shop/cart/) | Current `payment_options` includes `wc_payerurl_gateway`; installed plugin directory is `payerurl-crypto-currency-payment-gateway-for-woocommerce` | High | PayerURL is configured as a crypto checkout integration and was returned for the Reta cart. | No successful crypto payment is proven. |
| CryptoPay | [Orion cart](https://orionpeptide.com/cart/) and [public block JS](https://orionpeptide.com/wp-content/plugins/cryptopay-woocommerce/assets/js/cryptopay-blocks.js) | `cryptopay-woocommerce`, current crypto method code | High for integration | CryptoPay code is installed and enqueued. | The provider’s actual eligibility and payment success for a specific transaction remain untested. |

## Square result

I scanned the 48 current Reta storefronts in the checkout cohort across both their product and public cart pages—96 current GET fetches—for strong Square markers:

- `js.squareup.com`
- `squarecdn.com`
- `squareup.com`
- `woocommerce-square`
- `square-payments`
- `payment_method_square`
- `wc_square`

**Result: zero strong Square code markers.**

[Adapt’s Reta page](https://adaptpeptides.com/product/retatrutide/) mentions Square in copy saying conventional processors do not allow peptide sales. That is not evidence that Adapt uses Square.

## Current public method-ID sample

Without adding a product, 17 of 48 public cart pages exposed configured method IDs in WooCommerce analytics or block runtime data. High-signal examples:

- LifeLink: `mecom_stripe`, `amgexpress`, `btcpaygf_default`
- Rivn: `nmi`, `mecom_paypal`, `mecom_paypal_cardfields`
- Mile High: `nmi`, `sstg_payments`, `maef_child_gateway`, `linkmoney`
- Peptira: six NMI-facing routes, `linkmoney`, and purchase-order fallback
- Onyx Research: `truvo_dropin`, `veylo_pay`, `linkmoney`, `wc_payerurl_gateway`
- Adapt: `shield_gateway`, `zelle`, `linkmoney`, `nowpayments_gateway`
- Northwest: `bacs`, `zelle`, `linkmoney`, `idem`
- Nurev: `cheque`, `edd_draft_yodlee_gateway`
- Riptide: `maef_child_gateway`, `circoflows`, `dfinsell`, `edd_draft_yodlee_gateway`, `cashenvoy`
- Genetic: `site_b_gateway`, `nmi`, `bytenft`, `amgexpress`, `blockonomics`
- Onyx BioLabs: `tagada`, `linkmoney`, `cashapp`, `zelle`, `forumpay`
- LabTrust: `bacs`, `mycryptocheckout`

These are genuine code/runtime identifiers, not guesses from footer logos. Empty-cart configuration still has to be distinguished from item-specific availability. The existing same-day Reta-cart audit supplies the item-specific layer for the methods labeled there as `active_for_reta_cart_api`.

## Operational takeaway for Noli

The public stack can be reverse-engineered much more deeply than “card versus ACH”:

- Direct PSP / wallet: PayPal official SDK on Tidetopia.
- Gateway / tokenization: NMI Collect.js, Authorize.Net Accept.js.
- High-risk/custom card wrappers: CardsShield/`mecom_stripe`, Truvo drop-in, custom method IDs.
- Pay-by-bank: Link Money, IDEM, eDebit Direct, Paynote + Plaid.
- Crypto redundancy: NOWPayments, ForumPay, Blockonomics, MyCryptoCheckout, BTCPay, PayerURL, CryptoPay.

The repeated architecture is a **portfolio**, not one processor: card gateway + bank-pay route + manual/P2P fallback + crypto. Noli should not treat a plugin name as approval. The diligence questions remain: prohibited-products policy in writing, descriptor/MCC, reserve and rolling hold, settlement timing, chargeback/ACH-return thresholds, refund path, owner of funds flow, sponsor/acquiring bank where applicable, and a tested failover plan.

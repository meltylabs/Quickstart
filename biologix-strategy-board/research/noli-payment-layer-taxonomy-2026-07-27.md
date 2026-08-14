# Noli Payment-Layer Taxonomy

Verified against current official provider materials on July 27, 2026.

## The rule

Public website code can identify an integration signal. It usually cannot identify the merchant's approved processor, underwriting relationship, acquirer, sponsor bank, MID, settlement path, or whether the account is live.

Use this wording:

- Code evidence: "Public code contains a Stripe integration signal."
- Checkout evidence: "The public checkout displayed PayPal as an available option."
- Provider-level fact: "Stripe operates as a gateway and processor and is registered as a payment facilitator under certain member-bank arrangements."
- Merchant-level verification: "The merchant's processing agreement identifies the processor and acquirer."

Do not turn the first statement into the fourth.

## Layer definitions

| Layer | What it does | What normally proves it for a specific merchant |
|---|---|---|
| Checkout or integration | The customer-facing form, hosted page, plugin, SDK, API, or script | Public source code or visible checkout |
| Gateway | Securely transmits payment data toward processing infrastructure | Provider product documentation plus the merchant's configured account |
| Payment service provider, or PSP | Broad umbrella for a provider that gives merchants access to one or more payment services | Provider terms and the merchant's agreement |
| Payment facilitator, or PayFac | Onboards submerchants under a master acquiring relationship | Provider legal terms, submerchant agreement, and underwriting approval |
| Processor | Routes and processes transaction messages on a payment rail | Processing agreement, merchant statement, VAR sheet, or provider dashboard |
| ISO or MSP | Sells or services merchant acquiring relationships under a registered program | Card-network or acquiring-bank registration and merchant agreement |
| Acquirer or member bank | Holds the card-network acquiring relationship and submits merchant transactions into the network | Merchant agreement, commercial entity agreement, or merchant statement |
| Sponsor bank | Sponsors a non-bank participant into a regulated or network program | The applicable program agreement or bank disclosure |

An acquiring bank can also be called a member bank in provider contracts. "Sponsor bank" should not be used as an automatic synonym unless the applicable document uses or supports that role.

## Provider map

| Provider | Gateway or integration | PSP | PayFac | Processor | ISO or MSP | Acquirer | Sponsor or member bank | Safe corpus label |
|---|---|---|---|---|---|---|---|---|
| Stripe | Yes | Yes | Yes, under applicable member-bank programs | Yes | Conditional. Official Cross River terms also register Stripe as an ISO | Merchant-specific. Stripe affiliates or financial partners can be the applicable acquirer | Program-specific and not inferable from code | "Stripe integration signal detected" |
| Square | Yes, built-in gateway | Yes, integrated payments provider | Yes | Yes, self-described end-to-end processor | Not established | Square is not the bank. It partners with acquiring banks | JPMorgan Chase Bank and/or The Bancorp Bank are named in current US commercial entity terms, as applicable | "Square integration or checkout signal detected" |
| PayPal | Yes | Yes | Not established in the official materials reviewed | Yes | Not established | Not identifiable from a generic PayPal signal | Not identifiable from a generic PayPal signal | "PayPal option or integration signal detected" |
| NMI | Yes | Do not infer merchant PSP status from code | NMI enables PayFacs, which does not prove NMI is the merchant's PayFac | No generic conclusion. NMI connects to more than 200 processors | NMI serves ISOs, which does not prove NMI is the merchant's ISO | Unknown | Unknown | "NMI gateway integration signal detected" |
| Authorize.Net | Yes | Conditional. Its All-in-One offer can help provide a merchant account, while Gateway Only uses an existing account | Not established | No generic conclusion. It supports multiple processor connections | Not established | Unknown | Unknown | "Authorize.Net gateway signal detected" |
| Bankful | Yes, payment software and orchestration | Conditional by arrangement | Conditional. Bankful says it acts as direct PayFac in some arrangements | Conditional. Its terms use "processor of record" for some arrangements and external processors for others | Not established | Unknown | Unknown | "Bankful software or orchestration signal detected" |
| Link Money | Yes as a Pay by Bank SDK or API, not established as a card gateway | Best described as an open-banking payment platform | Not established | Not established | Not established | Not applicable or unknown from generic code | Unknown | "Link Money Pay by Bank integration signal detected" |
| eDebit Direct | Yes as ACH, eCheck, and demand-draft software, not a card-gateway conclusion | Official terms describe a service provider | Not established | Yes, specifically for ACH, eCheck, and demand-draft services | Not established | Not applicable or unknown | The applicable ODFI or bank is unknown | "eDebit Direct bank-payment integration signal detected" |
| Paynote / SeamlessChex | Yes, API and payment-platform integration | Yes at a broad product-description level | Not established | Rail-dependent. Official terms describe third-party processing and collection roles | Not established | Unnamed and arrangement-specific | Unnamed ODFI and financial-institution partners | "Paynote or SeamlessChex integration signal detected" |
| IDEM, tentatively identified as the IDEM Merchant Platform / EasyProcess | Yes, hosted page, SDK, and Payment Request API | Not established for IDEM itself | Not established | Third-party partners, not IDEM itself, are described as providing regulated payment services | Not established | Unknown | Unknown | "Possible IDEM or EasyProcess checkout integration signal detected; identity requires confirmation" |

## Provider findings and official sources

### Stripe

Stripe officially describes itself as both a [payment gateway and payment processor](https://stripe.com/en-de/resources/more/payment-processor-vs-payment-gateway). Its current US acquiring terms show several possible structures:

- [Stripe MALPB Acquirer Terms](https://stripe.com/legal/stripe-malpb-acquirer-terms): Stripe is registered as a payment facilitator by the member bank, and Stripe MALPB is the payment-method acquirer.
- [Pathward Acquirer Terms](https://stripe.com/br/legal/pathward-acquirer-terms): Pathward is the payment-method acquirer and Stripe is the registered payment facilitator.
- [Cross River Bank Acquirer Terms](https://stripe.com/th/legal/crb-acquirer-terms): Cross River is the payment-method acquirer and Stripe is registered as a payment facilitator and ISO.
- [Fifth Third Bank Acquirer Terms](https://stripe.com/en-br/legal/fifth-third-bank-acquirer-terms): Fifth Third is the payment-method acquirer and Stripe is the registered payment facilitator.
- [Stripe Services Terms](https://stripe.com/en-ca/legal/ssa-services-terms): the applicable acquirer can depend on the payment method, account, and financial partner.

Conclusion: Stripe code can support "Stripe integration detected." It cannot identify which Stripe entity or financial institution underwrote the merchant.

### Square

[Square Payment Terms](https://squareup.com/us/en/legal/general/payment) state that Square is a payment facilitator, not a bank, and that it works with networks, processors, and acquiring banks. Square also describes its product as an [end-to-end processor with a built-in gateway](https://squareup.com/us/en/the-bottom-line/managing-your-finances/payment-gateway). Its current [Commercial Entity Agreement](https://squareup.com/us/en/legal/general/cea) names JPMorgan Chase Bank and/or The Bancorp Bank, as applicable.

Conclusion: a Square integration does not prove which bank applies to a particular merchant or whether that merchant passed underwriting.

### PayPal

The [PayPal User Agreement](https://www.paypal.com/us/legalhub/paypal/useragreement-full?locale.x=en_US) says PayPal is a payment service provider. PayPal also describes itself as a [payment processor](https://www.paypal.com/us/brc/article/how-paypal-works-for-sellers) and says it provides [gateway and processor services](https://www.paypal.com/us/brc/article/what-is-a-payment-gateway).

PayPal's [Braintree Payment Services Agreement](https://www.paypal.com/us/legalhub/braintree/payment-services-agreement?country.x=US&locale.x=en_US) describes Braintree-specific acquiring relationships. Those terms should not be transferred to a generic PayPal button or logo.

Conclusion: a PayPal button proves only the public option or integration. It does not prove a live merchant account, PayFac relationship, acquirer, or sponsor bank.

### NMI

NMI describes its product as a [white-label payment gateway](https://www.nmi.com/products/payment-gateway/) that integrates with more than 200 processors. Its [PayFac product](https://www.nmi.com/who-we-serve/payment-facilitators/) enables payment facilitators and communicates merchant data to the appropriate processor. NMI's [gateway documentation](https://docs.nmi.com/reference/nmi-gateway-features) also consistently calls it a gateway.

Conclusion: an NMI script or hosted form does not identify the downstream processor, PayFac, ISO, acquirer, or sponsor bank.

### Authorize.Net

Authorize.Net says it is a [payment gateway](https://www.authorize.net/resources/how-payments-work.html). Its [pricing page](https://www.authorize.net/sign-up/pricing.html) distinguishes Gateway Only, which connects to an existing merchant account, from All-in-One, which can help provide one. Authorize.Net also says it [has no visibility into a merchant's MSP](https://support.authorize.net/knowledgebase/article/000001347/en-us) and lists [multiple supported processor connections](https://support.authorize.net/knowledgebase/article/000001210/en-us).

Conclusion: Authorize.Net code identifies the gateway, not the merchant's processor, MSP, acquirer, or bank.

### Bankful

[Bankful Terms and Conditions](https://bankful.com/terms-conditions/) describe payment software and orchestration. They say Bankful acts as a direct payment facilitator and "processor of record" in some arrangements, while eligibility can be determined by a separate processor of record and sponsor banks. Bankful's [refund policy](https://support.bankful.com/refunds/) says it is a software and technology provider and that transactions are processed through the designated acquirer or processor.

Conclusion: Bankful's role is arrangement-specific. Public code cannot show whether the merchant is in Bankful's direct PayFac program or routed to an external processor and bank.

### Link Money

[Link Money Terms](https://link.money/legal/terms-and-conditions) describe a platform that links customer bank accounts and arranges transfers to merchants. Its core product is [Pay by Bank](https://link.money/product/pay-by-bank), delivered through an SDK and API.

Conclusion: call this an open-banking or Pay by Bank integration. Do not label it a card processor, PayFac, ISO, acquirer, or sponsor bank without the merchant's agreement.

### eDebit Direct

[eDebit Direct Merchant Terms](https://edebitdirect.com/terms-and-conditions/) describe software for demand drafts, eChecks, and ACH. They state that eDebit Direct is not a bank or financial institution, is retained as a payment processor, and uses a separate origination agreement for ACH. Its [consumer ACH terms](https://edebitdirect.com/consumer-ach-terms-and-conditions/) further describe the ACH service and account-verification partners.

Conclusion: the supportable processor label is limited to its ACH, eCheck, and demand-draft role. The applicable originating bank or ODFI remains unknown from site code.

### Paynote and SeamlessChex

[Paynote](https://www.paynote.com/) presents an API-based merchant-services platform for card, ACH, crypto, and payouts. [SeamlessChex Terms](https://www.seamlesschex.com/terms-of-service) describe Seamless Checks LLC, a third-party sender and collection agent, an unnamed ODFI, Dwolla functionality in some flows, and Dwolla financial-institution partners. The [SeamlessChex product site](https://www.seamlesschex.com/) describes payment processing and multiple acquiring-bank partners.

Conclusion: a Paynote or SeamlessChex code signal does not reveal which rail, processor, acquiring bank, ODFI, or partner is active.

### IDEM

The public identity is less certain than the other providers. [EasyProcess Terms](https://easyprocess.ai/content/terms-services) refer to the IDEM Merchant Platform and IDEM Club Inc. They say the platform provides technology and facilitation, is not a bank, and relies on regulated third-party partners for card, banking, and crypto services. [IDEM Pay](https://idempay.net/) presents a hosted page, SDK, and Payment Request API. The [EasyProcess Legal Notice](https://easyprocess.ai/content/legal-notice) also refers to financial institutions and processors.

Conclusion: record the integration as "possible IDEM / EasyProcess" until the script owner, legal entity, or checkout domain confirms the identity. Do not assign IDEM a processor, PayFac, ISO, acquirer, or sponsor-bank role from the current public evidence.

## Evidence ladder

### Level 1: public code signal

Examples include JavaScript domains, plugin names, SDK objects, hidden fields, network requests, and platform metadata.

Supportable:

> Public code contains an NMI gateway integration signal.

Not supportable:

> NMI processes this merchant's payments through Bank X.

### Level 2: visible public checkout

This can establish that an option was displayed at the time observed. It does not establish that a charge would succeed.

Supportable:

> The checkout displayed PayPal on July 27, 2026.

Not supportable:

> The merchant has an active, approved PayPal account.

### Level 3: provider documentation

This supports provider-level product and legal roles. It may be region-specific, product-specific, or conditional.

Supportable:

> Bankful acts as a direct PayFac in some arrangements.

Not supportable:

> This merchant uses Bankful's direct PayFac arrangement.

### Level 4: merchant-specific records

Use the following, with authorization, to verify underwriting:

- Signed merchant processing or submerchant agreement
- Approval or onboarding letter
- Merchant identification number, or MID
- Merchant statement or processor statement
- VAR sheet
- Provider dashboard account metadata
- Commercial entity agreement
- Settlement descriptor and bank-deposit corroboration

Only this level can responsibly name the merchant's approved processor, PayFac program, acquirer, member bank, sponsor bank, MID, or settlement route.

### Level 5: transaction evidence

No transaction testing was performed. A displayed checkout or technically valid API configuration is not proof that a real payment succeeds, settles, remains uncanceled, or survives compliance review.

## Recommended data model

Keep observations separate from conclusions:

```json
{
  "publicIntegration": {
    "provider": "NMI",
    "signal": "gateway script",
    "observedAt": "2026-07-27",
    "confidence": "high"
  },
  "visibleMethods": [],
  "verifiedMerchantRelationship": {
    "psp": null,
    "payfac": null,
    "processor": null,
    "isoMsp": null,
    "acquirer": null,
    "sponsorBank": null,
    "mid": null
  },
  "boundary": "Public code identifies a gateway integration only. Merchant underwriting and downstream institutions were not verified."
}
```

Do not fill unknown fields with the provider whose logo or script appeared. Keep them null until merchant-specific evidence supports them.

## Operational conclusions for the Noli corpus

1. Processor detection should be renamed payment-integration detection unless merchant records exist.
2. NMI and Authorize.Net are especially important false-positive traps because their gateways connect to many downstream processors.
3. Stripe and Square have real provider-level PayFac structures, but a website signal still does not prove approval, live status, or the applicable member bank.
4. Bankful has multiple possible arrangements. Its public presence does not reveal whether it is acting as software provider, PayFac, or processor of record for that merchant.
5. PayPal and Braintree evidence must stay separate.
6. Bank-payment products require their own rail taxonomy. Link Money, eDebit Direct, Paynote, and SeamlessChex should not be forced into a card-acquiring model.
7. A sponsor or acquiring-bank field should remain unknown unless a merchant agreement, statement, dashboard, or commercial entity agreement identifies it.
8. Logos, footer badges, disabled buttons, dormant plugins, and client-side SDKs are signals, not verified processing relationships.
9. Claims such as "high-risk processor," "offshore processor," or "no underwriting" require direct evidence and should never be inferred from a vendor's product category.
10. Every record should carry an observation date because provider structures, partner banks, and product terms can change.

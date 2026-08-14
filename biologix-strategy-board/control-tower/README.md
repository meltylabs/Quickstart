# Biologix Control Tower

Internal operator surface for the Biologix affiliate program. The browser is a
projection client, not a database: it reads the live program state from a
same-origin API and waits for server confirmation before showing any mutation
as successful.

## API contract

### `GET /api/control-tower/projection`

The client accepts either the projection at the top level or under
`{ "projection": ... }`.

```json
{
  "revision": 42,
  "generatedAt": "2026-07-25T19:00:00.000Z",
  "program": {},
  "meta": {},
  "session": {
    "user": {},
    "logoutUrl": "/auth/logout"
  },
  "capabilities": {
    "actions": [
      "affiliate.create",
      "affiliate.update",
      "affiliate.delete",
      "sale.create",
      "sale.update",
      "sale.delete",
      "outbound.create",
      "outbound.update",
      "outbound.delete",
      "payout.create",
      "payout.update",
      "payout.delete",
      "affiliate.stage.set",
      "outbound.touch.log",
      "enrollment.prepare",
      "agreement.launch",
      "agreement.manage",
      "invitation.send",
      "test-account.create",
      "program.create",
      "program.update",
      "program.activate"
    ],
    "testAccounts": true
  },
  "affiliates": [],
  "sales": [],
  "outbound": [],
  "payouts": [],
  "enrollments": [],
  "audit": []
}
```

`auditLog` or `history` are accepted aliases for `audit`. Missing arrays become
empty arrays. Each mutable record may supply its own `revision`; otherwise the
projection revision is used for concurrency control.

### `POST /api/control-tower/action`

Every mutation uses this envelope:

```json
{
  "action": "affiliate.update",
  "idempotencyKey": "ct-affiliate-update-…",
  "expectedRevision": 42,
  "payload": {
    "id": "affiliate-id",
    "patch": {}
  }
}
```

The action allowlist is in `crm-data.js`. Record payloads are:

- create: `{ "record": { ... } }`
- update: `{ "id": "...", "patch": { ... } }`
- delete: `{ "id": "..." }`
- lifecycle stage: `{ "affiliateId": "...", "stage": "..." }`
- outbound touch: `{ "outboundId": "...", "occurredAt": "ISO timestamp" }`
- prepare a production enrollment:
  `{ "email": "...", "name": "...", "economicsSnapshot": { ... } }`; this
  binds the exact economics but does not send email
- launch or manage its agreement:
  `{ "enrollmentId": "..." }`, sent with that enrollment's authoritative
  revision
- send Passport access:
  `{ "enrollmentId": "..." }`, available only after verified signed agreement
  evidence is projected
- sandbox account:
  `{ "email": "...", "name": "...", "sendEmail": false }`; the separate
  `test-account.create` action maps its fixed nonpayable policy server-side
- program create: `{}`
- program update:
  `{ "programId": "...", "expectedRevision": "...", "legalEntityName": "...", "tradeName": "Biologix Labs Research", "entityType": "...", "officialAddress": { "line1": "...", "line2": null, "city": "...", "region": "CA", "postalCode": "00000", "countryCode": "US" }, "authorizedSignerRef": "...", "authorizedSignerName": "...", "authorizedSignerTitle": "...", "authorizedSignerEmail": "...", "agreementTemplateKey": "...", "agreementVersion": "...", "affiliateBaseUrl": "https://origin", "trackingBaseUrl": "https://origin", "eligibleCountries": ["US"], "eligibleRegions": {}, "minimumAge": 18, "economicsConfiguration": { "schemaVersion": 2, "mode": "individualized", "noDefaults": true } }`
- program activate: `{ "programId": "...", "expectedRevision": "..." }`
- logout is a local same-origin `POST /api/control-tower/logout`; it is not
  proxied as an Academy action

A sandbox response may return the share URL as `url`, `invitationUrl`,
`claimUrl`, or `link`, either at the top level or under `invitation` or
`testAccount`. A production invitation is delivered server-side and does not
expose its token to the browser.

## Interaction guarantees

- Initial load is asynchronous and has explicit loading, error and retry states.
- There is no browser persistence or fallback data.
- Mutations are serialized. Controls disable while an action is in flight.
- After a successful action, the entire projection is fetched again before the
  UI reports success.
- `401`, `403`, `409`, and `503` receive specific messages. A conflict forces a
  refresh and never leaves an optimistic lifecycle or money change on screen.
- Activation gates are read-only. Stage movement and outbound touch logging use
  their own explicit server actions.
- Program and record history come from the audit projection.
- Sandbox invitation links have a copy flow. A test-account checkbox appears only when
  the projection advertises that capability.
- Every production enrollment is prepared with the complete 15-key v2
  `economicsSnapshot` supplied through `program.economicsSchema`. If that schema
  is absent, preparation is disabled. The agreement launches only from the
  refreshed enrollment, and Passport access can be sent only after the
  projection exposes verified signed evidence. The object contains only `currency`,
  `model`, `terms`, `terms_reference`, `commission_rate`, `commission_base`,
  `attribution_window_days`, `settlement_hold_days`, `clawback_days`,
  `payout_cadence`, `payout_threshold`, `agreement_version`,
  `retainer_amount`, `retainer_cadence`, and `retainer_proration`.
- Sandbox/test records are labeled and excluded from live totals. The dedicated
  server action maps the fixed nonpayable test policy, disables merchant linking,
  and skips email unless the operator explicitly enables it. Its manual claim
  link can still exercise invitation redemption and the Passport.
- Program setup is admin capability-gated. It exposes setup, paused, and active
  state, the server-projected activation gaps, legal entity, trade name, entity
  type, address, signer
  reference plus exact signer name/title/email, exact origins, agreement bindings, jurisdiction scope, minimum
  age, and the fixed individualized/no-defaults economics policy. Creator rates
  never live in program setup. Update and activation are separate,
  revision-aware actions. Activation is disabled when requirements are missing
  or omitted.

## Verification

```sh
node crm-data.test.mjs
node --check crm-data.js
node --check crm-app.js
```

The test suite covers projection normalization, action mapping, idempotency and
revision envelopes, error mapping, conflict behavior, derived money, and the
absence of browser persistence or fallback records.

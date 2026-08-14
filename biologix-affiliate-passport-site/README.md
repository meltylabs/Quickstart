# Biologix Affiliate Passport

Creator-facing, post-signature Biologix affiliate onboarding. The application
is served at `/passport/` by the Biologix Decision Board Worker and uses the
same-origin `/api/biologix/*` lifecycle endpoints.

## Local development

```sh
npm install --workspace biologix-affiliate-passport-site
npm --workspace biologix-affiliate-passport-site run dev
```

## Production build

```sh
npm run build
```

The root build compiles this workspace and copies its output to
`dist/client/passport`. Do not commit this workspace's `node_modules` or
`dist` directories.

## Data boundary

The browser does not store onboarding state locally. Invitation access,
identity decisions, tax and payout status, account verification, attribution,
content review, help requests, and activation receipts are loaded and mutated
through the same-origin API. Sensitive identity, tax, and payout collection
stays in hosted providers; the Passport receives status decisions only.

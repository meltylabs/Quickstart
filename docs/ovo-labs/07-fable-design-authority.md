# OVO Labs — Fable 5 Design Authority

*Binding migration contract · July 24, 2026 · final rendered release review remains required*

## Authority

Claude Fable 5 (`claude-fable-5`) is the sole outward-facing design authority for OVO Labs.

Fable must author or explicitly review:

- layout and hierarchy;
- navigation and search;
- component composition;
- typography and color;
- spacing and responsive behavior;
- interactions;
- loading, empty, error, success, disabled, and focus states.

Implementation may preserve and test this contract but may not silently replace its visual direction. The superseded cool-white **Bench Light** system is not an alternate theme and must not reappear.

## Chosen direction: warm apothecary modernism

OVO Labs is a retail house with scientific restraint: warm, exact, tactile, and product-led. Its reference equation is **Aesop editorial density × The Row restraint × Byredo typographic discipline**, translated into a fast ecommerce system.

The public identity is:

- company name: **OVO Labs**;
- wordmark: **`ovolabs.`** in lowercase, including the period;
- descriptor: **Peptide science, refined.**

The direction is not a telehealth clinic, pharmacy imitation, laboratory dashboard, pink wellness startup, record room, or empty luxury editorial. It should feel desirable before it feels technical, then earn confidence through clear product facts and explicit evidence states.

## Non-negotiable truth layer

The aesthetic must never imply operations that do not exist. Every public route carries the exact notice:

> Fictional concept storefront. Nothing here is real, stocked, or for sale.

Warmth, packaging imagery, and retail language cannot be used to imply:

- inventory, availability, released lots, fulfillment, or delivery;
- a laboratory, testing relationship, method, result, certificate, or purity figure;
- customers, ratings, reviews, popularity, scarcity, or urgency;
- dosing, preparation, administration, safety, efficacy, outcomes, or human use;
- checkout, payment, reservation, or an offer to sell.

The notice is a thin, persistent utility banner. It must remain easy to read without becoming the visual identity.

## Brand system

### Palette

```css
--cream: #F3EADA;
--porcelain: #FAF6EE;
--parchment: #EDE2CD;
--espresso: #3A2A1F;
--espresso-deep: #2A1D14;
--ink-2: #5C4A3B;
--terracotta: #B9553E;
--terracotta-deep: #8F3B2A;
--gold: #B08A52;
--gold-bright: #C69B63;
```

Rules:

- Cream is the house field; porcelain and parchment create quiet surface separation.
- Espresso carries body copy, navigation, and the primary action.
- Gold is ornament only: a rule, keyline, foil cue, or small typographic accent—not body copy and never the only signal.
- Gold-bright is reserved for small ornament on espresso surfaces.
- Terracotta appears at most once per surface and only for meaningful emphasis.
- Status colors always ship with explicit text.
- All final foreground/background pairs must pass WCAG 2.2 AA contrast.
- No clinical blue, cobalt, neon, glassmorphism, gradient wash, or glossy white laboratory palette.

### Typography

- Display and editorial headlines: **Fraunces**, using the self-hosted Google Fonts release.
- Wordmark: **Fraunces italic**, lowercase `ovolabs.` including the period.
- Interface and body: **Instrument Sans**, using the self-hosted Google Fonts release.
- Codes, concept prices, and status metadata only: **IBM Plex Mono**.
- The `ovolabs.` wordmark is typographic and quiet; it does not use a badge, atom, helix, shield, or monogram icon.
- Headlines use sentence case and editorial line breaks. They do not shout in all caps.
- Product names remain immediately scannable; atmosphere may never obscure identity, format, status, or price.

Self-hosted font files must be limited to the required Latin weights and styles, retain their SIL Open Font License files, and make no third-party font request. Fallbacks must preserve hierarchy without layout shift.

### Geometry

- Long editorial rules, square geometry, and flat tactile surfaces.
- Product imagery uses disciplined still-life frames rather than laboratory diagrams.
- Sections and product cards use zero-radius corners.
- Inputs and buttons may use at most a 2px radius.
- Product cards use no border and no drop shadow; hierarchy comes from composition, image field, type, and spacing.
- Buttons are composed and substantial, never pill-shaped SaaS controls.
- Cards may feel like product folios or packaging panels, but never fake certificates or clinical records.
- Ornament is sparse: one rule, one mark, or one accent is enough.

### Rhythm

- The shell uses a 12-column grid with a 1280px maximum content width.
- Editorial sections may breathe, but the store remains product-first.
- The opening desktop viewport must establish the brand, expose a shop action, and begin the catalog journey.
- The desktop hero uses a 5/7 text-to-image composition.
- Product collections may use a fashion-grid rhythm while preserving complete card anatomy and predictable reading order.
- Section rhythm expands around storytelling and tightens around comparison.
- Product grids retain four-up desktop and two-up narrow layouts where names and controls remain readable.
- Mobile preserves pace with short editorial introductions, not stacked walls of whitespace.

## Safe imagery contract

The only approved production image assets are:

- `assets/ovo-hero-still.webp`;
- `assets/ovo-vial-front.webp`;
- `assets/ovo-set-pair.webp`.

Their image world is a warm tabletop still life:

- amber research vials;
- uncoated cream cartons;
- travertine, limestone, warm plaster, linen, or dark timber;
- natural side light and controlled shadow;
- restrained espresso, cream, gold, and terracotta details;
- labels with only truthful, legible concept identity where needed.

Allowed imagery is representational concept art, not proof of stock, packaging production, quality, testing, or availability. Alt text describes only what is visibly present.

Never show:

- syringes, needles, alcohol swabs, bacteriostatic water, droppers, injection supplies, or preparation tools;
- a vial in a hand, on a body, in a bathroom, or in a treatment scene;
- before/after bodies, body measurements, clinicians, patients, lab coats, or procedure rooms;
- fake chromatograms, signatures, certificates, seals, report numbers, laboratory logos, lot labels, purity figures, or stock quantities;
- outcome-oriented packaging, dosing copy, protocol cards, or use-adjacent accessories.

Generated imagery must be checked at full resolution for malformed caps, false text, duplicate objects, use-adjacent props, and invented claims before release.

Superseded cool-white imagery and every earlier OVO Health mockup are excluded from the production asset set.

## Global shell

### Fiction banner

- Thin espresso strip above the header.
- Cream text at accessible contrast.
- Exact truth copy from the non-negotiable truth layer.
- No promotional icon, countdown, marquee, or dismiss action.

### Header

- Sticky warm-paper header separated by a fine keyline.
- `ovolabs.` wordmark.
- Primary links: Shop, Sets, Testing & COAs, Learn.
- Exposed search for known-item discovery.
- Local cart control with concept count.
- Category navigation remains clear and compact.
- The header must feel like a retail house, not a lab application toolbar.

### Mobile navigation

- Wordmark, directly reachable search, menu, and cart.
- Menu opens a functional overlay or drawer.
- Focus enters the menu, remains trapped, closes on Escape/outside action, and returns to the trigger.
- Product discovery remains reachable without navigating a brand manifesto.

## Homepage contract

### 1. Retail-house hero

- Establish `ovolabs.` and **Peptide science, refined.**
- Use one safe amber-vial still life with warm material depth.
- Use the 5/7 desktop composition: five columns for the editorial message and actions, seven for `ovo-hero-still.webp`.
- Pair a primary Shop action with a secondary Testing & COAs action.
- Keep the fiction boundary visible and the retail concept legible within five seconds.
- Prioritize above-fold media with explicit dimensions and no lazy loading.

### 2. House principles

Use only interface truths:

- focused concept catalog;
- search by product or code;
- testing state beside every decision;
- browser-local demo cart with no checkout.

Do not substitute purity, quality, customer, laboratory, fulfillment, or support claims.

### 3. Category edit

- Four art-directed category entries with accurate concept counts.
- Each tile feels like a collection chapter, not a dashboard shortcut.
- Entire tile is interactive and keyboard reachable.

### 4. Featured products

- Complete product cards.
- First product row arrives early.
- Use the Fable-locked fashion-grid rhythm without changing DOM reading order or hiding decision fields.
- The section balances retail desire with immediate comparison; it does not become a lookbook.

### 5. Testing feature

- Render evidence state as a full-width espresso band structured by fine rules.
- “No result reported” is the dominant, literal status.
- Missing fields remain visible.
- Do not imitate a certificate, laboratory report, wax seal, or approval stamp.

### 6. Concept sets

- Present sets as curated catalog relationships.
- Show every included item and the exact concept arithmetic.
- Use codes `OVO-S01` through `OVO-S03`.
- No outcome stack, protocol, regimen, savings urgency, or use-oriented naming.

### 7. Learn

- Source-aware editorial cards.
- One useful product-finding or evidence question per article.
- Clear routes back to the catalog or testing surface.

### 8. Newsletter demo

- Local-only saved state.
- State that nothing was transmitted and no email will be sent.
- No fake subscriber count, community claim, frequency promise, or welcome incentive.

### 9. Footer

- Compact house index.
- Repeat the fiction and no-commerce state.
- No trust-badge wallpaper or empty social links.

## Product-card contract

Every card includes, in this order:

1. product image;
2. category;
3. product name and concept format;
4. neutral descriptor;
5. testing state;
6. concept price;
7. full-width Add control.

Rules:

- Four cards per row on standard desktop.
- Two complete cards per row on mobile.
- Product image uses a consistent aspect ratio and safe still-life treatment.
- Names never truncate into ambiguity.
- Add is a real browser-local interaction.
- No stars, reviews, discount badge, stock, urgency, shipping, purity, or bestseller language.

## Collection contract

- Editorial collection heading, concise introduction, and accurate result count.
- Search within results remains directly visible.
- Filters are understandable without decoding a scientific taxonomy.
- Mobile filters open an accessible bottom sheet.
- Applied filters are visible and resettable.
- Sort has a clear current value and persists predictably.
- Zero results preserve the query and offer reset/category routes.
- Grid composition remains stable while filtering and sorting.

## PDP contract

### First-screen decision block

- Breadcrumb.
- Product name and `OVO-###` code.
- Category and concept format.
- Neutral descriptor.
- Concept price.
- Literal testing state.
- Primary browser-local Add action.

The gallery and decision block should feel like an editorial product spread, but every decision field must remain easier to find than the atmosphere.

### Below the decision

- Safe image gallery.
- Testing/document disclosure.
- Concept specification table.
- Question-led accordions.
- Related products.
- Mobile sticky local-cart action where useful, without resembling checkout.

No required decision information may live only inside an accordion.

## Testing & COAs contract

- Search by product name or `OVO-###` code.
- Return identity before evidence state.
- “No result reported” remains dominant.
- Use the full espresso ruled-band language for the primary evidence disclosure.
- Show missing laboratory, method, sample, lot, date, and result plainly.
- A future-record field list may appear only as a labeled template.
- Never render a fake signature, chromatogram, seal, report number, purity figure, or laboratory brand.

## Cart contract

- Right-side drawer on desktop and an appropriate full-height sheet on narrow screens.
- Item image, name, concept format, quantity, line total, and remove control.
- Clear subtotal and working clear-all.
- Add moves focus into the labeled cart and close restores focus to the initiating control.
- Exact terminal explanation:

> This is where the demo ends. Nothing is stocked, sold, or shippable.

- No Checkout, Buy now, Reserve, Get quote, payment, or shipping control.

## Interaction states

### Search

- Idle, focus, typing, results, zero results, and escape/close.
- Arrow keys and Enter operate predictable selection.
- Search terms survive drawer close and page state where expected.

### Add and cart

- Default, hover, focus, pressed, and focus-managed cart confirmation.
- Repeat adds update quantity.
- Cart updates preserve useful focus after quantity, remove, and clear actions.

### Newsletter demo

- Idle, validation error, local save, and restored local success.
- Success copy: “Preference saved on this device. Nothing was transmitted, and no email will be sent.”

### Loading, empty, and error

- Loading preserves layout and never simulates inventory or evidence retrieval.
- Empty states state what is absent and provide a next action.
- Errors state what failed and how to recover.
- No silent failure or no-op control.

## Accessibility contract

- WCAG 2.2 AA target.
- Visible 2px focus treatment with offset in a contrast-safe espresso, terracotta, or approved status color.
- Primary controls target at least 44 × 44px; secondary inline links meet the WCAG 2.2 AA target-size minimum or spacing exception.
- Logical heading hierarchy.
- Persistent form labels.
- Drawers and dialogs trap and restore focus.
- Status changes use a live region or focus-managed labeled drawer.
- Color never carries the only meaning.
- Reduced motion removes nonessential transitions.
- Images use accurate alt text or empty alt when decorative.

## Performance contract

- Above-fold image: WebP/AVIF where practical, explicit dimensions, no lazy loading, high fetch priority.
- Below-fold images: lazy-load with dimensions.
- No carousel dependency.
- No app pileup for search, cart, filters, or disclosures.
- Target p75 where field data exists: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1.
- No unreviewed third-party script, font, or animation.
- Warm editorial richness comes from composition, type, material, and light—not payload weight.

## Responsive checkpoints

Review at minimum:

- 1440 × 1000;
- 1280 × 800;
- 768 × 1024;
- 390 × 844;
- 375 × 812;
- 320 × 568.

At narrow widths:

- search remains directly reachable;
- two product cards fit without broken names or controls;
- Add controls stay full-width within cards;
- filters use an accessible bottom sheet;
- PDP primary action is reachable;
- cart and menu never create horizontal overflow;
- editorial type does not create orphaned one-word lines or bury the catalog.

## Prohibited visual patterns

- Bench Light’s cool-white/cobalt laboratory UI.
- Generic clinical white + blue or sage telehealth styling.
- Pink wellness coding.
- Empty quiet-luxury whitespace that delays products.
- Record-room, dossier, ledger, or archive vocabulary.
- Fake scientific seals, badges, documents, or laboratory screens.
- Syringes, injection preparation, body imagery, transformations, treatment scenes, or human-use props.
- Countdown timers, stock counters, pulsing urgency, discount confetti, or promotion bars.
- Empty rating rows.
- No-op controls.

## Rendered release review

Before shipment, Fable 5 must receive:

- desktop and narrow-width homepage;
- desktop and mobile collection;
- desktop and mobile PDP;
- Testing & COAs state;
- open mobile menu;
- open demo cart;
- zero-result search/filter state;
- full-resolution review of every new safe-imagery asset.

Fable’s output must be one of:

- **SHIP** — no blocking visual changes;
- **HOLD** — named blocking changes and required evidence.

The final release verdict remains pending until Fable reviews the implemented warm-apothecary-modernism system. Approval of Bench Light or any earlier OVO Health concept does not approve OVO Labs.

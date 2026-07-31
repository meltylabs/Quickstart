# Conductor Pocket - UI Specification v1.0

Author: Fable (design authority). Status: ready for implementation.
Scope: visual and interaction spec only. No application code. Backend contract
assumptions are listed in §12 and must be confirmed against the relay's real
capabilities before any control that depends on them is shown.

---

## 1. Product frame

Conductor Pocket is a periscope, not a dashboard. The Mac is doing the work;
the phone watches, steers, and speaks into it. Every design decision follows
from three facts:

1. **The connection is the product.** If the SSE stream is down, nothing else
   is true. Connection state is therefore ambient, always visible, and never
   optimistic.
2. **Alex is a power user with dozens of workspaces.** Recency and search beat
   taxonomy. The fastest path back to the last chat wins.
3. **Sends are physical.** A send is an Accessibility injection into a real
   composer on a real Mac. The UI never claims "sent" until the relay confirms
   the text landed and was submitted. No control appears unless its capability
   is verified.

### Design language: "Sideband"

Named for the radio term: a secondary channel carrying the primary signal.
Warm graphite surfaces, a single copper accent, monospace for machine truth,
SF Pro for human speech. Dark-first (this is a night-and-couch tool on OLED),
with a full warm-paper light theme. Calm and dense, never decorative. The one
memorable thing: the interface never lies, and it looks like it knows that -
machine facts (paths, durations, host names, fingerprints) are always set in
mono; human conversation is always set in text sans. The eye learns the split
in a minute and trusts it forever.

Explicitly rejected: glassmorphism, neon/cyberpunk, purple SaaS gradients,
floating tab bars, decorative blur, skeuomorphic terminal cosplay.

---

## 2. Foundations

### 2.1 Typography

System stacks only. No downloaded fonts, no CDN.

```
--font-text: -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, monospace;
--font-round: ui-rounded, -apple-system, system-ui, sans-serif;  /* numerals, badges, timers */
```

Type ramp (CSS px at default root; implement in rem, root 16px, so iOS text
scaling flows through - see §8.3):

| Token         | Size/Line | Weight | Tracking | Family | Usage |
|---------------|-----------|--------|----------|--------|-------|
| display       | 26/32     | 700    | -0.4px   | text   | Root list large title, pairing headline |
| title         | 20/25     | 600    | -0.3px   | text   | Sheet titles, error screens |
| headline      | 17/22     | 600    | -0.4px   | text   | Nav titles, row titles |
| body          | 16/24     | 400    | 0        | text   | Transcript text, form text |
| body-em       | 16/24     | 600    | 0        | text   | Inline emphasis, button labels |
| callout       | 15/20     | 400    | 0        | text   | List previews, secondary copy |
| footnote      | 13/18     | 400    | 0        | text   | Timestamps, meta lines, banners |
| caption       | 12/16     | 500    | +0.1px   | text   | Chips, badges labels |
| micro-caps    | 11/14     | 600    | +0.6px, uppercase | text | Section headers ("ACTIVE", "RECENT") |
| mono-body     | 13/19     | 400    | 0        | mono   | Tool detail, code blocks, drafts |
| mono-micro    | 12/16     | 500    | 0        | mono   | Paths, durations, fingerprints, tailnet names |
| round-badge   | 12/16     | 600    | 0        | round  | Unread counts, queue positions, elapsed timers |

Rules:
- Transcript assistant text is `body`. Never smaller.
- All inputs are ≥16px font-size (prevents iOS focus zoom).
- Tabular numerals (`font-variant-numeric: tabular-nums`) on all timers,
  counts, and latency readouts so they don't jitter while updating.
- Line length in transcript: max 68ch on wide screens (see §7).

### 2.2 Color tokens

Warm neutrals (slightly toward brown, never blue-gray) + copper accent +
three status hues. Status is never conveyed by color alone; every status has
a glyph and/or label (§8).

#### Dark theme (default)

| Token | Value | Usage |
|---|---|---|
| `bg/canvas`        | `#141210` | App background, transcript |
| `bg/raised`        | `#1C1A17` | Rows, cards, composer field, tool cards |
| `bg/elevated`      | `#242019` | Sheets, popovers, switcher |
| `bg/inset`         | `#0E0D0B` | Code blocks, mono detail wells |
| `hairline`         | `#2E2A25` | Default borders, separators |
| `hairline/strong`  | `#3D372F` | Focused card borders, input borders |
| `text/primary`     | `#F4F1EC` | Primary text |
| `text/secondary`   | `#A9A199` | Meta, timestamps, previews |
| `text/tertiary`    | `#746D64` | Disabled, placeholder ONLY (fails 4.5:1 - never for information) |
| `accent/copper`    | `#D08A54` | Interactive tint, links, focus ring, working pulse |
| `accent/copper-press` | `#B9754C` | Pressed tint |
| `fill/copper`      | `#C87E4C` | Filled primary buttons, unread badges |
| `on-copper`        | `#211208` | Text/glyphs on `fill/copper` |
| `bubble/user`      | `#7A4526` | User message bubble fill |
| `on-bubble`        | `#F6EDE4` | User bubble text |
| `status/live`      | `#4CC38A` | Connected, delivered, success |
| `status/wait`      | `#E3B341` | Reconnecting, queued, needs-input, degraded |
| `status/down`      | `#E5684F` | Offline, failed, revoked, destructive |
| `tint/live`        | `#4CC38A` @ 12% | Success banner bg |
| `tint/wait`        | `#E3B341` @ 12% | Warning banner bg |
| `tint/down`        | `#E5684F` @ 12% | Error banner bg |
| `scrim`            | `#000000` @ 44% | Behind sheets |

#### Light theme

| Token | Value | Usage |
|---|---|---|
| `bg/canvas`        | `#F7F5F1` | Warm paper background |
| `bg/raised`        | `#FFFFFF` | Rows, cards, composer field |
| `bg/elevated`      | `#FFFFFF` | Sheets (with shadow) |
| `bg/inset`         | `#EFEBE4` | Code blocks, mono wells |
| `hairline`         | `#E5E0D8` | Borders, separators |
| `hairline/strong`  | `#CFC7BA` | Input borders |
| `text/primary`     | `#211D19` | Primary text |
| `text/secondary`   | `#6B645A` | Meta, timestamps |
| `text/tertiary`    | `#9A9284` | Disabled, placeholder ONLY |
| `accent/copper`    | `#9C5730` | Interactive tint, links, focus |
| `accent/copper-press` | `#7F4626` | Pressed |
| `fill/copper`      | `#9C5730` | Filled primary buttons, badges |
| `on-copper`        | `#FFF7F0` | Text on copper fill |
| `bubble/user`      | `#9C5730` | User bubble fill |
| `on-bubble`        | `#FFF7F0` | User bubble text |
| `status/live`      | `#1D7A50` | Connected, success |
| `status/wait`      | `#8A6116` | Reconnecting, queued |
| `status/down`      | `#B3341F` | Offline, failed |
| `tint/live` etc.   | same hues @ 10% on white | Banners |
| `scrim`            | `#211D19` @ 32% | Behind sheets |

Theme switching: follows system (`prefers-color-scheme`). `theme-color` meta
provided for both schemes (`#141210` / `#F7F5F1`). No in-app theme toggle in
v1.

### 2.3 Spacing, radii, elevation

4px grid: `2, 4, 8, 12, 16, 20, 24, 32, 40, 56`.

- Screen gutter: 16px (≤599px width), 20px (600-1023), 24px (≥1024).
- List row min-height: 56px (workspace), 64px (chat, two-line). All rows are
  full-bleed tap targets with 16px horizontal padding.

Radii:

| Token | Value | Usage |
|---|---|---|
| `r/chip`   | 6px  | Status chips, capability chips |
| `r/control`| 10px | Buttons, tool activity rows, inputs |
| `r/card`   | 14px | Cards, banners, conflict sheet cards |
| `r/bubble` | 18px | User bubbles, composer field |
| `r/sheet`  | 16px | Sheet top corners |
| `r/full`   | 999px| Pills, badges, "Latest" jump pill |

Elevation:
- Dark theme: no drop shadows on rows/cards - separation via `bg/raised` +
  `hairline`. Sheets only: `0 -12px 48px rgba(0,0,0,0.5)`.
- Light theme: `shadow/1: 0 1px 2px rgba(33,29,25,0.06), 0 4px 16px rgba(33,29,25,0.05)`
  on cards; `shadow/sheet: 0 -12px 48px rgba(33,29,25,0.18)`.

### 2.4 Iconography

No external assets. A single inline SVG sprite, 20×20 viewBox, 1.8px stroke,
round caps, drawn to match SF Symbols "medium" weight optically. Required
glyphs (names are implementation IDs):

`chevron-left, chevron-right, chevron-down, arrow-up (send), stop (square in
circle), mic-note (info only), gear, lock, faceid (abstract: rounded square +
two dots + smile arc), key, wifi-slash, bolt (activity), clock (queued),
hourglass (waiting), check, check-double (delivered), x, warn (triangle),
search, plus, copy, expand, terminal (tool), file (tool), globe (tool),
git-branch, phone, laptop, eye-off, refresh, share-ios (rounded square with
up arrow, for install guidance), squares (switcher)`.

Glyph color follows text color of its context. Status glyphs use status hues.

### 2.5 Motion

| Token | Value | Usage |
|---|---|---|
| `dur/fast`  | 120ms | Chip changes, chunk fade-in, pressed states |
| `dur/base`  | 200ms | Row expand/collapse, banner in/out |
| `dur/slow`  | 320ms | Screen push/pop crossfade-slide |
| `dur/sheet` | 380ms | Sheet presentation |
| `ease/standard` | cubic-bezier(0.2, 0, 0, 1) | Most transitions |
| `ease/exit` | cubic-bezier(0.3, 0, 1, 1) | Dismissals |
| `ease/sheet`| cubic-bezier(0.32, 0.72, 0, 1) | Sheets (Apple's curve) |

Signature motions (the complete set - nothing else animates):
1. **Working pulse**: 6px copper dot, opacity 0.45→1.0→0.45, 1.8s
   ease-in-out infinite. Used in status rows and workspace/chat activity.
2. **Streaming ingress**: each appended text chunk fades in at `dur/fast`,
   opacity only. No translation (protects scroll anchoring). No
   per-character typewriter effects.
3. **Screen push**: incoming slides 24px from right + fade, `dur/slow`.
   Pop reverses. Sheets rise with `ease/sheet`.
4. **Banner**: slides down from under nav bar, `dur/base`.
5. **Pressed**: rows and buttons darken to pressed tokens within 80ms of
   touchstart (no waiting for click).
6. **Reconnect resolve**: banner crossfades amber→green "Live", holds 1.2s,
   slides away.

`prefers-reduced-motion`: 1 becomes a static dot at 100% opacity with the
label carrying state; 2-6 become plain crossfades ≤120ms.

Haptics: not reliably available in iOS web. Do not simulate or fake them.

---

## 3. Structure and navigation

**No tab bar.** A single navigation stack plus one overlay:

```
[Lock gate] → Workspaces (root) → Chats (workspace) → Transcript (chat)
                    ⌄ gear                                  ⌄ title tap
              Security panel                            Switcher sheet
```

- **Launch = last chat.** The app persists route + scroll position and cold
  starts directly into the last open transcript, painting from the local
  snapshot (§6.5) before the stream connects. Workspaces list is *up* the
  stack, not the home screen.
- **Back**: nav-bar chevron (44×44) + iOS edge-swipe. Both always work.
- **Switcher sheet** (the power move): tapping the transcript title, or the
  `squares` glyph on any nav bar, opens a bottom sheet at 65% height:
  search field on top, then "Recent" chats across ALL workspaces sorted by
  last activity, each row showing workspace name in `mono-micro` + status
  glyph + unread badge. One tap jumps anywhere. On desktop this is ⌘K.
- **Transcript swipe-right**: a deliberate rightward swipe across transcript
  body copy opens that exact same switcher sheet. The gesture ignores links,
  controls, selections, code, and horizontally scrollable tables; vertical
  reading gestures remain scrolling. The first 24px stays reserved for the
  native iOS edge-swipe Back gesture.
- **Switcher failures**: cached chats stay usable, while a compact inline
  warning says they could not be refreshed and offers Retry. With no cache,
  the warning replaces the empty-search state; transport errors must never
  masquerade as “No matches.”
- **Nav bar** (all screens): height 52px + safe-area top. Leading: back
  chevron. Center: `headline` title + optional `footnote` subtitle. Trailing:
  contextual glyph (gear on root, squares elsewhere). Background `bg/canvas`
  at 92% opacity with `backdrop-filter: saturate(1.2)` only if cheap;
  otherwise solid. Bottom hairline appears only after content scrolls 1px.

**Connection status placement** (ambient, global): the nav-bar subtitle is
the connection voice. When live it shows context (e.g. workspace name or
"3 chats"); when not live, it is replaced by the state in the state's color:
`Connecting…` / `Reconnecting…` (`status/wait`) / `Mac unreachable`
(`status/down`). Hard failures additionally get a banner (§5.7). There is no
separate "status bar widget" - the subtitle IS the truth.

---

## 4. Component library (shared anatomy)

### 4.1 Status taxonomy (used everywhere)

| State | Glyph | Color | Meaning |
|---|---|---|---|
| `working`  | pulse dot | copper | Agent actively generating/tooling |
| `waiting`  | hourglass | `status/wait` | Agent blocked on user input/permission |
| `queued`   | clock | `status/wait` | Message accepted, not yet running |
| `idle`     | none | - | Nothing happening |
| `live`     | dot (static) | `status/live` | Stream connected |
| `offline`  | wifi-slash | `status/down` | Relay unreachable |
| `error`    | warn | `status/down` | Failure needing action |

### 4.2 Row (list item)

56-64px min-height, `bg/canvas` (workspace list) or full-bleed on canvas with
hairline separators inset 16px from leading edge. Pressed: `bg/raised`.
Anatomy: [leading glyph/monogram 36×36] [12px] [title `headline` +
subtitle `callout` secondary, each 1-2 lines, ellipsize] [8px] [trailing
meta stack: time `footnote` secondary over status glyph/badge].

Monograms: 36×36, `r/control`, `bg/raised` fill, 1px hairline, one or two
initial letters in `headline` `text/secondary`. No per-workspace colors -
the calm comes from restraint; status carries the color.

### 4.3 Badge

Unread: `fill/copper` pill, `round-badge` type in `on-copper`, min 20×20,
padding 0 6px, count caps at "99+". Waiting-badge: same geometry in
`status/wait` fill with `bg/canvas`-contrast text, labeled glyph (hourglass)
when width allows.

### 4.4 Banner

Full-width under nav bar, min-height 44, `r/card` inset 8px each side (so it
reads as an object, not chrome), tint background + status-color glyph +
`footnote` text `text/primary` + optional trailing action in `body-em` of the
status color. Max one banner at a time; priority: auth > offline > degraded
> reconnecting > success.

### 4.5 Buttons

- **Primary**: `fill/copper`, `on-copper` `body-em`, height 50, `r/control`,
  full-width in flows. Pressed: `accent/copper-press`. Disabled: `bg/raised`
  fill + `text/tertiary` label (and a reason nearby - never a bare disabled
  button, §5.6).
- **Secondary**: transparent, 1px `hairline/strong` border, `text/primary`.
- **Destructive**: as secondary but `status/down` text/border; confirmation
  always required (sheet, never browser confirm()).
- **Text button**: `accent/copper` `body-em`, 44px min target.

### 4.6 Sheet

`bg/elevated`, `r/sheet` top corners, grabber (36×4, `hairline/strong`,
centered, 8px from top), title row optional, content, safe-area bottom
padding. Dismiss: swipe down, scrim tap, or X. Heights: 65% (switcher),
auto-content (conflict, confirmations), full (security panel on ≤599px).

### 4.7 Tool activity card (transcript)

The signature component. Collapsed by default, always.

Collapsed row: height 40, `bg/raised`, `r/control`, 1px hairline, inset
12px padding. Anatomy: [tool glyph 16, `text/secondary`] [8px] [summary:
verb + object, `footnote` `text/primary`, object in `mono-micro` - e.g.
`Edited` `composer/index.ts`] [flex] [duration `mono-micro` secondary, e.g.
`8.2s`] [chevron-down 14].

Running variant: glyph replaced by working pulse; duration becomes live
elapsed (tabular); left border 2px `accent/copper`.

Grouped runs: consecutive tool calls collapse into a single stack card:
summary `Ran 6 actions` + total duration. Expanding (tap, `dur/base`,
chevron rotates) reveals the individual rows indented 12px, each further
expandable to a detail well: `bg/inset`, `mono-body`, max-height 240px with
internal scroll, horizontal scroll for long lines (no wrap), top-right
`copy` glyph button (44×44 target). Failed calls: warn glyph + `status/down`
summary text; card border-left 2px `status/down`.

Expansion state is per-message and not persisted; reopening a chat shows all
collapsed.

### 4.8 Turn importance (transcript)

Pocket mirrors Conductor's focused transcript hierarchy instead of rendering
every agent event at equal weight.

- `turn_id` groups one agent turn.
- The last root-agent text event before a successful terminal `result` is the
  prominent answer. It keeps full Markdown and `text/primary`.
- Earlier root-agent text and successful root tool calls collapse into one
  full-width muted disclosure such as `7 tool calls, 2 messages`.
- Expanding the disclosure reveals intermediate prose in the compact
  `text/secondary` treatment and the existing tool cards from §4.7.
- A working turn has no manufactured final answer. Its current activity stays
  compact and shows the working state until the terminal result arrives.
- Nested sub-agent text (`parent_tool_use_id` present) never enters the main
  transcript. This prevents deep-research history replays from obscuring the
  root answer.
- Failed tools, agent errors, blocked states, and required actions always
  remain visible outside the collapsed activity disclosure.
- The disclosure has a 44px tap target, `aria-expanded`, and an accessible
  `Expand/Collapse N tool calls, M messages` label. Expansion is not persisted.

---

## 5. Surfaces

### 5.1 First-run pairing (from one-time link)

Route: opened in Safari from a one-time URL generated on the Mac.

Layout (430px, centered column, gutter 24):
- Top: 96px spacer (breathing room; this is the only "marketing" moment).
- App mark: 56×56 rounded square, `bg/raised` + hairline, containing a 24px
  copper `bolt` glyph. No wordmark art; below it, `display` "Conductor
  Pocket" and `callout` secondary "Remote for your Mac's Conductor".
- Pairing card (`r/card`, `bg/raised`, padding 20):
  - `micro-caps` secondary: "PAIRING WITH"
  - `title`: Mac name from relay, e.g. "Alex's MacBook Pro"
  - `mono-micro` secondary: tailnet hostname, e.g. `alexs-mbp.tailnet-xyz.ts.net`
  - Divider hairline, 16px vertical margin.
  - `micro-caps` secondary: "VERIFICATION WORDS"
  - Four words in `mono-body` `text/primary`, one row, separated by
    middle-dot: `ember · canyon · relay · fern`
  - `footnote` secondary: "Conductor on your Mac is showing the same four
    words. If they don't match, don't pair."
- Primary button: "The words match - Pair"
- Text button: "Cancel"

States:
- **Verifying** (token check in flight): card shows skeleton lines (§5.11),
  button disabled with spinner replacing label.
- **Link expired/used**: replace card with error card (warn glyph,
  `title` "This link has expired", `callout` secondary "Pairing links work
  once. Generate a new one on your Mac: Conductor → Settings → Pocket.").
  No retry button (nothing to retry).
- **Success** → advances to 5.2.

### 5.2 Passkey enrollment and lock

**Enrollment screen** (immediately after pairing):
- Centered: faceid glyph 44px copper, `title` "Lock this remote",
  `callout` secondary, max 34ch: "Anyone with this phone could drive your
  Mac. Face ID keeps it to you."
- Primary: "Enable Face ID" (triggers WebAuthn platform passkey creation).
- If Mac-side policy marks lock optional: text button "Not now". If policy
  requires it: no skip control at all (do not show a disabled skip).
- Success: green check crossfade, auto-advance after 800ms to 5.9 (install
  guidance) if running in Safari, else to workspace list.
- Failure/cancel of WebAuthn: inline `footnote` in `status/down` under
  button: "Face ID wasn't set up. Try again." Button remains.

**Lock gate** (every launch/foreground past auto-lock timeout):
- Solid `bg/canvas` full screen (privacy: no content behind, no blur
  reliance). Centered: app mark 44px, `headline` "Locked", primary button
  "Unlock with Face ID". Auto-triggers WebAuthn on appear; the button is the
  retry.
- After 3 failures: `footnote` secondary "Use your Mac to re-pair if Face ID
  is unavailable." (There is deliberately no password fallback on-device.)
- Unlock is instant-out: crossfade `dur/base` directly into the restored
  last screen.

### 5.3 Workspace list (root)

Nav: large-title pattern. Collapsed bar title "Workspaces"; scrolled to top,
`display` title with `gear` trailing and `squares` (switcher) next to it.
Subtitle = connection voice (§3).

Search field pinned below title: height 40, `r/control`, `bg/raised`, search
glyph, placeholder "Search workspaces and chats" (`text/tertiary`). Search
matches workspace names AND chat titles (results grouped, chat hits shown
with workspace in `mono-micro`). Cancel text button appears on focus.

Sections (only when non-empty, `micro-caps` headers):
1. **ACTIVE** - workspaces with `working` or `waiting` agents, sorted:
   waiting first (they need Alex), then working, by recency.
2. **RECENT** - last 5 opened, minus those above.
3. **ALL** - alphabetical remainder.

Row (56px): monogram; title = workspace name `headline`; subtitle =
`git-branch` glyph + branch in `mono-micro` secondary; trailing = status:
- `working`: pulse dot + count if >1 agent ("2" in `round-badge` secondary).
- `waiting`: waiting-badge "needs input" (or hourglass-only under 400px).
- unread: copper badge with count.
- idle: relative time `footnote` secondary.

Pull-to-refresh: standard rubber-band, spinner in `text/secondary`;
re-requests workspace snapshot from relay.

Empty state (no workspaces): centered, laptop glyph 36 secondary, `headline`
"No workspaces yet", `callout` secondary "Open Conductor on your Mac and
they'll appear here." No CTA (nothing to do from the phone).

### 5.4 Chat list (inside a workspace)

Nav: back chevron ("Workspaces"), title = workspace name, subtitle =
connection voice or branch. Trailing: `squares`.

Optional "New chat" control: ONLY if the relay reports the `new-chat`
capability this session: a 44px `plus` in the nav bar. Absent otherwise -
never disabled-visible (§6.1 truthfulness).

Row (64px, two-line): title = chat title `headline` (fall back to first
user message, ellipsized); subtitle = last message preview `callout`
secondary, 2 lines max, prefixed `You: ` when applicable; trailing stack =
relative time over status glyph/badge (taxonomy 4.1).

Sort: pinned first, then by last activity. Swipe actions (both truthful,
local-only): leading swipe = Pin/Unpin (copper), trailing = Mark read
(graphite). No delete (destructive AX operations are out of scope v1).

Empty: `headline` "No chats in this workspace", `callout` secondary "Start
one from your Mac." (or, with `new-chat` capability, primary button
"New chat").

### 5.5 Transcript

The core surface. Full-bleed on `bg/canvas`.

**Nav**: back chevron (workspace name as label when width allows), title =
chat title (tap → switcher sheet), subtitle = connection voice; when live
and the agent is active, subtitle shows `working` pulse + "Working · 0:24"
(tabular, live) or hourglass + "Needs your input".

**Message layout** (gutter 16):
- **Assistant text**: no bubble. Left-aligned `body` `text/primary`,
  max-width 100% of column. Paragraph spacing 12px. Markdown: bold/italic
  inline; lists indented 16; headings render as `body-em`; links
  `accent/copper` underlined-on-press; code inline in `mono-body` on
  `bg/inset` chip; code blocks in a detail-well style card (`bg/inset`,
  `r/control`, `mono-body`, horizontal scroll, copy button top-right,
  language tag `mono-micro` secondary).
- **User messages**: copper bubble (`bubble/user`, `on-bubble`), `r/bubble`
  with bottom-trailing corner 6px, right-aligned, max-width 85% (90% under
  400px). Text `body`. Below the bubble, right-aligned meta line
  `footnote` secondary - the delivery truth (§5.6): `Delivering…` /
  `Delivered 9:41` (check-double glyph) / `Queued · 2 ahead` (clock) /
  `Failed to deliver · Retry` (warn, "Retry" is a copper text button).
- **Tool activity**: cards per §4.7, full column width, 8px vertical margin.
- **Status row** (while agent active): below the last content block: working
  pulse + `footnote` secondary label: "Working · 0:24" or "Thinking…" or
  "Waiting for permission on your Mac" (hourglass, `status/wait` text -
  this one is critical; it means Conductor is showing a native prompt only
  the Mac can answer. If relay exposes an approve capability in future it
  becomes a card with actions; v1 it is information only, with copy telling
  Alex to answer on the Mac or that it's waiting).
- **Separators**: day boundaries centered `caption` secondary ("Today",
  "Yesterday", else "Jul 21").
- **Vertical rhythm**: 16px between different speakers, 8px within a run.

**Scrolling and streaming** (exact behavior, this gets tested):
- Pinned-to-bottom when the reader is within 48px of the bottom; appended
  content keeps the view glued via bottom anchoring.
- If the user scrolls up beyond 120px from bottom: unpin. New content must
  NOT move the viewport (use CSS `overflow-anchor` semantics or manual top
  anchoring). Show the **Latest pill**: `r/full`, `bg/elevated` + hairline +
  shadow/1 (light), chevron-down + "Latest" `caption`; plus an unread-count
  dot if new messages arrived while unpinned. Position: bottom-right, 12px
  above composer. Tap: smooth-scroll to bottom `dur/slow`, re-pin.
- Streaming text renders in append-only chunks (fade per §2.5). Never
  reflow earlier lines during a stream.
- History: reaching the top loads earlier messages with a 32px spinner row;
  prepended content preserves scroll position exactly.

**Reconnect state within transcript**: banner "Reconnecting…" (`tint/wait`,
refresh glyph). Existing content stays fully readable (never grayed).
Composer send-path degrades per §5.6. On resume: relay backfills missed
events; a subtle inline shimmer block ("catching up…" `footnote` secondary
with pulse) sits at the bottom until backfill completes, then resolves per
§2.5 motion 6.

### 5.6 Composer and sending

Docked at bottom; respects keyboard and safe area (§6.3).

**Anatomy** (gutter 12, 8px vertical padding, top hairline on the dock):
- Field: `bg/raised`, 1px `hairline/strong`, `r/bubble`. Min height 44
  (one line), grows to 6 lines (~144px) then scrolls internally. Font
  `body` (16px - no iOS zoom). Placeholder: "Message" (`text/tertiary`).
  This is a plain contenteditable/textarea - native iOS dictation via the
  keyboard mic works untouched; never intercept or custom-render input.
- Send button: 36×36 circle (44×44 target), `fill/copper` with `on-copper`
  arrow-up, trailing outside the field, bottom-aligned. Hidden until the
  field has content OR a send is possible to retry.
- Stop control: when the agent is `working` and the relay has the `stop`
  capability, the transcript status row (§5.5) gains a trailing "Stop"
  text button (`status/down`, 44px target). Tapping → button becomes
  spinner "Stopping…" until relay confirms. Without the capability, no
  stop control exists anywhere. Send and Stop are separate: sending while
  working queues (if Conductor queues) and the bubble meta says so.

**Send-path truth states** (the composer never lies):

| State | Field | Send | Explanation surface |
|---|---|---|---|
| Ready (relay live + Conductor running + AX verified) | editable | enabled | none |
| Stream live, send-path unverified | editable | enabled-amber ring | first tap runs a path check, then sends or fails honestly |
| Mac unreachable | editable (drafting allowed) | replaced by `wifi-slash` chip "Can't send - Mac unreachable" (`caption`, `status/down`) | tap chip → connection sheet (§5.7) |
| Conductor not running | editable | chip "Can't send - Conductor isn't open" | tap → sheet with "Open Conductor" action iff capability |
| AX revoked | editable | chip "Can't send - permission needed on Mac" | tap → sheet with exact System Settings path |
| Locked/auth revoked | gate screens (§5.2/§5.7) override | - | - |

Drafts persist locally per-chat (survive app kill). A chip above the field
appears when a draft exists and sending is down: "Draft saved on this
phone" (`caption` secondary) - explicitly NOT "will send when online".
There is no auto-send-on-reconnect in v1: when the path recovers, the
draft sits in the field and Alex sends it. (Rationale: an AX injection
firing minutes later into an unknown Mac state is exactly the kind of lie
this product must not tell.)

**Send lifecycle** (per message): tap send → bubble appears immediately
with meta `Delivering…` → relay confirms injection+submit → `Delivered
9:41` → agent events stream as normal. On failure at any step: meta becomes
`Failed to deliver · Retry`; the text is preserved verbatim; Retry re-runs
the full path check first. Multiple failed sends stack as failed bubbles;
each retries independently.

### 5.7 Connection and failure surfaces

**Connection sheet** (from any "Can't send" chip, subtitle tap when
degraded, or Security panel → Connection): auto-height sheet titled
"Connection". Content: a live checklist, each row 44px with status glyph:

```
✓ This phone → Tailscale        (live dot)         12 ms
✓ Relay on Alex's MacBook Pro   (live dot)         v1.4.2
✕ Conductor app                 (down)             Not running
–  Accessibility permission     (secondary dash)   Unknown until Conductor runs
```

Rows in `footnote` + `mono-micro` for values. Below: contextual action
(capability-gated: "Open Conductor" primary) and "Run check again" text
button. This sheet is the single diagnostic home; every failure copy in the
app deep-links here.

**Hard states** (banner + composer chip; content stays readable):
- **Mac offline/asleep**: banner `tint/down`, wifi-slash: "Mac unreachable ·
  Last synced 9:41" + action "Details" → sheet. Reconnect attempts use
  backoff; subtitle shows `Reconnecting…` during attempts.
- **Conductor closed**: banner `tint/wait`, warn: "Conductor isn't running
  on your Mac" + "Details".
- **Accessibility unavailable**: banner `tint/wait`: "Reading is live, but
  sending needs a permission on your Mac" + "How" → sheet row expands:
  "On your Mac: System Settings → Privacy & Security → Accessibility →
  enable Conductor Pocket Relay." in `footnote`, path segments in
  `mono-micro`.
- **Auth expired/revoked**: full-screen gate (not a banner): lock glyph,
  `title` "This device was signed out", `callout` secondary "Its access was
  revoked or expired. Pair again with a fresh link from your Mac." Primary:
  none (can't self-serve). Text: "How to re-pair" → expands the
  Conductor → Settings → Pocket instruction. All cached content is purged
  on revocation.

### 5.8 Draft conflict

Trigger: relay reports the Mac's Conductor composer already contains text
differing from the outgoing send.

Auto-height sheet, title "Unsent text on your Mac":
- Card 1 (`bg/inset`, `r/card`): `micro-caps` secondary "ON YOUR MAC",
  then the Mac draft in `mono-body`, max-height 160 internal scroll.
- Card 2: `micro-caps` "FROM THIS PHONE", your message in `body`.
- Buttons (stacked, full-width): Primary "Replace and send" (destructive
  intent but primary styling - it's the expected path; label carries the
  truth). Secondary "Keep the Mac draft" (dismisses; your text stays in the
  phone composer untouched). Text button "Cancel".

No append option: merging two drafts into one AX injection produces
garbage-order text nobody intended.

### 5.9 Install-to-home-screen guidance

Shown: (a) end of pairing when `display-mode` is browser, (b) anytime from
Security panel → "Install on this phone".

Full screen: `title` "Install Conductor Pocket", `callout` secondary "Run
it full-screen, off the Home Screen, like an app." Then three numbered
steps, each a 56px row (number in monogram square, `callout` text, glyph):

1. Tap the Share button in Safari (`share-ios` glyph inline)
2. Choose "Add to Home Screen" (`plus` glyph)
3. Open **Conductor Pocket** from your Home Screen

Footer `footnote` secondary: "You can keep using it in Safari, but the
installed app hides browser chrome and remembers your session better."
Text button "Done". No fake progress; we cannot detect completion, so we
don't pretend to.

If already standalone: this surface is only reachable from Security panel
and shows a green check + "Installed - you're running the app." state.

### 5.10 Security panel

Push (from root gear). ≤599px: full screen; ≥600px: 480px sheet/pane.
Title "Security & Devices".

Sections (`micro-caps` headers, cards of rows on `bg/raised`):

**THIS PHONE**
- Row: phone glyph, "This iPhone", subtitle `mono-micro` paired date +
  tailnet IP. Chip: "Face ID on" (`tint/live`) or button "Enable Face ID".
- Row: "Auto-lock" with trailing value + chevron → options sheet:
  Immediately / After 1 min / After 5 min / After 15 min (radio rows, 44px).
- Row: "Clear cached transcripts" - text-button styled `status/down`;
  confirm sheet: "Removes transcript copies stored on this phone. Your Mac
  keeps everything." / "Clear" destructive + Cancel.

**PAIRED DEVICES** (from relay)
- Row per device: glyph (phone/laptop), name, subtitle `mono-micro` "Last
  seen 2m ago · 100.84.x.x". Trailing "Revoke" destructive text button →
  confirm sheet: "Revoke 'iPhone 15'? It signs out immediately and its
  cached data is purged next time it connects." Current device labeled
  "(this phone)" and its revoke reads "Sign out this phone".
- Footer action: "Revoke all other devices" (destructive, confirm).

**CONNECTION**
- Live rows mirroring the connection sheet (§5.7): Mac name, relay version,
  latency (`mono-micro`, tabular, updates ≤1Hz), stream status.
- Row: "Test send path" → runs the full checklist inline with per-row
  spinners resolving to ✓/✕; failures show their fix copy. This is the
  feature that makes the product trustworthy - it must be real, never
  simulated.

**APP**
- Row: "Install on this phone" (§5.9). Version `mono-micro` footer:
  `pocket 1.0.0 · relay 1.4.2`.

### 5.11 Empty / loading / error / success grammar

- **Skeletons**: `bg/raised` blocks, `r/control`, opacity pulse 0.5→0.8,
  1.6s (no shimmer sweep). Lists: 6 skeleton rows. Transcript cold-open:
  paint cached snapshot instantly; only a virgin chat shows 3 skeleton
  lines. Skeletons never exceed 800ms without either content or an error.
- **Empty**: glyph 36 secondary + `headline` + one `callout` sentence,
  centered, no illustration art. (Copy per surface, §9.)
- **Error**: same grammar with warn glyph + specific reason + one concrete
  action. Generic "Something went wrong" is banned; every error names the
  failing thing (§9).
- **Success**: transient only - green check crossfade on the acting control
  or resolve-banner (§2.5 motion 6). No success modals, no confetti, ever.

---

## 6. System behaviors

### 6.1 Truthfulness doctrine (engineering-facing, testable)

1. Any control whose backing capability is unverified this session is NOT
   rendered. Never render disabled controls for missing capabilities.
2. Disabled-but-visible is reserved for temporarily invalid input (empty
   composer) - and always with a visible reason within one tap.
3. "Delivered" means relay-confirmed injection AND submission. "Sent" is
   never displayed as a state name (ambiguous).
4. Timestamps shown to the user are device-local formatted, sourced from
   relay event time; never claim "now" for cached data - stale surfaces
   show "Last synced H:MM".
5. No optimistic connection states: `live` requires an open SSE stream with
   a heartbeat within the last 10s (assumption, §12).

### 6.2 Safe areas and PWA chrome

- `viewport-fit=cover`; all fixed chrome pads with
  `env(safe-area-inset-*)`: nav top, composer/dock bottom, sheets bottom,
  Latest pill (offset composer height + 12 + inset).
- Standalone: `black-translucent` status bar; canvas paints behind the
  status bar; nav bar content starts below inset. Detect
  `(display-mode: standalone)` for install-state logic.
- Landscape phone: insets left/right honored; composer max-width 680
  centered; otherwise unchanged (no special landscape layout in v1).

### 6.3 Keyboard

- `interactive-widget=resizes-content`; the composer rides the keyboard
  with zero gap.
- If the transcript was pinned-to-bottom when the keyboard opens, it stays
  pinned (re-scroll after resize).
- Tapping the transcript does NOT dismiss the keyboard; an explicit
  downward drag on the transcript does (`overscroll` gesture), matching
  iMessage muscle memory.
- Enter inserts newline on iOS (send is the button); on hardware keyboards
  and desktop: Enter sends, Shift+Enter newlines.

### 6.4 Scrolling

- `overscroll-behavior: none` on body; `contain` on panes. Momentum
  scrolling native. Rubber-band allowed inside transcript.
- Scroll anchoring rules as §5.5. This is acceptance-tested (§11).

### 6.5 Local cache (device only - no cloud)

Last 50 messages + metadata per chat, workspace/chat lists, and route are
snapshotted to device storage (IndexedDB) for instant resume, purged by
revocation and by the Security panel control. This is a privacy-relevant
default I am asserting, not something specified upstream - confirm (§12).

### 6.6 Performance budgets

- Cold launch (installed, cached) to painted last-transcript: < 600ms on
  iPhone 17 Pro Max.
- Tap-to-pressed feedback: < 80ms. Route push: < 350ms total.
- A previously opened chat paints from memory before IndexedDB or network
  work. Revalidation is incremental from its cursor, stale requests are
  aborted on a newer route, and snapshot persistence is outside the paint
  path.
- Large JSON responses use Brotli when supported. Collapsed activity does
  not create hidden Markdown DOM until expansion.
- Shell revisions are checked on launch, foreground, and while connected.
  Reload waits for foreground-safe state, no active delivery or security
  operation, and an exact durable copy of any visible draft. A service worker
  never treats a silent or suspended page as permission to navigate it.
- Streaming append: no frame > 8ms scripting on mid-tier; chunk batching
  ≥ 60ms windows (don't render per-token).
- Total asset weight (no external assets): < 300KB gzipped app shell.

---

## 7. Responsive breakpoints

| Range | Layout |
|---|---|
| 360-599px | Single pane stack (primary spec, as above). At 360-399: gutters 12, bubble max-width 90%, waiting-badge collapses to glyph-only, nav back label hidden (chevron only). |
| 600-1023px | Two panes: left 320px chat list (of the active workspace, workspace switcher via `squares`), right transcript. Nav bars merge into one 52px bar spanning both. Sheets become anchored popovers (switcher: 400×560 from the title). |
| ≥1024px (desktop) | Three panes: workspaces rail 260px (`bg/canvas`, rows as §5.3, collapsible to 72px icon rail via chevron at rail bottom) · chat list 320px (`bg/canvas` + trailing hairline) · transcript flex, content column max-width 720px centered, composer matches column. Top bar 48px: connection voice left (dot + "Live · alexs-mbp · 12ms" in `footnote`/`mono-micro`), gear right. ⌘K opens switcher (as a centered 560px modal), Esc closes, ↑↓ navigate, Enter opens. Hover states: rows tint `bg/raised`; tool cards show chevron on hover. Cursor: default pointer semantics; no custom cursors. |

Transcript line length: at ≥600px, assistant text max-width 68ch even inside
wider columns.

Desktop is a convenience surface; it must not grow features mobile lacks
(except keyboard shortcuts listed above).

---

## 8. Accessibility (WCAG 2.1 AA)

1. **Contrast**: all text/background pairs in §2.2 meet 4.5:1 (normal) or
   3:1 (≥18.66px bold/24px). `text/tertiary` is confined to placeholder and
   disabled roles. Status glyph + label pairing means color is never the
   sole channel. CI check: automated contrast test over the token matrix
   for both themes (§11).
2. **Targets**: every interactive element ≥44×44 CSS px hit area (visual
   size may be smaller; expand via padding/pseudo-element). List rows
   full-bleed tappable.
3. **Dynamic Type-minded**: all type in rem; layout tested at 130% root
   scale: rows grow, nothing truncates below 2 lines, composer and nav
   remain usable; no fixed-height text containers.
4. **VoiceOver**: nav landmarks (banner/main); transcript is a list;
   messages labeled "You said …" / "Conductor replied …"; tool cards
   labeled "Activity: Edited composer/index.ts, 8 seconds, collapsed,
   button"; connection voice is `aria-live="polite"`; streaming announces
   at message completion, not per chunk (throttle); banners are
   `role="status"`, auth gate `role="alert"`. Focus is trapped in sheets,
   returned on dismissal.
5. **Reduced motion/transparency**: per §2.5; privacy shield and sheets use
   solid fills, no blur dependence.

---

## 9. Copy reference (verbatim strings)

| Key | String |
|---|---|
| pairing.title | Pair with "{macName}" |
| pairing.words.help | Conductor on your Mac is showing the same four words. If they don't match, don't pair. |
| pairing.cta | The words match - Pair |
| pairing.expired.title | This link has expired |
| pairing.expired.body | Pairing links work once. Generate a new one on your Mac: Conductor → Settings → Pocket. |
| lock.title | Locked |
| lock.cta | Unlock with Face ID |
| enroll.title | Lock this remote |
| enroll.body | Anyone with this phone could drive your Mac. Face ID keeps it to you. |
| conn.reconnecting | Reconnecting… |
| conn.offline.banner | Mac unreachable · Last synced {time} |
| conn.conductorClosed.banner | Conductor isn't running on your Mac |
| conn.ax.banner | Reading is live, but sending needs a permission on your Mac |
| conn.ax.how | On your Mac: System Settings → Privacy & Security → Accessibility → enable Conductor Pocket Relay. |
| conn.live.resolve | Live |
| composer.placeholder | Message |
| composer.cant.offline | Can't send - Mac unreachable |
| composer.cant.conductor | Can't send - Conductor isn't open |
| composer.cant.ax | Can't send - permission needed on Mac |
| composer.draft.saved | Draft saved on this phone |
| msg.delivering | Delivering… |
| msg.delivered | Delivered {time} |
| msg.queued | Queued · {n} ahead |
| msg.failed | Failed to deliver · Retry |
| status.working | Working · {m:ss} |
| status.thinking | Thinking… |
| status.waiting | Waiting for permission on your Mac |
| status.stopping | Stopping… |
| conflict.title | Unsent text on your Mac |
| conflict.replace | Replace and send |
| conflict.keep | Keep the Mac draft |
| auth.revoked.title | This device was signed out |
| auth.revoked.body | Its access was revoked or expired. Pair again with a fresh link from your Mac. |
| empty.workspaces.title | No workspaces yet |
| empty.workspaces.body | Open Conductor on your Mac and they'll appear here. |
| empty.chats.title | No chats in this workspace |
| empty.chats.body | Start one from your Mac. |
| search.empty | No matches for "{query}" |
| install.title | Install Conductor Pocket |
| install.body | Run it full-screen, off the Home Screen, like an app. |
| security.clearCache.confirm | Removes transcript copies stored on this phone. Your Mac keeps everything. |
| security.revoke.confirm | Revoke "{device}"? It signs out immediately and its cached data is purged next time it connects. |
| catchup | catching up… |
| pill.latest | Latest |

Tone rules: sentence case everywhere; no exclamation marks; failures name
the broken thing and the fix location; the Mac is always "your Mac"; the
agent is "Conductor", never "the AI".

---

## 10. Wireframes

### 10.1 iPhone 430×932, dark - Transcript (streaming), the hero screen

```
┌─────────────────────────────────────────┐
│ ▂▂ status bar (canvas bleeds behind) ▂▂ │  safe-area top
│ ‹ chicago      Fix relay auth     ▣     │  nav 52px: back(label=workspace),
│                ● Working · 0:24         │  title(tap→switcher), squares glyph
│─────────────────────────────hairline────│  (hairline only when scrolled)
│                                         │
│  Sounds right. The token refresh        │  assistant `body` 16/24,
│  fails because the relay caches the     │  no bubble, gutter 16
│  old cert. Two fixes:                   │
│                                         │
│  ┌───────────────────────────────────┐  │  tool card collapsed 40px
│  │ ▤ Edited relay/auth.ts   4.1s  ⌄ │  │  `bg/raised`, r10, mono path
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │  running card: copper 2px
│  │ ▮ Running npm test        0:12  ⌄ │  │  left edge, pulse glyph,
│  └───────────────────────────────────┘  │  live tabular elapsed
│                                         │
│  ● Working · 0:24              Stop     │  status row: pulse + footnote,
│                                         │  Stop = status/down text btn
│                        ┌──────────────┐ │
│                        │ run the full │ │  user bubble: copper #7A4526,
│                        │ suite after  │ │  r18 (br 6), max-w 85%
│                        └──────────────┘ │
│                        ✓✓ Delivered 9:41│  meta footnote secondary
│                              ┌────────┐ │
│                              │⌄ Latest│ │  pill appears only unpinned
│                              └────────┘ │
│─────────────────────────────hairline────│
│ ┌─────────────────────────────┐  ┌───┐ │  composer dock: field r18
│ │ Message                     │  │ ↑ │ │  grows 1→6 lines; send 36px
│ └─────────────────────────────┘  └───┘ │  copper circle (44 target)
│ ▂▂▂▂▂▂▂▂ home indicator ▂▂▂▂▂▂▂▂▂▂ │  safe-area bottom
└─────────────────────────────────────────┘
```

Same screen, reconnecting: subtitle → "Reconnecting…" amber; banner card
inset 8px below nav: `⟳ Reconnecting…`; send button → `⚠ Can't send - Mac
unreachable` chip; content unchanged and readable; "catching up…" pulse
line above composer once stream resumes.

### 10.2 iPhone 430 - Workspace list (root)

```
┌─────────────────────────────────────────┐
│ Workspaces                    ▣    ⚙    │  large title `display`,
│ ● Live · alexs-mbp                      │  connection voice footnote
│ ┌─────────────────────────────────────┐ │
│ │ ⌕ Search workspaces and chats       │ │  40px, r10, raised
│ └─────────────────────────────────────┘ │
│ ACTIVE                                  │  micro-caps
│ ┌──┐ chicago                       ⏳   │  56px row: monogram 36,
│ │Ch│ ⎇ understand-conductor…  needs input│ waiting badge amber
│ ├──┤ innerdm                        ●   │
│ │In│ ⎇ main                            2 │  pulse + agent count
│ RECENT                                  │
│ │Ov│ ovo-academy                    ❸  │  copper unread badge
│ │Ra│ radar-house                   2h   │  idle: relative time
│ ALL                                     │
│ │Bi│ biologix-site                  1d  │
│ │…                                      │
└─────────────────────────────────────────┘
```

### 10.3 iPhone 430 - Switcher sheet (65%)

```
│░░░░░░░░░ scrim 44% ░░░░░░░░░│
┌──────── grabber ────────────┐  r16 top, bg/elevated
│ ┌─────────────────────────┐ │
│ │ ⌕ Search                │ │  autofocused? NO - focus on
│ └─────────────────────────┘ │  demand only (keyboard jump)
│ RECENT                      │
│ Fix relay auth        ●     │  chat title headline
│ chicago · 2m          mono  │  workspace mono-micro
│ Passport sessions     ❷     │
│ biologix-site · 1h          │
│ …                           │
└─────────────────────────────┘
```

### 10.4 iPhone 430 - Pairing, Lock, Conflict (compact)

Pairing: centered column per §5.1 - mark, names card with mono tailnet +
four mono verification words, primary CTA. Lock: solid canvas, mark,
"Locked", one primary button. Conflict sheet: two stacked cards (mono Mac
draft well / your text), three stacked buttons.

### 10.5 Desktop ≥1024, light

```
┌────────────────────────────────────────────────────────────────────┐
│ ● Live · alexs-mbp · 12ms                                    ⚙     │ 48px bar
├──────────────┬───────────────┬─────────────────────────────────────┤
│ Workspaces   │ chicago     + │        (transcript column            │
│ ⌕ search     │ ⌕ search      │         max-width 720 centered)      │
│ ACTIVE       │ Fix relay ● 2m│  assistant text 68ch max             │
│ chicago    ⏳│ Passport   1h │  ┌ tool card ───────────┐            │
│ innerdm    ● │ Sess memo  1d │  └───────────────────────┘           │
│ RECENT       │               │            ┌ user bubble ┐           │
│ ovo-academy ❸│               │            └─────────────┘           │
│ …            │               │  ● Working · 0:24   Stop             │
│              │               │  ┌ composer ──────────────┐ (↑)      │
│ ⌄ collapse   │               │  └────────────────────────┘          │
└──────────────┴───────────────┴─────────────────────────────────────┘
  260px rail     320px list      flex; white cards on #F7F5F1
```

⌘K switcher modal centered 560×480. All tokens identical to mobile.

---

## 11. Acceptance criteria

Structure/navigation
1. Cold launch (installed) lands on the last open transcript with cached
   content painted < 600ms, before the stream connects.
2. No tab bar exists at any width. Switcher sheet reachable from every
   screen in ≤1 tap; any recent chat reachable in ≤2 taps from anywhere.
3. Edge-swipe back works on every pushed screen.

Truthfulness
4. With SSE closed > 10s, the subtitle leaves "Live" and the send button is
   replaced by a reason chip; both within 1s of detection. No message can
   enter a "Delivering…" state while the path is down.
5. "Delivered" appears only after relay confirms injection + submission
   (verify with a relay that ACKs late: meta must stay "Delivering…").
6. Kill Conductor on the Mac: banner names Conductor specifically; "Open
   Conductor" action appears only when the relay advertises the capability.
7. Revoke AX permission: reading continues, composer chip switches to the
   permission reason, connection sheet row shows the exact settings path.
8. Revoke device from Mac: phone hits full-screen signed-out gate on next
   event; cached data purged; no stale transcript visible after.
9. No disabled control exists without a visible reason within one tap; no
   control renders for an unadvertised capability (audit all: new-chat,
   stop, open-Conductor).

Transcript/streaming
10. Pinned at bottom: streaming never causes visible jumps; unpinned:
    viewport is stable while content streams, Latest pill appears with
    count; tapping it re-pins.
11. Tool cards: collapsed by default including after reload; grouped runs
    show count + total time; expanded detail scrolls internally and
    horizontally; copy button works; failed calls visibly distinct.
12. History prepend preserves exact scroll position.

Composer/keyboard
13. Field font ≥16px (no iOS zoom on focus); dictation via the system
    keyboard works with no custom interception; field grows to 6 lines
    then scrolls.
14. Keyboard open keeps composer attached (no gap, no overlap) with
    `viewport-fit=cover` in standalone; transcript stays pinned if it was.
15. Draft persists across app kill; draft-conflict sheet shows both texts
    verbatim; "Keep the Mac draft" leaves the phone text in the field.

Security surfaces
16. Pairing link is single-use: second open shows the expired state.
    Verification words render identically to the Mac's (string equality).
17. Lock gate shows no content whatsoever (solid fill) and auto-prompts
    Face ID on foreground past the auto-lock threshold.
18. Per-device revoke and revoke-all require a confirm sheet naming the
    device; "Test send path" performs real checks (verify by breaking each
    link in the chain and watching the matching row fail).

Visual/system
19. Both themes pass automated 4.5:1 checks for every text token pair used;
    status is never color-only (glyph or label present in all instances).
20. All interactive targets ≥44×44 (automated audit); rows full-bleed
    tappable.
21. Layout intact at 360px width and at 130% root font scale (no clipped
    controls, no sub-2-line truncation of message text).
22. Safe areas: no content under the home indicator; status bar area shows
    canvas color in standalone; Latest pill clears the composer at every
    keyboard state.
23. Zero external network requests for fonts/assets (audit the network
    panel); app shell < 300KB gzipped.
24. `prefers-reduced-motion` removes pulse/slide animations (crossfades
    only) with all states still distinguishable.

Screenshot review set (for my later visual review - capture exactly):
430px dark: workspace list, transcript streaming, transcript reconnecting,
composer 4-line + keyboard, switcher sheet, pairing, lock, conflict sheet,
security panel, install guidance. 430px light: workspace list, transcript
streaming. 360px dark: transcript. 1280px light + dark: three-pane with
switcher modal open.

---

## 12. My assumptions (confirm before building the dependent parts)

These are mine, not derived from the brief. Each gates specific UI:

1. **Relay advertises capabilities per session** (`new-chat`, `stop`,
   `open-conductor`, `read-mac-draft`). The truthfulness doctrine depends
   on this handshake existing. If it doesn't, those controls ship absent,
   not guessed.
2. **Heartbeat ≤10s on the SSE stream** defines "live". Adjust thresholds
   to the real heartbeat interval.
3. **Device-local snapshot cache (§6.5) is acceptable** under "no cloud
   transcript storage". If Alex wants zero at-rest copies on the phone,
   drop the cache; cold launch then shows skeletons ~1-2s and criterion 1
   relaxes to "paint within 300ms of first stream data".
4. **No auto-send of drafts on reconnect** (deliberate, §5.6). If lived
   experience demands queued sends, that's a v2 with an explicit armed
   "will send when Mac returns" state, never silent.
5. **Waiting-for-permission is read-only in v1** (answer on the Mac). If
   the relay can click permission prompts later, that state upgrades to an
   action card - highest-value future addition.
6. **Verification words**: relay generates a 4-word SAS from the pairing
   token and shows it in Conductor's Pocket pane. If the Mac side can't
   display words, fall back to a 6-char mono code, same layout.
```

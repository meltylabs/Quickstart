# Braden operating-partnership deck

Private 18-slide founder-to-founder presentation for Alex's next Biologix conversation.

## Files

- `index.html`: live presentation with embedded speaker notes
- `deck.css`: OVO visual system, product-preview UI, responsive and print layouts
- `deck.js`: keyboard, touch, fullscreen, notes, overview, progress and image-fallback behavior
- `talking-points.md`: full call script, system explanation, objections and negotiation boundaries
- `braden-operating-partnership.pdf`: static 18-slide leave-behind export

## Run locally

From this directory:

```sh
python3 -m http.server 4179 --bind 127.0.0.1
```

Open `http://127.0.0.1:4179/`.

## Controls

- Right arrow, down arrow, space, or Page Down: next slide
- Left arrow, up arrow, or Page Up: previous slide
- `F`: fullscreen
- `N`: speaker notes
- `O`: slide overview
- `B`: black screen
- Home / End: first or last slide

The URL hash opens a specific slide. For example, `#7`, `#8`, and `#9` open the executive cockpit, affiliate command center, and creator portal previews.

## Presentation discipline

- Slides 7 through 9 contain illustrative interface data only. They are concept previews, not Biologix actuals.
- Do not send the deck cold. Present it live and use the questions in `talking-points.md`.
- Do not lead with equity numbers. Establish the operating mandate and paid verification gate first.
- The pictured OVO creators demonstrate ecosystem capability. They are not represented as committed Biologix affiliates.
- No product-use demonstrations, dosing, medical advice, or undisclosed promotion belong in the retreat concept.

## Visual review

Claude Fable 5 authored the route-specific visual direction and reviewed rendered desktop and 430px mobile evidence. The final review returned `SHIP` after the mobile dashboard, photo contrast, palette, typography and collision issues were corrected.

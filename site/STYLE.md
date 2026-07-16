# Style guide — project repository

## Principle
The site is a shelf, not a brand. Projects bring their own identity; the shelf imposes none.
No wordmark, no taglines, no label copy. The domain is the only identifier.

## Shell (the neutral container)
- **Background** `#FAFAF8` · **Text** `#1A1A1A` · **Secondary** `#6B6B6B` · **Hairlines** `#E4E4E0`
- **No accent colour.** Links are underlined text in the text colour.
- **Type:** system font stack only. Body 16px/1.55. Project names 20px semibold. Row metadata 13px secondary.
- **Layout:** single centred column, max 640px, generous whitespace. Two sections — "Games" first, then "Projects" — each a 13px secondary heading over rows divided by hairlines. Games holds the playable games (Cubicle, then Jaryd's Last Day); Projects holds CafePass, Shaman Starman, and Trolley.
- **Motion:** expand/collapse only (native `<details>`). Nothing else moves.
- **Copy:** plain and factual. A row is: name · type · one factual line.

## Project rows
- Each project is a `<details>` element. The `<summary>` is the row; the panel is the expansion.
- Only live projects appear. In-development projects are absent, not teased.
- Row metadata states the type honestly: Game, App, Tool, etc.

## Project panels (the viewport rule)
Everything inside an expanded panel belongs to the project, not the site.
The panel is skinned as that project's own UI — fonts, colours, components, voice.
The shell's styles must not leak in; the panel's styles must not leak out (namespace all
panel CSS under a per-project class, e.g. `.vitals`).

Current panels:
- **Cubicle** (`.vitals`): full Vitals 365 skin. Deep purple header bar `#33344a` with white
  V chip, sheet background `#f5f5f5`, white Teams cards (8px radius, soft shadow), Teams
  purple `#6264a7` primary buttons, meter bars, Segoe-first font stack. Leaderboard renders
  inside this skin (top 10 per board, split length/difficulty selectors). Copy inside the
  panel uses the game's dashboard voice.
- **Jaryd's Last Day** (`.offboard`): manila dossier skin lifted from the game — manila
  folder ground `#d3c29b`, ledger-paper cards `#fdfaf1`, navy ink `#1f2a3a` topbar with
  gold `#c9a227` accents and the dog brandmark SVG, squared corners throughout, solid
  meter bars (Mayhem red, Heat amber, Legend navy, Severance green), a rotated red
  `#b3372c` "FINAL DAY" stamp on the scene card, tier chips. Arial for everything, by
  design — the document nobody chose a font for. Copy uses the suite's HR-software voice.
- **CafePass** (`.cafepass`): warm coffee palette lifted from the product — cream sheet
  `#F4EFE6`, dark ink `#1A1410` header with gold `#C9A876` accents, Georgia serif for
  drink names, sans for UI chrome. Shows the "usual order" card, feature badges, and a
  "View brief" CTA through to `cafepass.html`.
- **Shaman Starman** (`.starman`): night-sky palette lifted from the site — void `#0a0918`
  with CSS-gradient star specks, nebula gradient, lilac `#9c8fd9` copy, gold `#e3b457`
  uppercase CTA. Georgia stands in for the site's Cinzel/Spectral (no external fonts in
  the shell). Shows the reading badges and an "Enter the site" CTA through to `starman.html`.
- **Trolley** (`.trolley`): acid terminal palette lifted from the app — near-black ground
  `#0d0f0c` with a faint scanline gradient, acid green `#b8f34e` accents and CTA, panel
  cards `#141810`, monospace stack standing in for IBM Plex Mono and Georgia for Fraunces
  (no external fonts in the shell). Shows the barcode wordmark, a three-item price-war
  table (cheapest cell acid, toggled-out shop struck through), shop chips, and the
  basket/save/stops/loop verdict strip, with an "Open Trolley" CTA through to `trolley.html`.

## Quality floor
Responsive to mobile, visible keyboard focus, reduced-motion respected, no external fonts
in the shell (panels may load their own if their identity requires it).

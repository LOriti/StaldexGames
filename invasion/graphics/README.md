# Invasion — Command graphics pack v1

An integrated graphics pack for `site/invasion.html` and the map prototype at
`site/invasion2.html`. Open `/invasion-graphics` for the artwork, symbols, effect
demonstrations and both playable versions at three phone sizes.

## Game analysis and art direction

Invasion is an information-management strategy game: prepare for a century,
interpret imperfect clues, commit a finite workforce and watch the consequences.
Its strongest visual subject is Earth and what the player builds around it.
The writing is sober and the enemy's identity is hidden, so colourful arcade
aliens, character portraits or species-specific ships would work against it.

| Existing presentation | Consequence | Pack response |
| --- | --- | --- |
| Random polygon continents | The planet reads as an abstract token | Detailed, recognisable Earth with clouds, night lights and Australia in view |
| Many similar text cards | The branches and projects are hard to identify at a glance | Three branch illustrations and 15 distinct project symbols |
| Small flat spacecraft | Construction and invasion lack visual weight | Shaded human frigates, drive plumes, anonymous hostile contacts, impact blooms |
| A single shield outline | A major late-game capability looks modest | Subtle hexagonal shield surface, with the original state-driven shield remaining authoritative |
| Long text-only opening | The premise has little emotional staging | Earth-led title scene and expandable field manual |
| A large globe in the map prototype | More room for detail, but a separate renderer would drift | One shared pack and identical renderer hooks for both versions |

The palette retains the original warm action accent and colour meanings, with
navy/slate surfaces, icy blue instruments, green operational indicators, amber
caution and red hostile indicators. Labels remain beside symbols. No enemy
portraits or species-specific hulls are introduced. The branch images are
illustrative; they do not claim the depicted infrastructure is already built.

## Included assets

| Asset | Location | Format / dimensions |
| --- | --- | --- |
| Earth sprite | `site/invasion-assets/command-v1/earth.webp` | Transparent WebP, 768 × 768 |
| Defence artwork | `site/invasion-assets/command-v1/defence.webp` | WebP, 960 × 640 |
| Endurance artwork | `site/invasion-assets/command-v1/endurance.webp` | WebP, 960 × 640 |
| Science artwork | `site/invasion-assets/command-v1/science.webp` | WebP, 960 × 640 |
| Project / navigation / lane symbols | `site/invasion-assets/command-v1/icons/` | 24 SVGs, 32 × 32 viewBox |
| Shared presentation | `site/invasion-assets/command-v1/graphics.css` | UI skin and responsive layouts |
| Shared renderer helpers | `site/invasion-assets/command-v1/graphics.js` | Dependency-free browser JavaScript |
| Original artwork | `invasion/graphics/source/` | Four full-resolution PNG masters |

All four runtime images together are approximately 526 KiB. The 151,390-byte
Earth is loaded first. Branch images load through CSS when their header is
shown; the game does not load the original PNG masters. There is no build step,
image API call, tracking request or new runtime library.

## Integration

The two game pages load the CSS after their existing styles and the JavaScript
immediately before their main script. `window.InvasionGraphics` provides small
canvas drawing functions, SVG symbols and branch-header markup. The game calls
these helpers at its existing render points. They do not change the simulation,
purchase rules, scores, storage keys, event choices or enemy data.

If the pack script is unavailable, the game uses its original canvas renderer
and card labels. If only the Earth image fails or is still loading, the old
procedural planet draws until the image is available. CSS and script use `?v=1`;
bump these when changing pack files to avoid stale browser caches.

The existing live overlays remain: turrets, cities, reserves, bunkers, network,
fleet, science, shields, the Ark and invasion damage. The new circular arc uses
the real preparation year; its red arrival state starts at Year 90. It is not
an independent readiness meter.

The animation loop is capped at 30 fps (15 with reduced motion) and skips
rendering when the document is hidden. Reduced motion also freezes decorative
star twinkles and orbit/pulse movement, and disables CSS transitions and pulses.
Essential invasion arrival and damage effects still communicate battle events.
Canvas-container resize observation prevents stretching when readiness panels
or phone dimensions change the space available to the map.

### Reuse or removal

To install in another checkout, copy `site/invasion-assets/command-v1/` and the
two modified game files. The gallery is optional. This is not a filename-only
texture replacement: the supplied game files contain the renderer hooks.

To remove the pack, revert the two game-file changes. No save migration or game
reset is needed. Keep the source masters outside `site/` so they are not shipped
as public runtime assets unnecessarily.

## Artwork provenance and limitations

The four raster artworks were created with the built-in image-generation tool
for this pack. Prompts are in `PROMPTS.md`. SVGs and canvas effects are original
code-native drawings. No third-party asset packs or stock photographs are used.
AI-generated Earth geography is approximate; it is decorative, never a targeting
map. Project locations on the globe remain the game's existing seeded schematic
positions rather than real-world coordinates.

The classic game still has a small planetary viewport and dense calculations.
The pack improves hierarchy without turning this into a new interface. The
larger map prototype remains the better canvas for a future visual-first edition.
Neither prototype mechanics nor balancing is changed here.

## Validation

Run from the repository root:

```sh
node --test tests/*.test.mjs
```

`tests/invasion-graphics.test.mjs` checks the renderer helpers without consuming
game randomness, verifies context save/restore balance, tests the missing-image
fallback, compiles both integrations and the gallery, and verifies symbol exports.
The existing Invasion model tests continue to check combat and progression.

Visual browser validation status is recorded in `VALIDATION.md`; a passing model
test is not a substitute for a phone-layout check.

# Validation — Command v1

- `node --test tests/*.test.mjs`: **175 passed, 0 failed**.
- Both full game scripts and the gallery script compile.
- The pure simulation sections of both game pages were compared byte-for-byte
  against base commit `1b72bf6`: unchanged.
- All four optimised raster assets were decoded and inspected; Earth retains
  its alpha channel. All 24 individual SVG symbols are exported.
- The actual game canvas renderer was exercised with the pack in preparation,
  invasion and classic 164 × 186 viewport states using a native Canvas 2D
  implementation. The composite asset sheet is `Invasion_Command_Preview.png`.
  This is an artwork/canvas review sheet, not a browser screenshot.
- **Browser smoke checks passed** on the deployed branch preview at
  `https://1c54acea.staldexgames.pages.dev/invasion-graphics`: both game versions
  start and pause; classic project purchase controls work; Defence, Endurance
  and Science artwork loads; the map's project sheet opens and closes.
- Both iframe layouts were checked at 320 × 668, 390 × 844 and 430 × 932.
  Document scroll width matched viewport width at all three sizes. The title,
  compact cards, project sheets and map were inspected visually.
- This check caught a distorted globe when the map's readiness panel changed
  its height. Both games now observe their canvas container with
  `ResizeObserver`, keeping the backing buffer aligned to its display size.
  The corrected map canvas aspect ratio was verified in the browser.
- **A full century-to-debrief browser playthrough remains outstanding**,
  including a war-council decision. The pure model tests and native invasion
  renderer check cover combat logic and drawing, but do not replace that run.
- The original procedural planet fallback is covered by a missing-image test.
  A full browser network-failure test remains outstanding.

This change is prepared for review, not merged or deployed to production.

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
- **Browser layout and end-to-end play checks are outstanding.** The connected
  preview browser stalled, the local headless browser could not launch in the
  execution environment, and the cloud browser could not reach the local server.
  Before merging, open `/invasion-graphics` on a branch preview, check 320 × 668,
  390 × 844 and 430 × 932, and play through a council decision and the debrief.
- The original procedural planet fallback is covered by a missing-image test.
  A full browser network-failure test remains part of the above visual review.

This change is prepared for review, not merged or deployed to production.

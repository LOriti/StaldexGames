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
- **Full century-to-debrief browser playthroughs passed in both versions** on
  `https://fb7fdeba.staldexgames.pages.dev/invasion-graphics` (commit `f95992e`).
  Both games ran through Years 0–100 at the normal 4× control, timed council
  events, Year 90 vanguard reports, final spending, the Year 100 war council,
  all three waves and their report/crisis gates, the long-war council,
  occupation/resistance, debrief detail sheets and New Run.
- Purchases included the Defence Grid, Global Legion, Orbital Fleet and all
  four Science tiers, plus a Mk II upgrade. Classic also exercised Year 100
  shield mothball/reactivation and the 50% day-one warning. Leftover readiness
  allocation and enemy guesses were committed through the actual UI.
- The classic run ended after 1 year 155 days; the map run ended after 313 days.
  Both produced readable charts, lane summaries, enemy reveals and saved best
  scores, opened debrief detail sheets, then restarted successfully at Year 0.
  These are end-to-end loss-path runs, not exhaustive coverage of every victory
  or campaign branch. Existing pure-model tests cover winning builds.
- The playthrough found that the map's Projects half-sheet (z-index 31) covered
  council dialogs (z-index 20). The shared skin now raises modal dialogs to 60,
  above both the half-sheet and its scrim. Both game CSS URLs were bumped to
  `?v=2`. The corrected dialog stacking and subsequent council choices were
  exercised in the browser.
- No game-origin console errors were recorded during the completed runs.
- The original procedural planet fallback is covered by a missing-image test.
  A full browser network-failure test remains outstanding.

The tested build is ready for the authorised production merge. Production
verification is recorded separately after deployment.

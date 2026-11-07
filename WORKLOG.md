# Local editor and welcome demos — 2026-11-07

- Replace random catalog artwork on the welcome screen with original local demo labels.
- Remove the browser editor from global navigation.
- Add a build-time REMOTE_ARTWORK switch. The slot.sp deployment disables catalog and thumbnail image downloads; local PNG imports, colors, finishes and saving remain available.
- Update the renderer pin to the neutral slot.sp shell assets after the matching source commit is published.
- JavaScript suite: 92 tests pass. Repeat native/WASM/browser validation after the renderer pin is updated.
- Coordinate with slot.sp refresh/demo-media and CLEANUP-WORK.md. No merge or deployment claimed.

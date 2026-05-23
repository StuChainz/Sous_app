# Beta Diagnostics QA

Use the diagnostics report for tester bug reports. It is not a data backup and should not include full logs, full recipes, full profile targets, or full meal ingredients by default.

## Normal Bug Report

1. Open Jot.
2. Tap the floating Bug button, or open Profile and tap Diagnostics report.
3. Type what happened in the note field.
4. Tap Copy report.
5. Confirm the status says the diagnostics JSON was copied.

## Clipboard Failure Fallback

1. In a browser where clipboard write is blocked, open the bug report modal.
2. Type a short note.
3. Tap Copy report.
4. Confirm a selectable JSON text area appears.
5. Select/copy the JSON manually.

## PWA Standalone Detection

1. Add Jot to the iPhone Home Screen.
2. Open it from the Home Screen icon.
3. Generate a diagnostics report.
4. Confirm `standalonePWA` is `true`.
5. Repeat in Safari and confirm `standalonePWA` is `false`.

## Voice Issue After Failed Recognition

1. Start voice logging.
2. Trigger a failed recognition or no-speech timeout.
3. Open the bug report modal without reloading.
4. Confirm the report includes `currentVoiceInputMode`, `voiceStatus`, recent `voiceTrace`, and any recent voice error/recovery entries.

## Barcode Issue After Failed Lookup

1. Open barcode logging.
2. Trigger a failed camera start or failed product lookup.
3. Open the bug report modal without reloading.
4. Confirm the report includes `barcodeTimingTrace` and `lastBarcodeError`.

## Privacy Check

1. Create logs, recipes, usual meals, meal memories, and custom foods with recognizable names.
2. Generate a diagnostics report.
3. Confirm `localStorageSummary.sensitiveCounts` includes only counts.
4. Search the JSON for the recognizable food, recipe, memory, and custom food names.
5. Confirm those names are not present unless they appeared in recent debug traces or the tester note.

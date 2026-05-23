# Beta Readiness QA

Use this as the final manual pass before a beta build. Run it on desktop first, then repeat the mobile sections in an installed iPhone PWA.

## Logging Paths

- Manual add: add `oats 50g`, edit it before saving, then save the meal.
- Hold-to-talk: say `100 grams chicken breast`, release, confirm one editable row appears.
- Continuous voice: say `oats 50 grams`, then `banana`, then `undo that`, and confirm listening resumes after each action.
- Photo estimate: choose a photo, review rows, edit one item, apply a correction such as `make the portion half the size`, then save only after reviewing.
- Barcode camera: scan a known packaged item, review name/grams/macros, then add it to the meal.
- Barcode manual entry: enter a barcode manually after cancelling camera scan and confirm lookup/review still works.
- Recent/usual meals: save a meal as usual, add it again from usual/recent, then confirm the recalled copy remains editable before save.
- Personal meal memory: save a reviewed meal memory, recall it from Profile or voice using its phrase, and confirm it enters the current meal editor.

## Review And History

- Edit ingredient quantity before save and confirm totals change.
- Delete an ingredient before save and confirm totals change.
- Cancel a draft and confirm no saved history entry is created.
- Save to today and confirm Home and History totals match.
- Edit an existing history ingredient and confirm meal/day totals recalculate.
- Delete an existing history meal and confirm the day totals recalculate.
- Navigate to yesterday and back to today; confirm the selected date does not change where a saved edit belongs.

## Backup And Restore

- Export with real logs, usual meals, meal memories, custom foods, and profile settings.
- Reject invalid JSON, wrong app, wrong schema, and wrong data shapes.
- Import a valid backup and confirm `jot_pre_import_backup_v1` was created before replacing current data.
- Confirm Home, History, Recipes, Profile, theme, country, voice mode, usual meals, and meal memories refresh after import.

## PWA And Cache

- Confirm `npm run test:e2e` includes the PWA cache consistency check.
- Install or refresh the PWA after deploy and confirm the service worker updates without stale script errors.
- Open once online, reload, then briefly test offline app-shell loading.
- Confirm backup controls are still present after an update.

## Mobile UX

- iPhone viewport: confirm bottom nav does not cover Save, Cancel, Add, barcode, or photo buttons.
- Keyboard: edit text/number fields in manual add, photo review, barcode manual entry, history edit, and backup import confirmation without trapping the flow.
- Modals: open and close manual add, edit ingredient, photo estimate, barcode, remember meal, diagnostics, and history edit.
- Touch: hold mic, trigger `touchcancel` by leaving the app or Control Centre, then return and confirm no duplicate ingredient is added.


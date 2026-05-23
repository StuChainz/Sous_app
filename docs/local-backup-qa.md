# Local Backup QA

Use Profile -> Data backup.

## Export with empty app

- Start with a fresh localStorage state.
- Open Profile.
- Tap Export.
- Confirm the JSON file downloads.
- Confirm metadata includes `app: "Jot"`, `schemaVersion: 1`, `source: "local"`, and an ISO `exportedAt`.
- Confirm durable sections exist with empty defaults, especially `sous_log`, `sous_recipes`, `sous_usual_meals`, `sous_meal_memories_v1`, and `userCustomFoods`.
- Confirm excluded transient data is not present, especially `sous_draft`, voice debug flags, barcode cache, and test harness flags.

## Export with user data

- Add or seed at least one logged meal, recipe, recent ingredient, usual meal, meal memory, custom food, custom serving unit, and food override.
- Set profile, bodyweight, theme, voice feedback/input mode, and country.
- Export.
- Confirm the counts summary reflects log days, logged meals, recipes, usual meals, meal memories, and custom foods.
- Confirm the JSON keeps the existing legacy localStorage key names.

## Import valid backup

- Save a valid exported JSON file.
- Change current profile/log/recipe data so the restore is obvious.
- Import the JSON.
- Read the summary in the confirmation dialog.
- Confirm the import.
- Confirm the restored logs, profile, recipes, usual meals, meal memories, custom foods, custom units, food overrides, country, theme, and settings are visible.
- Confirm unrelated localStorage keys are still present.
- Confirm `jot_pre_import_backup_v1` exists and contains the pre-import Jot data.

## Reject invalid JSON

- Try importing a non-JSON file or edited corrupt JSON.
- Confirm Jot shows a failure toast.
- Confirm no durable Jot data changed.
- Confirm no pre-import backup was created for the failed validation.

## Reject wrong app/schema

- Try importing JSON where `app` is not `"Jot"`.
- Try importing JSON where `schemaVersion` is not `1`.
- Confirm both are rejected before writing anything.
- Confirm existing logs/profile remain unchanged.

## Reject wrong data shapes

- Edit a backup so an object section becomes an array, such as `sous_log: []`.
- Edit a backup so an array section becomes an object, such as `sous_recipes: {}`.
- Confirm both are rejected before writing anything.
- Confirm existing logs/profile remain unchanged.

## UI refresh after import

- Import a backup with a visibly different theme, profile name, history day, recipe list, and meal memory list.
- Confirm those views refresh without needing a manual reload.
- Switch between Home, History, Recipes, and Profile to confirm restored data is used.


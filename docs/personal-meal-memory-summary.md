# Personal Meal Memory Summary

## Status

Personal Meal Memory pass 1 is complete on branch `personal-meal-memory-pass-1`.

The branch starts from the hardened codebase ending at:

- `04722a6 docs: summarize hardening pass`

## Commits Made

- `fc37723 docs: plan personal meal memory`
- `6f54e42 feat: add meal memory storage`
- `6bafd2e feat: add deterministic meal memory matching`
- `5a4da27 feat: add remember meal flow`
- `4d8b926 feat: add meal memory management UI`
- `5d7e5a8 feat: recall saved meal memories`
- `23d94d5 feat: support voice recall of meal memories`
- `6fb8322 feat: support basic meal memory transforms`
- `95e50f6 test: add meal memory regression coverage`

## Files Changed

- `docs/personal-meal-memory-plan.md`
- `docs/personal-meal-memory-summary.md`
- `index.html`
- `js/app.js`
- `js/meal-memory.js`
- `js/profile.js`
- `js/speech.js`
- `js/storage.js`
- `sw.js`
- `tests/meal-memory-matching.spec.cjs`
- `tests/meal-memory.spec.cjs`

## What Changed

Sous now has a local, deterministic personal meal memory system.

Users can save the current reviewed meal as a named memory with trigger phrases, manage saved memories from Profile, and recall a memory back into the current meal editor without final-saving the logged meal.

Recalled memories clone stored ingredients and preserve captured nutrition, serving, source, and confidence data where possible. Memory recall updates usage metadata, but the recalled meal remains editable and reviewable.

Voice and text commands now route through deterministic memory matching before generic parser or AI fallback. Matching does not call AI and avoids hijacking normal food quantity entries such as `oats 50g`.

Basic deterministic transforms are supported for recalled memories. When a transform target is missing, ambiguous, or unsupported, Sous recalls the base memory and prompts the user to check the edit instead of silently guessing.

## Data Model

Meal memories are stored in localStorage under:

- `sous_meal_memories_v1`

Each memory uses schema version `1` and includes:

- `id`
- `version`
- `name`
- `section`
- `phrases`
- `ingredients`
- `totals`
- `source`
- `createdAt`
- `updatedAt`
- `useCount`
- `lastUsed`

The storage layer defensively parses persisted JSON, normalizes and dedupes trigger phrases, and deep-clones ingredients so memories do not keep live references to the current meal.

## V1 Commands Supported

Memory recall:

- `my oats`
- `usual oats`
- `log my oats`
- `add my oats`
- `saved oats`
- `same as my oats`
- `usual breakfast`

`usual breakfast` only recalls a memory when the section match is unambiguous.

Memory transforms:

- `usual oats but no banana`
- `usual oats but without banana`
- `usual oats but remove banana`
- `usual oats but half peanut butter`
- `usual oats but double peanut butter`
- `usual oats but make oats 60g`
- `usual oats but set oats to 60g`
- `usual oats but add banana`

Normal food logging remains protected:

- `oats 50g` should continue through normal food and quantity parsing rather than memory recall.

## Tests Run

Passed:

- `npx playwright test tests/meal-memory.spec.cjs tests/meal-memory-matching.spec.cjs`
- `npm test`
- `npm run test:voice:mishearing`

Additional targeted checks were also run during implementation:

- JavaScript syntax checks for changed modules and new tests.
- Existing render safety and voice simulation tests while integrating UI and voice behavior.

## Pass/Fail Status

Pass.

The full npm test suite, voice mishearing matrix, and targeted meal memory regression tests passed before this summary was written.

## Known Limits

- Meal memories are local-only. Clearing browser data, switching browser, or switching device will lose saved memories until backup/export covers this key.
- Existing usual meals are not migrated into personal meal memories.
- The Profile management UI supports use, rename, phrase editing, and delete. Full ingredient editing for a memory is deliberately deferred.
- Transforms are deterministic and intentionally narrow. Ambiguous or missing targets recall the base meal and ask the user to review the edit.
- No AI matching is used for memories.
- Stored memories preserve the nutrition captured when saved. They do not recalculate from future food database changes.
- Section-only recall is conservative and requires an unambiguous memory.

## Recommended Manual Checks

1. Add and edit a meal, open the summary, tap `Remember meal`, and save it as `Oats` with phrases `my oats` and `usual oats`.
2. Open Profile and confirm the memory appears with its section, phrases, ingredient count, kcal, and usage data.
3. Rename the memory, edit phrases, and delete a test memory.
4. Start a new meal and say or type `my oats`; confirm ingredients are copied into the current meal editor and not final-saved.
5. Say or type `my oats but no banana`; confirm the copied meal excludes banana.
6. Say or type `my oats but half peanut butter`; confirm the peanut butter quantity is halved.
7. Say or type `oats 50g`; confirm Sous logs oats through the normal quantity flow rather than recalling a memory.
8. On mobile, check that the Remember modal and Profile memory list remain scrollable, readable, and reachable with the keyboard open.

## Recommended Next Project

Personal pantry and food alias memory

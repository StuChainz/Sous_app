# Personal Meal Memory Plan

Branch: `personal-meal-memory-pass-1`

Base: `hardening-foundation-pass-1` at `04722a6 docs: summarize hardening pass`

## Product Goal

Personal meal memory makes corrected repeat meals first-class. A user can save the current reviewed meal as a named memory with trigger phrases, then recall a cloned editable copy later by voice, text, or UI.

The recalled meal must enter the current meal editor/review flow. It must not final-save a meal automatically, and it must not invent nutrition.

## Existing Code Inspected

- `js/storage.js`
  - Existing usual meals use `sous_usual_meals`.
  - `updateUsualMeals()` stores per-section quick-add meals and now fingerprints quantity/macros.
  - Storage helpers expose global functions directly on `window`.
- `js/app.js`
  - `handleTranscript()` currently routes deterministic usual/history memory commands before parser/AI fallback.
  - `parseDeterministicMemoryCommand()` supports usual/history repeat language.
  - `applyAIRepeatMeal()` and `applyAIModifyMealCopy()` copy usual/history meals without auto-saving.
  - `repeatLastMealForSection()` and `addMealToCurrent()` already add copied ingredients to the live editor.
- `js/parser.js`
  - Usual meal command parsing exists, but this pass should avoid parser changes unless necessary.
  - Quantity helpers such as `gramsFromQuantityText()` and correction targeting helpers are available for transforms.
- `js/speech.js`
  - `addIngredientToMeal()` is the shared mutation path for live meal ingredients.
  - `showSummary()` owns the meal summary/review screen.
  - `saveMealToLog()` final-saves meals and optionally updates usual meals; memory saving must remain separate from this.
- `js/history.js`
  - Saved meals are rendered and edited from `sous_log`; personal memories should not change saved history shape.
- `js/utils/safety.js`
  - `safeJsonParse()` and `escapeHtml()` are available globally after the hardening pass.
- Tests
  - `tests/usual-meals.spec.cjs` covers usual storage behavior.
  - `tests/voice-mishearing-matrix.spec.cjs` and the voice harness expose transcript injection and state snapshots.
  - `tests/voice-mass-regression.spec.js` already has usual/history memory scenarios and AI guardrail coverage.

## Proposed Data Model

Store personal meal memories in a new localStorage key:

```js
sous_meal_memories_v1
```

The stored value should be an array of memory objects:

```js
{
  id: string,
  version: 1,
  name: string,
  section: "breakfast" | "lunch" | "dinner" | "snacks" | "supplements" | null,
  phrases: string[],
  ingredients: MealIngredient[],
  totals: { kcal: number, protein: number, carbs: number, fat: number, fibre: number },
  source: "current-meal" | "history-meal" | "usual-meal" | "manual",
  createdAt: number,
  updatedAt: number,
  useCount: number,
  lastUsed: number | null
}
```

Rules:

- `id` uses `crypto.randomUUID()` when available, falling back to timestamp plus random suffix.
- `version` is always `1` in this pass.
- `phrases` are trimmed, normalized to lowercase matching form, deduped, and empty phrases are rejected.
- `ingredients` are deep-cloned when saved and when recalled.
- `totals` are copied from the current meal if available, otherwise recomputed with `sumMacros()`.
- Defensive reads use `safeJsonParse()` and return `[]` on malformed storage.

## Integration Points

### Storage

Add pure helpers in `js/storage.js`:

- `getMealMemories()`
- `saveMealMemories(memories)`
- `addMealMemory(memory)`
- `updateMealMemory(id, patch)`
- `removeMealMemory(id)`
- `findMealMemoryById(id)`

These should follow the current global-script pattern by assigning each helper to `window`.

### Matching

Add a small deterministic helper module loaded after storage and before `app.js`, likely `js/meal-memory.js`.

Suggested globals:

- `normalizeMealMemoryPhrase(text)`
- `scoreMealMemory(memory, transcript)`
- `findBestMealMemoryMatch(transcript, opts)`
- `parseMealMemoryCommand(transcript)`

This helper is pure in its first checkpoint: no meal mutation and no AI.

### Remember Meal Flow

Add a minimal action on the existing summary screen when the current meal has at least one ingredient:

- Button: `Remember meal`
- Modal or compact inline panel with:
  - memory name
  - section
  - one-or-more comma/newline separated trigger phrases
- Default name from `#sum-meal-name`, else `generateMealNameFromIngredients()`.
- Default phrase from the name, editable.

Saving a memory only stores the memory. It must not call `saveMealToLog()`.

### Management UI

Add a compact section in Profile:

- name
- section
- phrases
- ingredient count
- kcal
- use count / last used
- actions: use, rename/edit phrases, delete

Render all user-controlled values with text APIs or `escapeHtml()`.

### Recall

Add `addMealMemoryToCurrent(memory, options = {})`, probably near `addMealToCurrent()` in `js/app.js`, because it needs the existing editor globals:

- snapshot once before batch mutation
- clone ingredients
- call `addIngredientToMeal()` with `skipSnapshot` and `skipPersist`
- set `currentMealSection` from memory where appropriate
- persist draft
- render current meal and home state
- update `useCount` and `lastUsed`

Recall must not write to `sous_log`.

### Voice/Text

In `handleTranscript()`, route personal memory matching before the existing usual/history deterministic memory command, but only when the command shape is clearly memory-like.

Guardrail:

- `my oats`, `usual oats`, `log my oats` can recall memory.
- `oats 50g` must continue through the normal parser/quantity flow.

Voice debug should include route/source `personal-meal-memory`.

## V1 Commands Supported

Memory recall:

- `my oats`
- `usual oats`
- `log my oats`
- `add my oats`
- `saved oats`
- `same as my oats`
- `usual breakfast` when exactly one strong breakfast memory exists

Transforms:

- `usual oats but no banana`
- `usual oats without banana`
- `usual oats but remove banana`
- `usual oats but half peanut butter`
- `usual oats but double peanut butter`
- `usual oats but make oats 60g`
- `usual oats but add banana`

Transform behavior:

- Apply only when the target item is clear.
- If the target is missing or ambiguous, recall the base meal and prompt/toast the user to review the target.
- Added foods use existing deterministic parser/food resolution paths.

## Deferred Commands

Defer these until the first deterministic version is proven:

- Multi-transform chains beyond simple `but` patterns.
- “Less”, “more”, “a bit”, or other vague quantity changes.
- Replacing ingredients inside memories during recall.
- Editing the saved memory definition by voice.
- Learning trigger phrases automatically from failed matches.
- AI-assisted memory selection.
- Cloud sync, accounts, or cross-device memory.

## Test Plan

Automated:

- Storage:
  - add memory
  - phrase normalization/dedupe
  - update memory
  - delete memory
- Matching:
  - `my oats` matches phrase `my oats`
  - `usual oats` matches phrase `usual oats`
  - ambiguous strong matches return ambiguous/no safe guess
  - `oats 50g` is not treated as memory recall
- UI:
  - create memory from current meal summary
  - memory appears in Profile management
  - delete memory removes it
  - malicious-looking name/phrase renders as text
- Voice/test harness:
  - seed memory, transcript `my oats` recalls it
  - `my oats but no banana` recalls without banana
  - `my oats but half peanut butter` halves the target item

Regression:

- `npm test`
- `npm run test:voice:mishearing`
- targeted new memory tests

Manual:

- Add ingredients, open summary, save memory, confirm meal is not logged.
- Use memory from Profile, confirm ingredients appear in editor.
- Speak/text exact supported phrases.
- Confirm usual meals, repeat last meal, photo estimate, barcode, history, profile, and PWA flows still load.
- Mobile viewport check for summary modal and Profile management area.

Exact voice phrases for manual testing:

- `my oats`
- `usual oats`
- `log my oats`
- `usual oats but no banana`
- `usual oats but half peanut butter`
- `usual oats but make oats 60 grams`
- `usual oats but add banana`
- `oats 50 grams`

## Risks

- Personal memories and existing usual meals have overlapping language. Personal memory routing must be narrow enough that usual/history flows still work.
- `addMealToCurrent()` currently shallow-clones ingredients; memory recall should deep-clone serving/raw fields to avoid live references.
- Summary actions are close to final save controls. The UI must make “Remember meal” visibly separate from “Log meal”.
- Matching trigger phrases can collide. Ambiguity must route to choice/review rather than picking the first match.
- Transform target matching can silently do the wrong thing if substring matching is too loose. V1 should prefer exact or very strong target matches.
- Existing voice tests depend on timing/state recovery. New recall paths need to call existing feedback/resume hooks consistently.
- Since localStorage is the only store, memory corruption or schema changes need defensive parsing and no destructive migration.


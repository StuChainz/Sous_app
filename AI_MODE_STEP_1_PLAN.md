# AI Mode Step 1 Plan

## Goal

Make AI the last resort for meal interpretation.

Before calling AI, Sous should resolve as much as possible locally:

1. Exact food and alias matches
2. Fuzzy local food matching
3. Recent ingredients, custom foods, and known meal memory
4. Simple correction and substitution commands

AI should only run when local tiers fail or return low confidence.

## Step 1 Outcome

Common inputs should not call AI:

```text
2 eggs and toast
fat free greek yogurt
full fat yoghurt
tablespoon olive oil
bread instead of rice
actually chicken thigh not breast
use my usual breakfast
```

Expected behavior:

- Common foods resolve locally.
- Known custom/recent/usual foods resolve locally.
- Basic substitutions resolve locally.
- Ambiguous foods ask a local clarification.
- Unknown foods fall through to the existing resolve/create flow or AI.

## 1. Centralize Local Matching

Create one explicit local resolver, likely in `js/parser.js` or `js/food-data.js`:

```js
function resolveIngredientLocally(text, opts = {}) {
  // returns one of:
  // { status:'matched', food, confidence:'high'|'medium'|'low', reason:'exact|alias|fuzzy|memory' }
  // { status:'ambiguous', options:[...], question:'...' }
  // { status:'unknown' }
}
```

Right now matching is spread across:

- `findFoodByText`
- `getFoodTextMatch`
- parser ambiguity rules
- fallback screens

Step 1 should make the local resolution path explicit and reusable.

## 2. Improve Fuzzy Matching Breadth

Extend local matching so common speech variants resolve without AI:

- plurals: `egg` / `eggs`, `potato` / `potatoes`
- spelling variants: `yogurt` / `yoghurt`
- abbreviations: `evoo`, `pb`, `whey`
- common phrases: `slice of bread`, `two slices toast`, `chicken fillet`
- local names: `courgette` / `zucchini`, `aubergine` / `eggplant`

Prefer adding aliases and normalizer rules over creating a new food database.

## 3. Use Meal Memory Before AI

Check stored user memory before escalating:

- `getRecentIngredients()`
- `getUsualMeals()`
- `getCustomFoods()`

Examples:

```text
my usual breakfast
that protein yoghurt
same oats as yesterday
```

These should first search known meals, recent ingredients, and custom foods.

## 4. Add Simple Substitution Parsing

Support local correction phrases:

```text
X instead of Y
X not Y
replace Y with X
swap Y for X
use X instead
actually X not Y
```

Examples:

```text
bread instead of rice
actually chicken thigh not breast
swap white rice for brown rice
replace chicken breast with chicken thigh
```

Expected behavior:

- If the old item is in the current meal and the replacement is locally known, swap it locally.
- If the replacement is ambiguous, ask the local clarification question.
- If the replacement is unknown, fall through to resolve/create or AI.

## 5. Add Parser Tests

Extend `runParserTests()` in `js/parser.js` with cases like:

```js
'2 eggs and toast',
'one slice of bread',
'fat free greek yogurt',
'full fat yoghurt',
'tablespoon olive oil',
'bread instead of rice',
'actually chicken thigh not breast',
'use my usual breakfast'
```

Use these tests to verify that common inputs stay local and do not trigger AI.

## Suggested Implementation Order

1. Strengthen `normaliseFoodSearchText` and aliases.
2. Add `resolveIngredientLocally()`.
3. Update `findFoodByText()` and `parseSingleSegment()` to use the resolver.
4. Add memory lookup from custom foods, recent ingredients, and usual meals.
5. Add substitution command patterns.
6. Add parser test cases.
7. Tune AI fallback thresholds only after local tiers are working.

## Pass Condition

Step 1 is complete when:

- AI is not called for common known foods.
- AI is not called for recent/custom/usual foods.
- AI is not called for basic substitutions.
- Local ambiguity prompts still work.
- Unknown or genuinely ambiguous inputs can still escalate cleanly.


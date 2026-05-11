# Sous — CLAUDE.md

Voice calorie-tracking PWA. Single-page app, no build step, no framework.

## Running the app

```bash
cd "/Users/stu/Downloads/Sous App/Sous"
python3 -m http.server 8732
# → http://localhost:8732
```

Launch config is at `.claude/launch.json`.

---

## Project layout

```
Sous App/
├── Sous/                        ← live app
│   ├── index.html               ← shell + ALL inline CSS + script tags
│   ├── css/styles.css           ← reference copy only — NOT linked
│   └── js/
│       ├── storage.js           ← localStorage helpers, todayStr()
│       ├── food-data.js         ← FOODS[] database
│       ├── parser.js            ← voice/text → ingredient parser  ⚠ do not touch
│       ├── speech.js            ← log flow, voice rec, modals, saveMealToLog()
│       ├── history.js           ← history tab, charts, delete functions
│       ├── profile.js           ← profile form, TDEE calc, recal modal
│       ├── recipes.js           ← recipe list, cook mode, cook timer
│       ├── app.js               ← navigation, home screen, date nav, selectedLogDate
│       └── theme.js             ← palette switching, localStorage persistence
├── backup_before_design_merge/  ← snapshot before Ember redesign
├── Sous — Voice Calorie Counter.html  ← design prototype (feature reference)
├── Sous — History.html          ← history screen prototype
└── Sous_backup_before_refactor.html   ← original monolithic single-file version
```

---

## CSS architecture — critical rule

**All CSS lives in the inline `<style>` block inside `index.html`.** The external file `css/styles.css` is kept as a readable reference but is **not linked** and never will be.

**Why:** Sandboxed iframes (Claude preview) and iOS WKWebView both block `<link>` tag CSS loading. The inline `<style>` is the only reliable delivery mechanism across all environments.

> Workflow: edit `css/styles.css` if you want a readable source of truth, then sync changes into the `<style>` block in `index.html`. Never add a `<link rel="stylesheet">` tag.

---

## Design token system (Ember)

Tokens are CSS custom properties on `:root`. Never use hardcoded hex values in CSS — always use tokens.

```css
/* Core palette — dark (default) */
--bg:#14110D;  --bg-2:#1A1611;
--card:#1E1913;  --card-2:#251F18;  --raised:#2C2519;
--text:#F2EAD9;  --text-muted:#8A7F6E;  --text-dim:#5C5447;
--border:rgba(242,234,217,0.08);  --border-strong:rgba(242,234,217,0.14);
--accent:#FF6B3D;  --accent-2:#FF8A5C;
--accent-soft:rgba(255,107,61,0.14);  --accent-pale:rgba(255,107,61,0.08);
--accent-glow:rgba(255,107,61,0.35);
--green:#A8C770;  --green-light:rgba(168,199,112,0.16);
--amber:#E8A547;  --amber-light:rgba(232,165,71,0.16);
--red:#E5705B;
--radius:20px;  --radius-sm:12px;  --tab-h:64px;

/* Legacy aliases — keep these, JS inline styles reference them */
--purple:var(--accent);
--purple-light:var(--accent-soft);
--purple-mid:var(--accent-2);
--purple-pale:var(--accent-pale);
```

**Palette switching** via `data-palette` attribute on `<html>`:
- Dark themes: `ember` (default) · `phosphor` (green) · `midnight` (blue)
- Light themes: `ceramic` · `ceramic-phosphor` · `ceramic-midnight`
- Managed by `theme.js` + `js/theme.js`; persisted to `localStorage` key `sous_theme`

---

## Data model

### Log — `localStorage` key `sous_log`
```js
{
  "2026-05-10": {
    meals: [
      {
        id: 1715000000000,        // Date.now()
        name: "Dinner",
        time: "2026-05-10T...",   // ISO string
        ingredients: [
          { id, name, weight, kcal, protein, carbs, fat, fibre, icon }
        ],
        totals: { kcal, protein, carbs, fat, fibre }
      }
    ],
    totals: { kcal, protein, carbs, fat, fibre }  // sum of all meals
  }
}
```

### Profile — `sous_profile`
```js
{ name, targetKcal, targetProtein, targetCarbs, targetFat, currentWeight, height, age, sex, activityLevel }
```

### Weights — `sous_weights`
```js
[{ date: "YYYY-MM-DD", kg: 82.5 }, ...]
```

### Recipes — `sous_recipes`
```js
[{ id, name, ingredients[], steps[], totals{}, created }]
```

---

## Key globals and cross-file dependencies

| Symbol | Defined in | Used in |
|--------|-----------|---------|
| `selectedLogDate` | `app.js` | `speech.js` (`saveMealToLog`), `app.js` (`renderHome`) |
| `localDateStr(d?)` | `app.js` | `app.js`, `speech.js` fallback |
| `meal[]` | `speech.js` | log session ingredient accumulator |
| `nextIngId` | `speech.js` | ingredient identity for edit modal |
| `FOODS[]` | `food-data.js` | `speech.js` (add modal search), `parser.js` |
| `getLog/saveLog` | `storage.js` | `speech.js`, `app.js`, `history.js`, `recipes.js` |
| `getProfile` | `storage.js` | `app.js`, `profile.js`, `history.js` |
| `showToast(msg,ms?)` | `app.js` | all files |
| `switchTab(tab,opts?)` | `app.js` | all files |

`speech.js` reads `selectedLogDate` via global scope — `app.js` must load after `speech.js` in the script tag order. **Current script tag order must be preserved:**
```html
theme.js → storage.js → food-data.js → parser.js →
speech.js → history.js → profile.js → recipes.js → app.js
```

---

## Modal pattern

Both `#add-modal` (add ingredient) and `#edit-modal` (edit ingredient) use inline `display` toggling — **not** CSS class toggling:

```js
document.getElementById('add-modal').style.display = 'flex';   // open
document.getElementById('add-modal').style.display = 'none';   // close
```

The `.modal-overlay` CSS positions them `position:fixed; inset:0` at `z-index:100`.

---

## Log flow (speech.js)

```
startFreshLog()
  └─ showLogScreen('listening')
       ↓ voice / text input
  handleParsed(result)
       ├─ ambiguous → showLogScreen('ambiguous')
       ├─ needs confirm → showLogScreen('confirm')
       └─ high confidence → auto-add → continue listening
  showSummary()
       └─ showLogScreen('summary')
            ├─ tap ingredient → openEditModal(id)
            ├─ + add ingredient → openAddModal()
            └─ Save meal → saveMealToLog() → switchTab('home')
```

`saveMealToLog()` saves to `selectedLogDate` (not always today).

---

## Rules — what not to do

| Rule | Reason |
|------|--------|
| Do not touch `parser.js` | Voice parsing is working; regression risk is high |
| Do not add a `<link rel="stylesheet">` tag | Breaks in sandboxed/WebView environments |
| Do not hardcode hex colours in CSS | Breaks light/dark palette switching |
| Do not change `localStorage` key names | Would wipe existing user data |
| Do not change the log data shape | `history.js`, `speech.js`, `recipes.js` all read the same format |
| Do not merge back to a single HTML file | The refactored structure is intentional |
| Do not redesign screens not in the spec | The Ember spec covers specific screens only |
| Preserve all element IDs | JS wires to IDs; renaming silently breaks handlers |

---

## Iterative editing rule

When making large changes, **save after each logical unit** (one feature, one file) to avoid losing work to context limits. The project has no build step — saving IS deploying.

---

## Design references

Original prototypes are in the project root and are the authoritative source for any feature migrations:

- `Sous — Voice Calorie Counter.html` — main app prototype; contains `selectedLogDate`, `#add-modal`, `#edit-modal`, `FOODS[]` inline, date nav
- `Sous — History.html` — history screen prototype; contains meal delete/confirm UI

When a feature is missing from `Sous/`, **check these files first** before rewriting from scratch.

---

## Product philosophy

Sous is a low-friction nutrition tracking app focused on reducing the effort of calorie/macro tracking while cooking.

Core priorities:
- speed
- trust
- editability
- low friction
- conversational interaction
- graceful fallback to manual control

The app should feel:
- lightweight
- fast
- forgiving
- minimally intrusive

Avoid unnecessary complexity or excessive confirmation prompts.

---

## UX rules

High-confidence matches should auto-add.

Ambiguous matches should request clarification.

Users must always be able to:
- manually edit
- manually delete
- manually add ingredients

Voice interactions should feel:
- fast
- lightweight
- non-annoying

Avoid:
- excessive confirmations
- unnecessary modal chains
- long onboarding
- cluttered UI

Users should always understand:
- what was heard
- what was added
- how to correct mistakes

---

## Parser rules

Avoid ad-hoc regex/string hacks whenever possible.

Prefer reusable helper functions for:
- splitting
- token cleanup
- quantity extraction
- confidence scoring

Parser changes should be:
- incremental
- testable
- isolated

Always preserve:
- correction commands
- typed + voice parity

Before changing parser behaviour, run parser test phrases.

---

## Parser test phrases

Always test at minimum:

- "100g chicken breast and 50g broccoli"
- "100g chicken breast 50g broccoli"
- "10g fat free greek yogurt and 5g full fat greek yogurt"
- "2 eggs and toast"
- "tablespoon olive oil"
- "change chicken breast to chicken thigh"
- "remove broccoli"

---

## Manual add architecture rules

The + Ingredient flow MUST use the same:
- addIngredient()
- meal[]
- totals recalculation
logic as voice input.

Do not create separate meal storage logic.

Do not duplicate totals calculations.

Typed input and voice input must share the same parser pipeline.

---

## Build workflow

Development:
- modular source files

Testing build:
- generate:
  dist/Sous_test_build.html

Testing build should:
- inline CSS
- inline JS
- preserve external CDN links

Do not manually edit dist builds.

Source files are the source of truth.

---

## Git workflow

Always commit:
- before parser changes
- before redesign merges
- before refactors
- before storage/history changes
- after any stable working feature

Prefer small commits.

Use feature branches for risky work:
- redesigns
- parser upgrades
- camera experiments
- storage migrations

Before risky work:
- check git branch
- check git status
- confirm clean rollback point exists

---

## Command usage rules

- Do not run long chains of tiny inspection commands one at a time.
- Batch related terminal checks into a single command where possible.
- Prefer `rg`/`grep` for searching instead of repeated `sed` calls.
- Avoid `sed -i` unless explicitly editing a file.
- Before running more than 5 shell commands in sequence, explain the plan first.
- Before any risky refactor/design merge, confirm the current Git branch and working tree status.

---

## Current implementation priorities

Current focus order:
1. Parser reliability
2. Manual + Ingredient flow
3. Current meal edit/delete
4. History meal edit/delete
5. Date-based logging
6. Retention/usability testing

Do not proactively add:
- camera mode
- cloud sync
- social features
- gamification
- AI coaching
- subscription/paywall systems

unless explicitly requested.

---

## Development philosophy

Prefer:
- simple
- understandable
- debuggable
- incremental

over:
- clever
- overengineered
- highly abstract

Working and maintainable beats theoretically perfect.

Optimize for:
- daily usability
- retention
- trust
- friction reduction

not technical novelty.
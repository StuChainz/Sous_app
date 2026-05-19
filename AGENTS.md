# Sous — AGENTS.md

## Project overview

Sous is a no-framework, voice-first nutrition logging PWA.

The goal is not to be an “AI nutrition app”. The goal is to make food logging extremely fast, low-friction, repeatable, and controllable.

Core product principle:

- Speed over cleverness
- Predictability over automation
- User confirmation over blind AI decisions
- Memory/repeatability over perfect interpretation

AI is an input layer only. It should help convert messy speech/photos into structured meal data, not become the source of truth for nutrition.

---

## Current architecture

Frontend:

- Static PWA
- `index.html`
- Plain JavaScript modules in `/js`
- No framework
- No build step

Backend:

- Node/Express proxy
- Deployed on Render
- Local dev backend commonly runs on `localhost:3001`

Storage:

- `localStorage`
- Meals
- History
- Recent foods
- Recent meals
- Favourites/custom meals where implemented

AI:

- OpenAI Realtime Mini for voice interpretation
- OpenAI Responses API for photo meal estimation
- SpeechRecognition fallback where supported

Audio:

- Cached short text/audio confirmations
- Prebuilt MP3 confirmations where available
- TTS fallback where cached audio is missing
- Silent mode must skip spoken feedback but keep callbacks/state flow working

---

## Development rules

Keep changes small, targeted, and testable.

Do not refactor unrelated code.
Do not introduce frameworks.
Do not add a build system unless explicitly requested.
Do not rewrite architecture unless explicitly requested.
Do not modify `parser.js` unless strictly required for the task.

Prefer working in the smallest relevant file set.

When making changes, preserve existing flows unless the task explicitly says otherwise.

After each task, provide:

1. Files changed
2. What changed
3. Manual test steps
4. Known limitations or edge cases
5. Suggested commit message

---

## Current priority

Voice reliability is the current top priority.

The core experience should feel like:

1. Tap mic once
2. Speak food
3. App processes
4. Tiny confirmation
5. App immediately returns to listening
6. Repeat until finished

No wake word in normal logging mode.

Normal mode is tap-to-start continuous voice logging.

Cooking mode may exist later behind:

```js
localStorage.sous_cooking_mode
```

Do not implement cooking mode unless explicitly requested.

---

## Voice lifecycle rules

Voice session state should be explicit and predictable.

Current state model:

- `idle`
- `listening`
- `processing`
- `speaking`
- `restarting`
- `error`

Rules:

- Never listen while processing.
- Never listen while speaking.
- Never process two transcripts at once.
- Never create duplicate recognisers.
- Guard recogniser `start()` and `stop()` calls.
- After add/correction/failure prompt, restart listening quickly if the session is still active.
- If recognition ends unexpectedly while the session is active, recover safely.
- If processing or speaking gets stuck, recover using watchdog timeouts.
- Silent mode must avoid entering unnecessary speaking state, but callbacks must still run.
- Realtime mode and fallback SpeechRecognition mode must both remain supported.

---

## Mobile voice debug overlay

Enable with:

```js
localStorage.sous_voice_debug_overlay = "true"
```

Overlay should show:

- current voice state
- recogniser active
- session active
- last transcript
- last parser/correction action
- last error
- restart count
- last state transition reason

Must not affect app logic.

---

## Voice parsing priorities

Optimise for real cooking/logging phrases, not abstract grammar.

Examples:

- add some cheddar
- about 30 grams of cheese
- a handful of cheddar
- two slices of bread
- half a cup of milk
- a splash of olive oil
- two eggs
- change that to oat milk
- actually make that 50 grams
- remove the milk
- undo that

Quantity capture is high priority.

Support natural quantities through the existing quantity/serving flow, not a separate AI system.

---

## Voice correction rules

Voice-first correction is critical.

Supported correction commands should include:

- undo that
- remove last item
- remove milk
- actually make that 50 grams
- make that 2 slices
- change cheddar to mozzarella
- clear this meal
- start again

Rules:

- Use existing meal/ingredient update functions.
- Do not create a separate correction data model.
- Preserve quantity when changing ingredient if sensible.
- Keep mic session running after corrections.
- Use short confirmation text only.

---

## Clarification rules

Clarify only when it matters.

Use clarification for meaningful macro differences:

- cheese types
- milk types
- yoghurt types
- bread types
- oils
- meat cuts
- protein powder variants

For low-impact ambiguity:

- choose a sensible default
- allow quick correction

Avoid making the app chatty.

---

## Voice aliases

Use lightweight local aliases only.

Examples:

- semi skimmed -> milk
- grated cheese -> cheddar
- choc protein -> protein powder
- chicken fillet -> chicken breast fillet

Do not build a large synonym engine.

---

## Meal logging model

All logging methods should converge on the same core meal/ingredient path.

Voice, manual add, recent foods, repeat meals, photo estimates, and corrections should all update meals using shared logic where possible.

Avoid duplicate storage paths.

Everything important should remain editable before save.

Photo estimates must never auto-save.

---

## UX rules

Voice detail should appear in UI, not be spoken aloud.

Spoken feedback should stay tiny:

- Added
- Logged
- Updated
- Removed
- Undone
- Cleared
- Try again

Avoid long spoken explanations.

Avoid unnecessary confirmations.

---

## Testing requirements

Minimum voice torture test:

- Add 10 ingredients in a row
- Use no-speech timeout
- Speak during confirmation
- Toggle silent mode
- Use undo/remove/change correction
- Lock and unlock phone
- Background and reopen PWA
- Check debug overlay state/restart count/errors

For layout changes, verify:

- mobile viewport
- scrollability
- keyboard open state
- modals not cut off
- buttons reachable

---

## Local development

Frontend:

```bash
python3 -m http.server 8732
```

Frontend URL:

```text
http://localhost:8732
```

Backend URL:

```text
http://localhost:3001
```

Local AI proxy endpoint:

```text
http://localhost:3001/api/interpret
```

Cloudflare may be used for testing uncommitted changes on phone.

---

## Safety and secrets

Never expose `.env` files publicly.
Do not commit secrets.
Do not log API keys.

---

## File ownership guide

### `index.html`

Owns:

- app shell
- static markup
- inline CSS
- modal containers
- script tags

### `js/speech.js`

Owns:

- voice lifecycle
- recogniser handling
- state transitions
- restart/recovery logic
- voice debug systems

Avoid broad rewrites.

### `js/parser.js`

Owns:

- deterministic parsing
- ingredient parsing
- quantity parsing where implemented

Do not modify unless necessary.

### Meal/state files

Own:

- current meal
- add/update/remove ingredient logic
- history save/edit/delete
- recent foods/meals

Voice/manual/photo should reuse these paths.

---

## What not to prioritise

Do not prioritise:

- multiple voice personas
- advanced audio stitching
- embeddings/vector search
- large AI memory systems
- cooking mode
- full native rewrite
- major redesigns

---

## Current roadmap

1. Stabilise voice lifecycle
2. Improve real-device testing
3. Tighten correction + quantity capture
4. Improve repeat/recent meal UX
5. Improve history editing
6. Add export/import backup
7. Then consider Capacitor/iOS wrapper

---

## Response expectations

When changing voice:
- include exact test phrases

When changing storage:
- include backup risks

When changing UI:
- include mobile checks

Do not invent architecture not present in the repo.
Do not make unrelated cleanup edits.

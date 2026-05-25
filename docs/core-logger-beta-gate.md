# Core Logger Beta Gate v1

Scope: voice and manual logging from starting a meal, adding ingredients, reviewing, and saving. Hold-to-talk is the beta default. Continuous mode remains available, but is not the beta gate unless already stable.

## Automated Gate

- Run `npm test`.
- Run focused voice checks with `npm run test:voice`.
- Confirm `tests/core-logger-beta-gate.spec.cjs` covers:
  - simple food: `banana`
  - grams food: `oats 75g`
  - multi-food review: `oats banana whey`
  - quantity prompt: `oats`, then `50 grams`
  - clarification flow: `cheese`, then `cheddar 30 grams`
  - duplicate transcript prevention: repeated `oats 75`
  - tab leave/session cleanup: page hidden/pagehide during hold-to-talk
  - save transition: saved meal appears once in history and on Home

## Manual Acceptance Checklist

### Setup

- Start frontend at `http://localhost:8732`.
- Use a real iPhone PWA install and Safari tab.
- Enable voice debug overlay with `localStorage.sous_voice_debug_overlay = "true"`.
- Confirm a new install defaults to hold-to-talk.
- Confirm continuous mode can still be selected from the voice input mode control.

### Hold-To-Talk Core Loop

- Hold mic, say `banana`, release, choose default quantity, and confirm the meal row appears once.
- Hold mic, say `oats 75 grams`, release, and confirm Oats appears once at 75g.
- Hold mic, say `oats banana whey`, release, review the three rows, add them, and confirm all three appear once.
- Hold mic, say `oats`, release, answer `50 grams` using hold-to-talk again if prompted, and confirm Oats appears once at 50g.
- Hold mic, say `cheese`, release, answer `cheddar 30 grams` using hold-to-talk again if prompted, and confirm Cheddar appears once at 30g.

### Reliability Checks

- Repeat `oats 75 grams` rapidly in one hold and confirm no duplicate ingredient is committed.
- Hold mic, say nothing, release, and confirm the state returns to idle with no restart loop.
- Start holding mic, lock the phone, unlock, and confirm no recognizer remains active.
- Start holding mic, background the PWA, reopen, and confirm no recognizer remains active.
- Speak during the short confirmation and confirm the app does not process a stale transcript.
- Toggle silent mode and confirm callbacks still complete and the mic returns to idle/listening as expected.

### Review And Save

- Review a meal, edit one ingredient, and confirm totals update before save.
- Save once and confirm Home shows the meal in the correct section.
- Confirm History contains exactly one saved meal.
- Tap Save repeatedly during the logged transition and confirm only one meal is stored.
- Start a new meal after saving and confirm the previous ingredients are cleared.

### Manual Logging

- Start a meal, add a known food manually, review, save, and confirm Home and History update.
- Start a meal, add a custom manual food, review, save, and confirm Home and History update.
- Use the Back button from review to capture, add another manual ingredient, and save.

## Known Manual-Only iPhone/PWA Checks

- Real microphone permission prompt and denial/retry behavior.
- iOS lock/unlock behavior while the mic is held.
- PWA background/reopen behavior while the mic is held.
- Keyboard-open layout while editing quantities in review.
- Silent mode with iOS audio focus changes.

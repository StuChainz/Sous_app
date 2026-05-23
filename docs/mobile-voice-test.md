# Mobile Voice Test Checklist

Use the local server, not a plain static file server:

```bash
npm start
```

Open `http://localhost:3001` on the test device or PWA install.

## Enable Debug Overlay

Run once in Safari dev tools, or save it as a bookmarklet for device testing:

```js
localStorage.setItem("sous_voice_debug_overlay", "true");
location.reload();
```

Disable it:

```js
localStorage.removeItem("sous_voice_debug_overlay");
location.reload();
```

The overlay is hidden for normal users. Tap `copy` to copy the current trace, or `x` to hide it until the next reload.

## Hold-To-Talk Core Pass

1. In Profile -> Voice, select `Hold to talk`.
2. Start a log and hold the mic.
3. Say `100 grams chicken breast`, then release.
4. Confirm the overlay reaches `listening`, then `processing`, then `idle`.
5. Repeat hold-to-talk with `change chicken to rice`.
6. Confirm the last action updates and no duplicate recognizer appears.
7. Hold the mic briefly without speaking, then release.
8. Confirm the state returns to `idle`, no ingredient is added, and no restart loop begins.

## Mode Conflict Pass

1. Select `Continuous`, start voice logging, then immediately switch to `Hold to talk`.
2. Confirm listening stops, session shows inactive, and no late ingredient appears.
3. Select `Hold to talk`, hold the mic, then switch to `Continuous` before releasing.
4. Confirm any late transcript is ignored. In the copied trace, look for `stale_callback_ignored`.
5. Start a fresh hold-to-talk input with `oats 75 grams`.
6. Confirm exactly one ingredient row is added.

## Mobile/PWA Pass

1. Start voice logging.
2. Background the app for 5 seconds, then return.
3. Lock the phone, unlock it, and return.
4. Rotate the phone once if orientation changes are relevant.
5. Confirm the overlay shows a sane state and the mic can be restarted.

## Modes To Cover

1. Hold-to-talk.
2. Continuous.
3. Realtime enabled in continuous mode.
4. Silent feedback mode.
5. Low-confidence or unclear input.
6. Correction after a successful add.

## Report Format

When something breaks, tap `copy` in the overlay and save:

```text
Device:
Browser/PWA:
Mode:
What I said:
Expected:
Actual:
Copied trace:
```

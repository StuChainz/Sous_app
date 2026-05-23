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

## iPhone Hold-To-Talk Lifecycle Pass

1. In Profile -> Voice, select `Hold to talk`.
2. Hold the mic, say `oats 75 grams`, wait for the words to appear, then press the side button or swipe away before lifting your finger.
3. Reopen the PWA and confirm exactly one `Oats` row appears, the state is `idle`, and no automatic restart begins.
4. Hold the mic again without speaking, open Control Centre or trigger an interruption that cancels the touch, then return.
5. Confirm no ingredient is added, the state is `idle`, and the copied trace includes `touch cancel`, `page hidden`, or `pagehide`.
6. Very quickly tap-hold-release the mic.
7. Confirm the state returns to `idle`, no recognizer remains active, and no ingredient is added.
8. Rotate the phone while not holding the mic.
9. Confirm orientation or viewport changes do not start or stop voice by themselves.

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

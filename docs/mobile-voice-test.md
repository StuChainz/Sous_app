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

## Core Pass

1. Start a cooking log and tap the mic.
2. Say `100 grams chicken breast`.
3. Confirm the overlay reaches `listening`, then `processing`, then `restarting` or `listening`.
4. Say a correction, such as `change chicken to rice`.
5. Confirm the last action updates and no duplicate recognizer appears.
6. Wait silently through a no-speech case.
7. Confirm the last error or recovery line updates and listening restarts when expected.

## Mobile/PWA Pass

1. Start voice logging.
2. Background the app for 5 seconds, then return.
3. Lock the phone, unlock it, and return.
4. Rotate the phone once if orientation changes are relevant.
5. Confirm the overlay shows a sane state and the mic can be restarted.

## Modes To Cover

1. Standard voice.
2. Realtime enabled.
3. Silent feedback mode.
4. Low-confidence or unclear input.
5. Correction after a successful add.

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

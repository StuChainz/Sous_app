# Real-Audio Voice Tests

Sous has two voice test modes:

- Fast transcript-injection tests, which call the local voice test harness directly.
- Slower real-audio tests, which launch Chrome with a WAV file wired in as fake microphone input.

Keep both. The fake-mic test exercises more of the browser voice path, but it is intentionally separate from normal unit and regression runs.

## Run

Generate or refresh fixtures first if needed:

```bash
tests/audio-fixtures/scripts/generate-voice-fixtures.sh
```

Run the default `oats.wav` fake-mic test:

```bash
npm run test:voice:real-audio
```

Run with a different fixture:

```bash
SOUS_FAKE_MIC_AUDIO="$PWD/tests/audio-fixtures/wav/50-grams-oats.wav" npm run test:voice:real-audio
```

Treat an unsupported Chrome speech environment as a hard failure instead of a skip:

```bash
SOUS_FAKE_MIC_STRICT=1 npm run test:voice:real-audio
```

The Playwright project launches Chrome with:

```text
--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream
--use-file-for-fake-audio-capture=/absolute/path/to/test.wav
```

## Browser Requirements

- Google Chrome is recommended and configured through Playwright's `channel: "chrome"`.
- The browser must expose `SpeechRecognition` or `webkitSpeechRecognition`.
- The test runs headed by default because browser speech recognition and fake audio are less reliable in headless mode. To try headless locally:

```bash
SOUS_FAKE_MIC_HEADLESS=1 npm run test:voice:real-audio
```

## What It Covers

The current real-audio test:

1. Opens the app.
2. Starts a breakfast meal.
3. Starts a real voice session.
4. Lets Chrome feed `tests/audio-fixtures/wav/oats.wav` through the fake microphone.
5. Waits for a real browser transcript and app result.
6. Checks that the UI does not contradict a recognized transcript with `Didn't catch that`.
7. Checks that a prompt or voice-feedback path was recorded.

The test disables Realtime voice and blocks `/api/**` requests so it does not make OpenAI calls.

## Limitations

- Browser `SpeechRecognition` may not work in every Playwright, Chromium, OS, or CI environment.
- Chrome may be required; bundled Chromium can differ from installed Chrome for speech recognition support.
- If Chrome reports `no-speech` before returning any transcript, the test skips by default because that usually means the local Playwright/Chrome speech environment is not accepting fake-mic audio. Use `SOUS_FAKE_MIC_STRICT=1` when you want that to fail the run.
- These tests are slower and more brittle than transcript-injection tests, so run them separately from normal voice regression tests.
- The audio file is selected when Chrome launches. Use one Playwright run per fixture or set `SOUS_FAKE_MIC_AUDIO` before running.
- Very short WAV files can finish before the recognizer is ready. The included generated fixtures are padded with silence for that reason.
- This does not fully simulate iOS PWA behavior, Safari speech behavior, physical microphones, lock/unlock behavior, or mobile audio-session interruptions.
- Chrome speech recognition itself may depend on Chrome's speech service availability, even though Sous AI endpoints are blocked in this test.

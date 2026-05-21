# Voice Fake-Mic Tests

This suite runs browser-level voice tests by launching Chrome with prerecorded WAV files as microphone input. It is heavier than the transcript-injection tests and exists to catch bugs that only appear in the real browser `SpeechRecognition` lifecycle.

In fake-mic mode the app sets a dev-only `localStorage.sous_voice_fake_mic_test` flag. That skips the normal `getUserMedia()` warmup because Chrome's fake audio file is selected once at browser launch and may start playing as soon as the warmup stream opens.

Chrome may still show the macOS orange microphone indicator while these tests run. That indicator means Chrome opened an audio capture device; it does not prove the physical microphone is being used. The test browser is launched with Chrome's fake device and fake audio-file flags.

## Generate Fixtures

```bash
tests/audio-fixtures/scripts/generate-voice-fixtures.sh
```

The generator uses macOS `say` and `ffmpeg`.

```bash
brew install ffmpeg
```

Optional voice:

```bash
SAY_VOICE=Samantha tests/audio-fixtures/scripts/generate-voice-fixtures.sh
```

Single-utterance fixtures are written to `tests/audio-fixtures/wav/`.

Multi-turn fixtures are written to `tests/audio-fixtures/sequences/`.

## Run

Headless:

```bash
npm run test:voice:fake-mic
```

Headed:

```bash
SOUS_VOICE_HEADED=1 npm run test:voice:fake-mic
```

Useful options:

```bash
SOUS_FAKE_MIC_STRICT=1 npm run test:voice:fake-mic
SOUS_FAKE_MIC_CHANNEL=bundled npm run test:voice:fake-mic
SOUS_FAKE_MIC_TIMEOUT_MS=60000 npm run test:voice:fake-mic
SOUS_FAKE_MIC_RECOGNITION=native npm run test:voice:fake-mic
SOUS_FAKE_MIC_RECOGNITION=shim npm run test:voice:fake-mic
```

The fake-mic suite runs headless by default so automated runs do not steal browser focus. In Playwright watch/UI mode, headed fake-mic windows are still suppressed unless you explicitly set both `SOUS_VOICE_HEADED=1` and `SOUS_VOICE_WATCH=1`.

`SOUS_FAKE_MIC_RECOGNITION=auto` is the default. In auto mode the suite first probes native Chrome `SpeechRecognition` with the fake WAV input. If native Web Speech returns a transcript that matches the fixture phrase, the scenarios use native recognition. If Chrome reports `no-speech`, times out, or returns unrelated text, the suite keeps the fake-mic browser launch but installs a deterministic dev-only `SpeechRecognition` shim that emits the fixture utterances through the recognizer start/result/end callbacks.

## What Shim Mode Means

`SOUS_FAKE_MIC_RECOGNITION=shim` forces the deterministic recognizer shim instead of Chrome's native Web Speech recognizer.

Yes, shim mode bypasses real browser `SpeechRecognition` transcription. The app still constructs and starts a `SpeechRecognition` object, but the test has replaced `window.SpeechRecognition` and `window.webkitSpeechRecognition` with a fake class before the app loads. That fake class calls the same recognizer callbacks the app normally depends on: `onstart`, `onsoundstart`, `onspeechstart`, `onresult`, `onspeechend`, `onsoundend`, `onerror`, and `onend`.

Shim mode does not read transcripts from audio fixture metadata. The expected utterances live in the scenario definitions in `tests/voice-fake-mic.spec.js`, for example `utterances: ['oats', '50 grams']`. The shim consumes that utterance list in order and emits those strings as recognition results. The WAV path is still passed to Chrome through the fake microphone launch flag, but the shim does not inspect the WAV file to decide what text to emit.

Shim mode does not decode audio. It does not prove that Chrome/Web Speech can hear or transcribe the generated WAV. Native mode is the only fake-mic mode that attempts to have Chrome's real Web Speech stack transcribe the fake audio file.

Shim mode still tests these parts of the real Sous voice lifecycle:

- browser page setup with microphone permission enabled
- app voice-session start/stop/restart state
- recognizer construction and guarded `start()`/`stop()` calls
- recognizer callback ordering and async timing
- final transcript routing through the same voice entry point
- parser, clarification, quantity, correction, delete, fallback, and save/finish flows
- silent feedback callbacks and restart-after-feedback behavior
- duplicate transcript/duplicate row prevention
- no-speech and recognizer-end recovery paths emitted through recognizer events
- blocked `/api/**` calls and console/page-error assertions

Shim mode does not test these parts:

- real audio decoding
- real Chrome/Web Speech transcription accuracy
- actual microphone hardware input
- OS audio routing, input device selection, or microphone permission prompts outside the test context
- native Web Speech service timing, confidence scores, alternative hypotheses, or network/service failures
- Safari/iOS PWA speech behavior
- user speech acoustics, accents, background noise, or clipping

Use `SOUS_FAKE_MIC_RECOGNITION=native` when the goal is to prove Chrome can transcribe the generated WAV fixtures. Use `SOUS_FAKE_MIC_RECOGNITION=shim` when the goal is deterministic coverage of Sous' voice lifecycle after recognizer events fire.

## Current Coverage

The fake-mic suite currently has 48 scenarios, grouped in the test summary:

| Group | Coverage |
| --- | --- |
| current single-turn | Existing baseline single-turn phrases, including oats, banana, Greek yoghurt, chicken/sauce, and black beans/soy sauce. |
| current multi-turn | Existing baseline clarification, quantity follow-up, correction, delete, and fast input flows. |
| single ingredient | Cheddar, cheese clarification, and two eggs. |
| quantity parsing | Oats, porridge oats, rice, chicken breast/thighs, Greek yoghurt variants, skimmed milk, olive oil tablespoon, and peanut butter. |
| multi-ingredient | Banana and whey, two eggs and toast, oats/banana/whey, bread/yoghurt, and chicken with unknown sauce. |
| clarification | Chicken sauce resolved with soy sauce, plus black beans/soy sauce selection safety. |
| quantity follow-up | Oats -> 50 grams -> banana. |
| correction/edit | Oats 100 grams -> change oats to 150 grams. |
| delete/remove | Banana pending quantity -> remove banana. |
| finish/save meal | Finish meal opens summary; save meal is handled without API/fallback. |
| bad/unclear input | Red something, actually no, cancel that, and cancel/no after an added item. |
| repeated/fast input | Repeated same utterance twice and add another banana. |
| session lifecycle | Start/stop/start and no-speech after a valid transcript. |

The suite also asserts voice invariants:

- no real `/api/**` calls
- no console/page errors
- no generic "didn't catch that" after an accepted transcript
- no duplicate ingredient rows from one transcript turn
- no stale pending prompt after delete/cancel
- quantity-only follow-ups do not become standalone foods
- correction updates an existing row instead of adding a duplicate
- prompts/fallbacks/clarifications record a voice feedback or silent-skip path
- listening restarts only after the feedback path completes
- final state is not both processing and listening

## Browser Requirements

- Google Chrome is the default launch channel.
- The browser must expose `SpeechRecognition` or `webkitSpeechRecognition`.
- Fake mic launch uses:

```text
--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream
--use-file-for-fake-audio-capture=/absolute/path/to/file.wav%noloop
```

## Multi-Turn Limitation

Chrome selects fake microphone audio at browser launch. The suite does not rely on swapping the microphone file mid-test because that is not a reliable browser-supported flow. Instead, each multi-turn scenario launches a fresh browser with a concatenated WAV fixture containing each utterance separated by short silence.

That keeps app state inside one browser session for the whole scenario while still testing the real recognizer start/result/end/restart path.

## Why Separate From Transcript Injection

Transcript-injection tests are fast, deterministic, and still valuable for parser and app-state coverage. Fake-mic tests are slower and depend on Chrome speech support, but they exercise more of the actual voice session lifecycle:

- microphone permission flow
- real `SpeechRecognition.start()`
- recognition end/restart behavior
- no-speech recovery
- clarification recognizer handoff
- timing between prompts and repeated utterances

## Known Limitations

- Chrome/Web Speech may report `no-speech` in some Playwright, Chromium, OS, or CI environments even when fixtures are valid.
- Chrome/Web Speech may also return unrelated text from the native recognizer. Auto mode treats that as unsupported and falls back to the shim.
- In default auto mode, unsupported native Web Speech fake-mic environments fall back to a recognizer-lifecycle shim. That proves Sous handles recognizer callbacks, prompts, restarts, and feedback timing, but it does not prove Chrome's native speech service transcribed the WAV.
- The suite skips unsupported fake-mic environments by default. Set `SOUS_FAKE_MIC_STRICT=1` to make those cases fail hard.
- It does not use a real microphone.
- It blocks `/api/**`, so it does not make real AI/API calls.
- It still does not fully simulate iPhone PWA behavior, Safari speech behavior, hardware audio routing, lock/unlock, or mobile backgrounding.

# Audio Fixtures

These files support the heavier Playwright fake-microphone voice tests. They are separate from the transcript-injection tests because they launch Chrome with a prerecorded WAV file as microphone input.

## Fixtures

The starting WAV set is:

- `wav/oats.wav`
- `wav/50-grams-oats.wav`
- `wav/banana.wav`
- `wav/greek-yoghurt.wav`
- `wav/cheddar-30-grams.wav`

The `aiff/` files are generated source files from macOS `say`. Chrome should use the converted 44.1 kHz stereo PCM WAV files in `wav/`. The WAV files include leading and trailing silence because Chrome's fake microphone file source can otherwise finish before `SpeechRecognition` is ready.

## Regenerate

```bash
tests/audio-fixtures/scripts/generate-voice-fixtures.sh
```

Optional voice selection:

```bash
SAY_VOICE=Samantha tests/audio-fixtures/scripts/generate-voice-fixtures.sh
```

Requirements:

- macOS `say`
- `ffmpeg`

Install `ffmpeg` with Homebrew if needed:

```bash
brew install ffmpeg
```

The generator currently creates a couple of extra phrases for future voice regression coverage, but the five fixtures above are the first supported fake-mic set.

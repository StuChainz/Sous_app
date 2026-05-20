# Audio Fixtures

These files support the heavier Playwright fake-microphone voice tests. They are separate from the transcript-injection tests because they launch Chrome with a prerecorded WAV file as microphone input.

## Single-Turn Fixtures

The generated single-utterance WAV set includes:

- `wav/oats.wav`
- `wav/50-grams-oats.wav`
- `wav/50-grams.wav`
- `wav/banana.wav`
- `wav/greek-yoghurt.wav`
- `wav/full-fat-50-grams.wav`
- `wav/cheese.wav`
- `wav/cheddar.wav`
- `wav/cheddar-30-grams.wav`
- `wav/chicken-and-sauce.wav`
- `wav/black-beans-and-soy-sauce.wav`
- `wav/oats-banana-whey.wav`
- `wav/bread-yoghurt.wav`
- `wav/soy-source.wav`
- `wav/two-eggs-and-toast.wav`
- `wav/make-that-150-grams.wav`
- `wav/delete-oats.wav`

The `aiff/` files are generated source files from macOS `say`. Chrome should use the converted 44.1 kHz stereo PCM WAV files in `wav/`. The WAV files include leading and trailing silence because Chrome's fake microphone file source can otherwise finish before `SpeechRecognition` is ready.

## Multi-Turn Fixtures

Multi-turn fixtures live in `sequences/`. They are built by concatenating generated utterance WAVs with a short silence gap between turns. Chrome's fake microphone input is selected at browser launch, so concatenated files are the simplest reliable way to exercise multi-turn voice flows without a real microphone.

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

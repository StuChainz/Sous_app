#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
AIFF_DIR="$FIXTURE_DIR/aiff"
WAV_DIR="$FIXTURE_DIR/wav"
SEQUENCE_DIR="$FIXTURE_DIR/sequences"
RAW_DIR="$FIXTURE_DIR/.raw"

if ! command -v say >/dev/null 2>&1; then
  echo "Error: macOS 'say' command is required to generate voice fixtures." >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg is required to convert generated AIFF files to WAV." >&2
  echo "Install it with: brew install ffmpeg" >&2
  exit 1
fi

mkdir -p "$AIFF_DIR" "$WAV_DIR" "$SEQUENCE_DIR" "$RAW_DIR"

say_to_aiff() {
  local name="$1"
  local phrase="$2"
  local aiff_path="$AIFF_DIR/$name.aiff"

  if [[ -n "${SAY_VOICE:-}" ]]; then
    say -v "$SAY_VOICE" -o "$aiff_path" -- "$phrase"
  else
    say -o "$aiff_path" -- "$phrase"
  fi

  printf '%s\n' "$aiff_path"
}

aiff_to_raw_wav() {
  local aiff_path="$1"
  local raw_wav_path="$2"

  ffmpeg -hide_banner -loglevel error -y \
    -i "$aiff_path" \
    -ac 2 \
    -ar 44100 \
    -c:a pcm_s16le \
    "$raw_wav_path"
}

generate_fixture() {
  local name="$1"
  local phrase="$2"
  local aiff_path="$AIFF_DIR/$name.aiff"
  local wav_path="$WAV_DIR/$name.wav"
  local raw_wav_path="$RAW_DIR/$name.raw.wav"

  say_to_aiff "$name" "$phrase" >/dev/null
  aiff_to_raw_wav "$aiff_path" "$raw_wav_path"

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -t 2.5 -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -i "$raw_wav_path" \
    -f lavfi -t 8 -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]" \
    -map "[a]" \
    -ac 2 \
    -ar 44100 \
    -c:a pcm_s16le \
    "$wav_path"

  rm -f "$raw_wav_path"

  printf '%s\n' "$wav_path"
}

generate_sequence() {
  local name="$1"
  shift
  local wav_path="$SEQUENCE_DIR/$name.wav"
  local inputs=()
  local concat_parts=""
  local input_index=0
  local phrase_index=1

  inputs+=("-f" "lavfi" "-t" "2.5" "-i" "anullsrc=channel_layout=stereo:sample_rate=44100")
  concat_parts+="[$input_index:a]"
  input_index=$((input_index + 1))

  for phrase in "$@"; do
    local part_name="$name-$phrase_index"
    local aiff_path="$AIFF_DIR/$part_name.aiff"
    local raw_wav_path="$RAW_DIR/$part_name.raw.wav"

    say_to_aiff "$part_name" "$phrase" >/dev/null
    aiff_to_raw_wav "$aiff_path" "$raw_wav_path"

    inputs+=("-i" "$raw_wav_path")
    concat_parts+="[$input_index:a]"
    input_index=$((input_index + 1))

    if [[ "$phrase_index" -lt "$#" ]]; then
      inputs+=("-f" "lavfi" "-t" "${SOUS_FAKE_MIC_TURN_GAP:-4}" "-i" "anullsrc=channel_layout=stereo:sample_rate=44100")
      concat_parts+="[$input_index:a]"
      input_index=$((input_index + 1))
    fi

    phrase_index=$((phrase_index + 1))
  done

  inputs+=("-f" "lavfi" "-t" "8" "-i" "anullsrc=channel_layout=stereo:sample_rate=44100")
  concat_parts+="[$input_index:a]"
  input_index=$((input_index + 1))

  ffmpeg -hide_banner -loglevel error -y \
    "${inputs[@]}" \
    -filter_complex "${concat_parts}concat=n=${input_index}:v=0:a=1[a]" \
    -map "[a]" \
    -ac 2 \
    -ar 44100 \
    -c:a pcm_s16le \
    "$wav_path"

  rm -f "$RAW_DIR"/"$name"-*.raw.wav

  printf '%s\n' "$wav_path"
}

echo "Generated WAV fixtures:"
generate_fixture "oats" "oats"
generate_fixture "oats-100-grams" "oats 100 grams"
generate_fixture "oats-50-grams" "oats 50 grams"
generate_fixture "50-grams-oats" "50 grams oats"
generate_fixture "50-grams" "50 grams"
generate_fixture "banana" "banana"
generate_fixture "greek-yoghurt" "Greek yoghurt"
generate_fixture "full-fat-50-grams" "full fat 50 grams"
generate_fixture "cheese" "cheese"
generate_fixture "cheddar" "cheddar"
generate_fixture "cheddar-30-grams" "cheddar 30 grams"
generate_fixture "chicken-and-sauce" "chicken and sauce"
generate_fixture "black-beans-and-soy-sauce" "black beans and soy sauce"
generate_fixture "oats-banana-whey" "oats banana whey"
generate_fixture "bread-yoghurt" "bread yoghurt"
generate_fixture "soy-source" "soy source"
generate_fixture "two-eggs-and-toast" "two eggs and toast"
generate_fixture "make-that-150-grams" "make that 150 grams"
generate_fixture "delete-oats" "delete oats"

echo "Generated multi-turn WAV fixtures:"
generate_sequence "cheese-then-cheddar" "cheese" "cheddar"
generate_sequence "cheese-then-cheddar-30-grams" "cheese" "cheddar 30 grams"
generate_sequence "oats-then-50-grams" "oats" "50 grams"
generate_sequence "greek-yoghurt-then-full-fat-50-grams" "Greek yoghurt" "full fat 50 grams"
generate_sequence "oats-100-then-make-that-150-grams" "oats 100 grams" "make that 150 grams"
generate_sequence "oats-50-then-delete-oats" "oats 50 grams" "delete oats"
generate_sequence "oats-then-50-grams-then-banana" "oats" "50 grams" "banana"
generate_sequence "cheese-then-banana" "cheese" "banana"

#!/usr/bin/env bash
set -euo pipefail

LINGOLOOP_HOME="${LINGOLOOP_HOME:-$HOME/.lingoloop}"
MODEL_DIR="${LINGOLOOP_MODEL_DIR:-$LINGOLOOP_HOME/models}"
MODEL_FILE="$MODEL_DIR/ggml-base.bin"

mkdir -p "$MODEL_DIR" "$LINGOLOOP_HOME/logs" "$LINGOLOOP_HOME/tmp"

echo "LingoLoop whisper.cpp setup"
echo "Home: $LINGOLOOP_HOME"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg was not found on PATH. Install FFmpeg or place a static binary at ./bin/ffmpeg."
else
  ffmpeg -version | head -n 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe was not found on PATH. Install FFmpeg or place a static binary at ./bin/ffprobe."
else
  ffprobe -version | head -n 1
fi

if ! command -v whisper-cli >/dev/null 2>&1 && [ ! -x "./bin/whisper-cli" ]; then
  echo "whisper-cli was not found. Build whisper.cpp with Metal and place whisper-cli at ./bin/whisper-cli or on PATH."
else
  echo "whisper-cli found."
fi

if [ ! -f "$MODEL_FILE" ]; then
  echo "Model missing: $MODEL_FILE"
  echo "Download ggml-base.bin from the whisper.cpp model release and place it there."
else
  echo "Model found: $MODEL_FILE"
fi

echo "Run the app and open Settings -> Audio & Recognition to re-check pipeline health."

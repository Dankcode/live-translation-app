#!/usr/bin/env bash
#
# Compatibility helper for older project instructions.
#
# LingoLoop now runs Whisper through the local Node server, so no Xcode,
# Homebrew, CMake, or whisper-cli installation is needed. FFmpeg/ffprobe are
# packaged with npm, and the selected model downloads on its first use.

set -euo pipefail

if [ ! -d "node_modules/ffmpeg-static" ] || [ ! -d "node_modules/@ffprobe-installer/ffprobe" ]; then
  echo "LingoLoop dependencies are missing. Run: npm install"
  exit 1
fi

echo "LingoLoop local transcription is ready to initialize."
echo "No Xcode, Homebrew, CMake, or whisper-cli setup is required."
echo "Import a video in the app; the selected Whisper model downloads once and is cached locally."

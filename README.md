# LingoLoop

`LingoLoop` is a Next.js and Electron project for watching imported video with clearer dual-language subtitles, loop-first study tools, sidecar subtitle parsing, batch translation, and a local transcription pipeline.

The current implementation follows the newer `LINGOLOOP_PLAN.md` direction while keeping the working `dual-live-translations` codebase:

- Import video or audio and preview it in a subtitle-focused viewer.
- Try a bundled smoke-test path that loads sample cues while the local whisper.cpp assets are being prepared.
- Import `.srt`, `.vtt`, `.ass`, or `.ssa` sidecar subtitles.
- Display original text, reading text, and translated text with legible cinema, boxed, and minimal subtitle styles.
- Surface the planned FFmpeg + whisper.cpp local transcription health checks and setup/repair path.
- Mine active subtitle loops into built-in FSRS-style review cards and expose Study-mode loop tools.
- Simulate the planned fast/balanced/best ASR pipeline with audio cleanup controls, diarization, mixed-language mode, batching, concurrency, and cache settings.
- Load batch manifests from `.json`, `.csv`, or `.txt` and track resumable queue progress.
- Cover or blur burned-in subtitle regions with a live preview mask that maps to export filter metadata.
- Export dual SRT, styled ASS, project JSON, and batch report CSV files.

## Local transcription setup

The LingoLoop plan moves primary transcription out of the browser and into a local FFmpeg + `whisper.cpp` worker. Run:

```bash
sh scripts/setup-whisper.sh
```

Then place `whisper-cli`, `ffmpeg`, `ffprobe`, and `~/.lingoloop/models/ggml-base.bin` where the setup output expects them. The Audio & Recognition settings panel reports readiness.

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
```

# LingoLoop

`LingoLoop` is a Next.js and Electron project for watching imported video with clearer dual-language subtitles, loop-first study tools, sidecar subtitle parsing, batch translation, and a local transcription pipeline.

The current implementation follows the newer `LINGOLOOP_PLAN.md` direction while keeping the working `dual-live-translations` codebase:

- Import video or audio and preview it in a subtitle-focused viewer.
- Run a local server-side Whisper path that handles imported MP4 audio with bundled FFmpeg tools.
- Import `.srt`, `.vtt`, `.ass`, or `.ssa` sidecar subtitles.
- Display original text, reading text, and translated text with legible cinema, boxed, and minimal subtitle styles.
- Surface local FFmpeg, ffprobe, recognizer, and model health checks.
- Mine active subtitle loops into built-in FSRS-style review cards and expose Study-mode loop tools.
- Simulate the planned fast/balanced/best ASR pipeline with audio cleanup controls, diarization, mixed-language mode, batching, concurrency, and cache settings.
- Load batch manifests from `.json`, `.csv`, or `.txt` and track resumable queue progress.
- Cover or blur burned-in subtitle regions with a live preview mask that maps to export filter metadata.
- Export dual SRT, styled ASS, project JSON, and batch report CSV files.

## Local transcription setup

LingoLoop keeps transcription out of the browser and in the local Node server. No Xcode, Homebrew, CMake, compiler, or `whisper-cli` installation is required. `npm install` packages FFmpeg and ffprobe with the app:

```bash
npm install
```

On the first transcription, the chosen Whisper model downloads to `~/.lingoloop/models/transformers`; later runs use that local cache. Fast uses Whisper Tiny, Balanced uses Whisper Base, and Best uses Whisper Small. The Audio & Recognition settings panel reports readiness and the "Try sample" button exercises the same `/api/transcribe` path as an imported file.

## Debugging an imported MP4

An imported media file is never paired with the demo subtitles. The normal path is:

1. Select the MP4. The browser keeps the real `File`; Electron can instead pass its desktop path.
2. The app checks the selected engine. Local mode requires `ffmpeg`, `ffprobe`, the Node-side recognizer, and the selected Whisper model or permission to download it once.
3. The MP4 is sent to `/api/transcribe`: as a multipart upload in the browser or as an absolute path in Electron.
4. The local worker probes streams with `ffprobe`, extracts a mono 16 kHz WAV with FFmpeg, and runs Whisper in the Node server.
5. Whisper timestamp segments become timed source-language cues.
6. Those cues are translated, then rendered in the player and exported as subtitle files.

The configuration screen shows this exact trace for each imported file. Local jobs write newline-delimited JSON logs to `~/.lingoloop/logs/transcribe-*.log`; the trace displays the exact log path after a job starts or fails. Browser-side Whisper is intentionally disabled for imported media because it cannot reliably decode production MP4/MKV audio.

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
```

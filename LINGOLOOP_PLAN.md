# LingoLoop — Dual-Subtitle Video Studio
### Product & Implementation Plan (new app, built on the `dual-live-translations` codebase)

> This is a **fresh product plan**, not a rewrite of `DUAL_SUB_STUDIO_PLAN.md`. It reuses the proven bones of the existing app (Next.js + Electron shell, the FFmpeg/`ffprobe` worker idea, the dual-subtitle renderer, the translation libs in `src/lib/`) but reframes the product around a different center of gravity — **loop-based active learning + a fixed local transcription pipeline** — and adds a batch of features the current plan does not cover. Sections 5–7 are the delta vs. the old plan; sections 8–10 are the three requested lenses (`/design-system`, `/debug`, `/code-review`); section 11 is the phased build order.

---

## 1. The idea in one paragraph

**LingoLoop** takes any video (`.mp4`, `.mkv`, `.mov`, `.webm`, …) with **existing subtitles or none at all** and produces a **dual-language subtitle experience** — original text on one line, your language on the next — that you can watch for leisure or drill for study. If subtitles already exist (embedded or sidecar `.srt`/`.vtt`/`.ass`), we parse and translate them. If they don't, we **transcribe locally with `whisper.cpp`** (the piece that is currently broken), then translate. The differentiator versus the old plan is the **loop**: every line is a first-class, replayable, mineable unit — you can A–B repeat it, shadow it, quiz on it, and it feeds a built-in spaced-repetition scheduler — so the same file serves a Saturday-night viewer and a serious learner without being two different apps.

---

## 2. What we keep from the current app (reuse, don't rebuild)

| Existing asset | Reuse as | Notes |
|---|---|---|
| Next.js 16 + Electron shell (`main/main.js`, `src/app/`) | App frame + windows | Keep the renderer/main split; add a media-worker child process. |
| `src/lib/translator.js`, `src/lib/gemini.js` | Translation providers | Wrap behind one `translation` interface; keep batch + refine. |
| `src/lib/usage-tracker.js` | Quota/caching discipline | Reuse the hash-key + disk-cache convention for translation and ASR caches. |
| Dual-subtitle renderer + `.ass`/`.srt` export (from old plan §7/§8) | Player + export | Token-driven so preview == export. |
| `ffprobe`/FFmpeg worker concept (old plan §5) | Media worker | We make it real and add the whisper.cpp call. |
| Cloud/native STT (`api/stt`, `google-stt.js`, `SpeechHost`) | Optional fallback only | Demoted from primary path to "hard audio / no-GPU" fallback. |

**Replaced / demoted:** the browser-side `@xenova/transformers` Whisper path in `src/lib/transcribe.js` (see §5 — this is the "transcription doesn't work" root cause).

---

## 3. Target users & the two modes

- **Watch mode (leisure):** import → auto-config → play with dual subs. Zero friction, no study chrome. Think foreign film night, K-drama, anime, travel vlogs.
- **Study mode (education):** same import, but the loop tools, dictionary, grammar breakdown, quizzes, and SRS review are visible. Classrooms, self-study, language schools.

Mode is a **preset of defaults**, not a separate app — one toggle changes which panels are visible and which quality tier runs.

---

## 4. Feature set

### 4.1 Core (must-have)
- Import by drag-drop/picker; probe container, streams, duration, and existing subtitle tracks via `ffprobe`.
- Three source paths: **embedded subs**, **sidecar subs**, or **transcribe (no subs)** via local whisper.cpp.
- Source-language auto-detect (user-confirmable) + one or more target languages.
- Dual-subtitle rendering in-player with per-cue timing preserved.
- Export: burned-in hard-sub MP4, soft dual-sub `.srt`/`.ass`, or muxed `.mkv` with selectable tracks.
- Resumable job queue with progress + cancel.

### 4.2 New features — popular elsewhere, **not** in the current plan
These are the additive ideas the brief asked for. (The old plan already covers clickable dictionary, furigana/pinyin, karaoke highlighting, Anki export, A–B loop, speed control, hide-a-language test, interactive transcript, re-sync slider, per-cue re-translate, multi-target, style presets, frequency coloring, chapters, batch mode, diarization, study-pack export — so those are assumed and **not** repeated here.)

1. **On-screen text translation (frame OCR).** Translate *signs, captions, and hardcoded text inside the picture*, not just speech — sample frames, OCR with Tesseract/PaddleOCR, translate, and overlay. This is the single biggest "no one else in this codebase does it" feature; huge for travel, gaming, and documentary content. (Language-learning apps translate audio; almost none translate the *image*.)
2. **Built-in spaced-repetition (FSRS), not just Anki export.** A native review scheduler using the modern **FSRS** algorithm. Mined lines/words become cards reviewed *inside* LingoLoop with the original audio snippet + screenshot; Anki export stays as an option, not the only home.
3. **Pronunciation / shadowing scorer.** Record yourself repeating the current line; forced-align your audio (WhisperX/`whisper.cpp` alignment) and score per-phoneme timing/accuracy against the native track (ELSA/Speechling pattern). Turns passive watching into speaking practice.
4. **LLM grammar breakdown + "explain this line."** One click parses the current sentence: tokenization, part-of-speech, particle/conjugation notes, literal vs. idiomatic gloss, and an "explain the joke/reference/slang" button. Uses the existing Gemini lib with a structured prompt.
5. **CEFR difficulty rating + a recommender.** Estimate each video's difficulty (A1–C2) from vocabulary frequency + speech rate, show it as a badge, and recommend "what to watch next" at the right level (comprehensible-input pedagogy). Builds a personal library graph over time.
6. **Auto-generated quizzes from the dialogue.** Cloze (fill-in-the-blank), listening-dictation, and multiple-choice questions generated per scene/chapter from the transcript — instant practice with no authoring.
7. **Lyrics / music mode.** Detect musical segments and render synced dual **lyrics** (LRC-style word timing). Karaoke for language learners; also just fun.
8. **Read-aloud / TTS dual audio (opt-in).** Generate a target-language TTS voice track of the translation for eyes-free listening or accessibility. Clearly labeled synthetic; no voice cloning of the original speaker.
9. **URL import via `yt-dlp`.** Paste a link to a video you have the right to use; fetch and run the same pipeline. (Gated behind a rights acknowledgement — see §10 legal.)
10. **Per-series consistency glossary.** Auto-build a character/entity glossary across episodes so names and recurring terms translate consistently for a whole show, not per-file.
11. **SDH / accessibility captions.** Optionally emit sound-event tags (`[music]`, `[applause]`, `[door slams]`) and speaker labels for deaf/HoH viewers — a genuinely different output than a learner track.
12. **Progress + gamification dashboard.** Watch streaks, words-seen vs. words-known heatmap across a series, XP for review sessions. Light-touch, dismissible in Watch mode.
13. **Companion mini-window / PiP.** A floating always-on-top dual-sub bar you can park under any other video player for content we can't import directly.
14. **Collaborative "class session" export.** Teacher exports a study pack (video ref + cue edits + quiz set + glossary) as a single sharable project file students open locally.

### 4.3 Out of scope (v1)
Real-time live overlay (that's the original overlay app's job), cloud accounts/multi-user sync, mobile-native apps, DRM-protected stream capture, full timeline video editing, and voice-cloning the original speaker.

---

## 5. Fixing transcription — the whisper.cpp pipeline (the currently-broken piece)

### 5.1 Why the current transcription fails (root cause)
`src/lib/transcribe.js` runs Whisper **in the browser** via `@xenova/transformers`, decoding audio with `AudioContext.decodeAudioData`. This breaks for real-world video for several compounding reasons:

- **`decodeAudioData` can't reliably decode MP4/MKV audio.** Browsers decode *some* codecs (often AAC in MP4) but frequently fail on AC-3, E-AC-3, DTS, Opus-in-MKV, or multi-track audio — throwing the "no audio track or unsupported codec" error the module already anticipates. Container/codec coverage in `decodeAudioData` is narrow and platform-dependent.
- **CDN model fetch is fragile.** `env.allowLocalModels = false` forces a multi-hundred-MB weight download from a CDN on first run; offline use, slow links, or CSP in Electron make this hang or fail silently.
- **Memory + speed.** Decoding a full film to one `Float32Array` in renderer memory and running `whisper-base` on CPU/WASM is slow and OOM-prone for long files — no amount of chunk/stride tuning saves that in-browser.
- **No FFmpeg.** The browser has no `ffmpeg` to normalize weird inputs, so anything `decodeAudioData` rejects has no fallback.

**Conclusion:** transcription must move **out of the browser** into the media worker, where FFmpeg guarantees clean 16 kHz mono WAV and `whisper.cpp` runs natively with Metal acceleration on the user's Mac.

### 5.2 The fixed architecture
```
Renderer (Next.js UI)
   │  job spec (file path, langs, quality)
   ▼
Electron main ──spawn──► Media Worker (Node child process)
                              │ 1. ffprobe  → streams/duration/subs
                              │ 2. ffmpeg   → 16kHz mono WAV (+ optional cleanup)
                              │ 3. whisper.cpp (whisper-cli) → JSON w/ word timestamps
                              │ 4. parse → cues[]  → translation lib → dual cues
                              ▼
                         events: progress / partial cues / done / error
```
Everything is passed as **argv arrays to `spawn` (no shell)** — see §10.

### 5.3 Binaries & setup (macOS-first)
- **FFmpeg / ffprobe** — bundle a static universal build under `bin/`, fall back to system `ffmpeg` on `PATH`. Startup health check: `ffmpeg -version`.
- **whisper.cpp** — build/ship the `whisper-cli` binary (formerly `main`) with **Metal** enabled for Apple-Silicon GPU acceleration. Ship a GGUF model (`ggml-base.bin` default; offer `small`/`medium`/`large-v3` downloads for the "Best" tier). Store under `~/.lingoloop/models/`.
- **First-run setup script** (`scripts/setup-whisper.sh`): detect arch, download the model, verify checksum, and run a smoke test on the bundled sample (below). Surface a single "Repair transcription" button in the UI that re-runs it.

### 5.4 Exact processing commands (reference)
```bash
# 1. Probe
ffprobe -v error -print_format json -show_format -show_streams INPUT

# 2. Extract clean mono 16k WAV (whisper.cpp's required input)
ffmpeg -i INPUT -vn -ac 1 -ar 16000 -c:a pcm_s16le -f wav OUT.wav
#   optional cleanup for noisy audio (toggle in Study/Best tier):
#   -af "highpass=f=80,lowpass=f=8000,afftdn,loudnorm"

# 3. Transcribe with word-level timestamps → JSON
whisper-cli -m ~/.lingoloop/models/ggml-base.bin \
            -f OUT.wav -l auto -oj -ml 1 --output-file OUT
#   -l auto = auto-detect language; -oj = JSON out; -ml 1 = max-len for word timing
```
Parse `OUT.json` into the same cue shape the renderer already expects (`{id, start, end, original}`), then batch-translate. Word timestamps power the karaoke, shadowing, and flashcard-audio features.

### 5.5 Default sample video (for testing the fixed path)
Bundle a short, **Creative-Commons, speech-bearing** clip so transcription is testable out-of-the-box with no user file:
- **Primary:** a ~30–60 s excerpt of **"Tears of Steel"** (Blender Foundation, **CC-BY 3.0**) — clear English dialogue, ideal for ASR smoke-testing. Attribute Blender Foundation / mango.blender.org in an `ATTRIBUTION.md`.
- **Fallback:** **"Big Buck Bunny"** (CC-BY 3.0) if a smaller/no-license-text asset is preferred (less dialogue).
- Place under `public/samples/`; wire a **"Try the sample"** button on the import screen that loads it and runs the full probe → WAV → whisper.cpp → dual-sub path. This doubles as the setup smoke test and a first-run demo.

### 5.6 Quality tiers (map to the old plan's Fast/Balanced/Best)
- **Fast** — `ggml-base`, VAD trim, no audio cleanup. Leisure default.
- **Balanced** — `ggml-small/medium` + denoise + loudnorm.
- **Best** — `large-v3` + vocal isolation (Demucs) + VAD + word alignment + diarization (via the fallback WhisperX path). Study/hard-audio default.

---

## 6. The subtitle pipeline (end to end)
1. **Probe** — `ffprobe` reports container, audio codecs, and existing subtitle streams (text vs. bitmap).
2. **Acquire base cues** — pick the source path:
   - *Embedded text subs* → extract with FFmpeg (`-map 0:s:0 out.srt`).
   - *Sidecar* → parse `.srt`/`.vtt`/`.ass`/`.ssa`; sniff charset and transcode to UTF-8 (Shift-JIS/GBK/Windows-1251 → UTF-8).
   - *Bitmap subs* (PGS/VOBSUB) → can't text-extract; offer OCR or the transcription path.
   - *No subs* → the whisper.cpp path (§5).
3. **Confirm source language** — auto-detect with a confidence score; confirm before translating if low.
4. **Translate** — batch (~50 cues/request) through the existing translation lib, bounded concurrency + backoff, content-hash cache. Assert `out.length === in.length` so subtitles can't shift.
5. **Enrich (Study mode)** — readings, dictionary, grammar breakdown, frequency/CEFR tagging, quiz + SRS card generation.
6. **Render / export** — live dual-sub player; export burned-in MP4, soft `.srt`/`.ass`, or muxed `.mkv`. Soft-sub mux uses `-c copy` (no re-encode).

---

## 7. Data model (sketch)
```
Project { id, mediaPath, container, duration, sourceLang, targetLangs[],
          mode: 'watch'|'study', quality: 'fast'|'balanced'|'best',
          cues: Cue[], glossaryId, createdAt }
Cue     { id, start, end, speaker?, original, reading?, translations{lang:text},
          words[]{text,start,end,conf}, confidence, edited:boolean }
Card    { id, cueId, front, back, audioClip, screenshot, fsrs{due,stability,difficulty,reps} }
Glossary{ id, seriesKey, entries[]{term, reading, gloss, lockedTranslation} }
Job     { id, projectId, stage, progress, status, logPath }
```
Persist to `~/.lingoloop/` (projects, caches, models, logs) — mirrors the existing app's disk-cache convention.

---

## 8. Design system (`/design-system` lens)

**Principle:** the video and its two subtitle lines are the only always-present elements; everything else is transient and token-driven so *what you see equals what you export*.

**Tokens (single source for UI + `.ass` export):**
- Surface: `--surface`, `--surface-raised`, `--text-primary`, `--text-muted`, `--accent`.
- Subtitles: `--sub-original`, `--sub-translation`, `--sub-outline`, `--sub-box`, `--sub-size`, `--reading-size` (furigana/pinyin).
- Learning scales: `--freq-1…5` (frequency coloring) and `--cefr-a1…c2` (difficulty), Study-mode only.
- Motion: `--fast 120ms` cue fades, `--base 200ms` panel transitions — nothing that pulls the eye off the video.
- Type: one quiet UI family + a CJK-capable subtitle family (Noto Sans / Noto Sans CJK).

**Three-screen flow (the whole app):** Import → Configure (auto-filled, advanced collapsed) → Play/Study. Settings live in tabs, never on the main surface.

**Components (each with variants + states):**
`MediaDropzone` (idle/drag-over/invalid/loading) · `ModeToggle` (Watch/Study) · `LanguageChip` (detected/confirmed/override) · `AutoHideControlBar` · `DualSubtitleRenderer` (both/original-only/translation-only/hidden-for-test) · `WordChip` (default/hover-def/saved; freq-colored) · `LoopControl` (A–B set/looping) · `TranscriptPanel` (active-line highlight, click-to-seek) · `QuizCard` · `ReviewSession` (FSRS) · `OcrOverlay` (frame-text translation) · `JobQueueItem` (queued/running/done/error/canceled) · `ExportDialog`.

**Consistency & a11y rules:** tokens only (no hardcoded colors/sizes); the subtitle token set feeds both renderer and `.ass` generator; every control has hover/focus/disabled/loading states; icon-only buttons carry accessible labels. A dedicated `accessibility-review` pass must check **subtitle contrast over arbitrary video** (why the outline/box tokens exist), keyboard access to the auto-hiding bar, and 44px touch targets. New surfaces (quizzes, OCR overlay, review session) inherit the same tokens — no bespoke styling.

---

## 9. Failure modes & debugging (`/debug` lens)

Every job writes a structured log to `~/.lingoloop/logs/<jobId>.log` capturing the exact `ffmpeg`/`ffprobe`/`whisper-cli` argv, exit codes, stderr tails, and stage timings — so any bug report reproduces from the log alone. **Never show a raw FFmpeg stack dump;** map known stderr signatures to friendly messages, keep the raw log one click away.

| Failure mode | Detection | Handling |
|---|---|---|
| FFmpeg/whisper binary missing or wrong arch | Startup `-version` health check | "Repair transcription" prompt; fall back to system FFmpeg / re-download model |
| whisper.cpp model file missing/corrupt | Checksum mismatch on load | Re-run setup script; block transcribe with clear message |
| Unsupported/rare audio codec | ffprobe unknown codec | FFmpeg already normalizes to WAV; if it still fails, transcode-to-intermediate first |
| Bitmap subs (PGS/VOBSUB) | subtitle codec is `hdmv_pgs`/`dvd_subtitle` | Explain OCR needed; offer transcription path |
| Whisper too slow / no GPU | Elapsed ≫ duration; Metal unavailable | Auto-downgrade model, chunk audio, or offer cloud/native STT fallback |
| Translation rate-limit / network drop | HTTP status + retries | Exponential backoff, cache partials, resume — never restart from zero |
| Timing drift subs vs. audio | User-visible or auto-detected | Manual re-sync slider + auto-align attempt |
| Wrong detected source language | Low confidence score | Confirm dialog before translating; one-click re-detect |
| Mojibake sidecar subs | Charset sniff | Transcode to UTF-8 |
| Frame-OCR garbage on busy scenes | Low OCR confidence | Suppress overlay below threshold; let user force-sample a frame |
| Corrupt/partial input | ffprobe error / zero duration | Reject early with specifics |
| User cancels mid-job | Cancel signal | Kill child cleanly, remove temp files, keep project consistent |
| Disk full during export | Pre-flight free-space vs. estimate | Warn before starting; fail gracefully mid-way |

**Repro strategy:** because transcription is the historically broken area, the sample-video smoke test (§5.5) runs on every app update and after "Repair transcription," so regressions surface immediately, not in the field.

---

## 10. Code quality & review standards (`/code-review` lens)

**Security & safety**
- **Never build FFmpeg/whisper commands via string concatenation of user input.** Always pass argv as an **array to `spawn` (no shell)** so filenames with spaces/quotes/`;`/`$()` can't inject. Highest-risk area in the whole app.
- Validate/normalize all file paths; confine writes to the project temp dir and the user-chosen export location.
- Treat subtitle files and OCR/`yt-dlp` inputs as untrusted: bound sizes, time-box parsing, verify URLs, and gate URL import behind a rights acknowledgement.
- Keep API keys in the existing config store, never in logs (reuse the usage-tracker's key masking).

**Correctness & robustness**
- Every external call (FFmpeg, whisper.cpp, translate, OCR, TTS) returns a typed result with explicit error paths; no silent `catch` that returns input unchanged on export paths.
- **Centralize timestamp math** in one module (seconds ↔ SRT `hh:mm:ss,ms` ↔ `.ass` centiseconds) with unit tests — off-by-one here corrupts every export.
- Batch translation must preserve cue count and order: `assert out.length === in.length`.

**Performance**
- Local whisper.cpp = one pass, offline, GPU-accelerated — no per-chunk network calls (the old live path did ~1,350 network chunks for a 90-min video).
- Batch translate ~50 cues/request (~1,500 → ~30 requests), bounded concurrency (~6), content-hash cache so re-runs/repeated lines are instant.
- Soft-sub mux uses `-c copy` (no re-encode); stream FFmpeg progress instead of polling; free child processes + temp files deterministically.

**Maintainability**
- Reuse `translator.js`/`gemini.js` behind one `translation` interface so a provider swap touches one file.
- Keep the media worker pure/testable: it takes a job spec, emits events, knows nothing about the UI.

**Legal note (review gate):** ship attribution for the bundled CC sample; `yt-dlp` and TTS features carry explicit "you must have the rights" acknowledgements; no voice cloning of original speakers.

---

## 11. Phased roadmap

- **Phase 0 — Fix transcription (unblocks everything).** Media worker + FFmpeg + whisper.cpp; bundle sample video + setup script; delete the browser `@xenova` primary path (keep as no-GPU fallback). *Exit:* "Try the sample" produces correct English cues end-to-end.
- **Phase 1 — Core dual-sub loop.** Embedded/sidecar/transcribe paths → batch translate → dual-sub player → export (MP4/SRT/ASS/MKV). Watch mode complete.
- **Phase 2 — Study core.** Loop/A–B, dictionary, readings, interactive transcript, per-cue edit, FSRS review, mining to cards.
- **Phase 3 — Differentiators.** Frame-OCR translation, grammar breakdown + "explain this," auto-quizzes, CEFR rating + recommender, pronunciation scorer.
- **Phase 4 — Reach & polish.** Lyrics mode, TTS dual audio, `yt-dlp` URL import, series glossary, SDH output, progress dashboard, PiP companion, batch folder queue.
- **Cross-cutting:** accessibility-review pass each phase; the §5.5 smoke test gates every release.

## 12. Key risks & mitigations
- **whisper.cpp build/bundle complexity across arch** → ship prebuilt universal binary + checksum'd model + repair flow; system-FFmpeg fallback.
- **GPU absent / slow machines** → tiered models, cloud/native STT fallback, offline batch queue so users don't wait interactively.
- **Subtitle timing correctness** → centralized timestamp module + unit tests + length assertions.
- **Rights/licensing (URL import, TTS, sample video)** → acknowledgements, attribution file, no original-voice cloning.
- **Feature sprawl vs. "quiet" UI** → Watch mode hides all study chrome; mode = defaults, not a second app.

## 13. One-line summary
LingoLoop turns any video — subs or no subs — into a **locally-transcribed, dual-language, loopable** experience that's a film-night player and a serious study tool at once, starting by **fixing transcription with FFmpeg + whisper.cpp** and a bundled sample so it works the moment you open it.

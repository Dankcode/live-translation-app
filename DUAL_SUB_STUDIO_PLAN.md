# Dual-Sub Studio — Product & Implementation Plan

*A desktop app that turns any video into a dual-language, learning-ready viewing experience — using existing subtitles when present, or transcribing from scratch when not.*

Working codename: **Dual-Sub Studio** (spun out of the existing "Scribe Center" live-translation app).

---

## 1. What we're building (the idea in one paragraph)

The user drops in a video file (`.mp4`, `.mkv`, `.mov`, `.webm`, `.avi`, and audio like `.mp3`/`.wav` for podcasts). The app produces a **dual-subtitle** experience: the original language on one line and a translated language on a second line, shown together. It works in three input situations — (a) the video already has an embedded subtitle track, (b) the user supplies a sidecar `.srt`/`.vtt`/`.ass`, or (c) there are no subtitles at all, in which case the app transcribes the audio locally with Whisper. From that base track it generates the second language and lets the user **watch inside the app** with an interactive learning layer, **export a burned-in (hard-sub) video**, or **export soft subtitle files** (dual `.srt`/`.ass` or a muxed `.mkv`). It serves two audiences: language learners (education) and people who just want bilingual subs on foreign content (leisure).

The core technical spine is **FFmpeg** (demux, extract, transcode, burn-in, mux) plus a **transcription engine** (Whisper) and a **translation engine** (the Google/Gemini stack already in this repo).

---

## 2. Why this is a natural extension of the current app

The existing "Scribe Center" repo already solves most of the hard sub-problems; this plan reuses them rather than starting cold.

| Existing asset (in this repo) | Reused for Dual-Sub Studio |
|---|---|
| `src/lib/translator.js` — Google Translate GET + `google-translate-api-next` fallback | Batch-translates subtitle cues into the second language |
| `src/lib/gemini.js` — `geminiTranslate` + `geminiRefine` | Context-aware / higher-quality translation and idiom refinement of cues |
| `@xenova/transformers` dependency + STT routes (`api/stt`) | Local **Whisper** transcription for the "no subtitles" path (offline, no per-minute cloud cost) |
| `src/lib/google-stt.js`, native `SpeechHost` (Swift `SFSpeechRecognizer`) | Optional higher-accuracy cloud/native transcription fallback |
| `src/lib/usage-tracker.js` — daily quota tracking in `~/.scribe-center` | Meter cloud STT/LLM minutes, warn before limits |
| Electron shell (`main/main.js`) + Next.js 16 / React 19 / Tailwind v4 | Same desktop shell; swap the transparent overlay for a full media workspace |
| WebSocket bridge pattern (`api/bridge`) | Stream job progress from the FFmpeg/Whisper worker to the UI |
| Overlay subtitle rendering + styling | Basis for the in-app dual-subtitle renderer |

**Net effect:** translation, transcription, quota metering, and the desktop packaging are already proven. The genuinely *new* work is the FFmpeg media pipeline, the subtitle data model, the interactive player, and the export flows.

---

## 3. Target users & the two use modes

**Education mode (language learners).** Emphasis on comprehension aids: clickable words with pop-up dictionary, per-word readings (pinyin / furigana / romaja / romanization), save-to-flashcards, loop-a-line, slow playback, and hiding one language to self-test. Inspired by tools like Language Reactor, LingoPie, and Migaku.

**Leisure mode (bilingual viewers).** Emphasis on "just make it watchable": pick two languages, auto-generate, and either watch or export a file that plays in VLC / on a TV / on the phone. Minimal UI, sensible defaults, fast export.

A single **mode toggle** changes default subtitle styling, which panels are visible, and whether the learning layer is active — but both modes share the same pipeline underneath.

---

## 4. Feature set

### 4.1 Core (must-have) features
- Import video/audio by drag-drop or file picker; detect container, streams, duration, and existing subtitle tracks via `ffprobe`.
- Three source paths: **use embedded subs**, **use sidecar subs**, or **transcribe (no subs)**.
- Language selection: source language (auto-detected, user-confirmable) and one or more target languages.
- Dual-subtitle generation: original + translation stacked, with per-cue timing preserved.
- In-app player with dual subtitles rendered live.
- Export: (a) burned-in hard-sub MP4, (b) soft dual-sub `.srt`/`.ass`, (c) muxed `.mkv` with selectable tracks.
- Job queue with real-time progress and cancel.

### 4.2 Popular features from other tools (not in the original brief, worth adding)
These are common in leading subtitle/learning apps and differentiate the product:

- **Clickable dictionary lookups** — click any word in either subtitle line to see definition, part of speech, and example sentences (Language Reactor / LingoPie style).
- **Word-level readings / transliteration** — furigana above Japanese, pinyin above Chinese, romaja for Korean, general romanization toggle.
- **Karaoke-style word highlighting** — the currently-spoken word highlights in sync (requires word-level timestamps, which Whisper can emit).
- **Save-to-flashcards + Anki export** — one-click save of a word or a whole line (with the audio snippet and screenshot) to a deck; export `.apkg` or CSV. Migaku/Language Reactor pattern.
- **Line loop & A–B repeat** — replay the current cue or a selected span until dismissed; great for shadowing practice.
- **Adjustable playback speed** (0.5×–2×) with pitch correction.
- **"Hide one language" self-test mode** — blur/hide the target or the translation and reveal on hover/click.
- **Auto-generated interactive transcript** — a scrollable, clickable transcript beside the video; click a line to jump the playhead.
- **Subtitle timing offset / re-sync slider** — nudge subs earlier/later to fix drift, plus auto-align when possible.
- **Per-cue re-translate / edit** — inline edit any translated line, or ask the LLM to re-translate a single line more naturally (uses `geminiRefine`).
- **Multiple simultaneous target languages** (e.g., a 3-line stack for polyglots or classrooms).
- **Style presets & positioning** — font, size, outline, background box, top vs bottom placement, per-language color coding.
- **Difficulty / frequency coloring** — color words by frequency rank so learners see which words are rare (Migaku pattern).
- **Chapter & scene markers** from the container; jump between them.
- **Batch mode** — queue a whole folder (e.g., a series) with one language config.
- **Speaker diarization labels** (optional) — tag "Speaker 1/2" when the ASR model supports it.
- **Export a study pack** — SRT + vocabulary list + flashcard deck bundled per video.

### 4.3 Explicitly out of scope (v1)
Real-time live translation (that's the original overlay app's job), cloud accounts / multi-user sync, mobile apps, DRM-protected streaming capture, and full video editing.

---

## 5. System architecture

### 5.1 High-level shape
Keep the current **Next.js (UI + API routes) inside an Electron shell** structure. Add a dedicated **media worker** because FFmpeg and Whisper are long-running and CPU/GPU-heavy — they must not block the UI or the Node event loop.

```
┌────────────────────────── Electron App ──────────────────────────┐
│                                                                   │
│  Renderer (Next.js / React / Tailwind)                            │
│   • Import & config screens   • Player + dual-sub renderer        │
│   • Job queue UI              • Learning layer (dict, flashcards) │
│         │  IPC / WebSocket (reuse bridge pattern)   ▲ progress    │
│         ▼                                           │             │
│  Main process (main/main.js)                                      │
│   • Spawns & supervises the Media Worker                          │
│   • File-system access, app config in ~/.dualsub                  │
│         │                                                         │
│         ▼                                                         │
│  Media Worker (Node child process)                                │
│   • FFmpeg / ffprobe (spawn, parse progress)                      │
│   • Whisper transcription (@xenova/transformers or whisper.cpp)   │
│   • Subtitle parse/normalize/merge/render                         │
│   • Calls Translation service                                     │
│         │                                                         │
│         ▼                                                         │
│  Translation service (reuse src/lib/translator.js + gemini.js)    │
└───────────────────────────────────────────────────────────────────┘
```

### 5.2 Why a separate worker
- FFmpeg burn-in on a feature-length film can run for minutes; the UI must stay responsive and cancellable.
- Whisper transcription is the heaviest step; isolating it lets us pin threads, show progress, and kill it cleanly.
- Keeps the existing translation/quota libraries untouched and callable from one place.

### 5.3 Binaries & dependencies
- **FFmpeg + ffprobe**: bundle static builds per platform (e.g., via `ffmpeg-static` / `@ffprobe-installer`) so users don't install anything. Verify presence at startup; fall back to a system FFmpeg if bundling is undesirable.
- **Whisper**: default to `@xenova/transformers` (already a dependency) running `whisper-base`/`small` in-process for a zero-install path; offer `whisper.cpp` (with optional GPU/Metal/CUDA) as a faster power-user backend. Word-level timestamps enable karaoke + flashcard audio clips.
- **Translation**: existing Google GET + `google-translate-api-next`, with Gemini for quality and for languages the free endpoint handles poorly (the repo already special-cases Chinese via Gemini).

---

## 6. Data model

A normalized in-memory + on-disk **project** so every feature reads one shape regardless of whether cues came from FFmpeg extraction, a sidecar file, or Whisper.

```jsonc
// Project
{
  "id": "uuid",
  "media": {
    "path": "/…/movie.mkv",
    "container": "matroska",
    "durationSec": 5400,
    "video": { "codec": "h264", "width": 1920, "height": 1080, "fps": 23.976 },
    "audioTracks": [ { "index": 1, "codec": "aac", "lang": "ja", "channels": 2 } ],
    "subtitleTracks": [ { "index": 2, "codec": "subrip", "lang": "ja", "title": "Full" } ],
    "chapters": [ { "start": 0, "end": 600, "title": "Cold open" } ]
  },
  "source": { "mode": "embedded | sidecar | transcribe", "lang": "ja", "confidence": 0.98 },
  "targets": ["en"],                       // one or more
  "cues": [
    {
      "id": 12,
      "start": 12.340, "end": 15.100,
      "speaker": "S1",
      "original": "こんにちは、元気ですか？",
      "words": [ { "w": "こんにちは", "start": 12.34, "end": 12.90, "reading": "konnichiwa", "freqRank": 82 } ],
      "translations": { "en": "Hi, how are you?" },
      "edited": false
    }
  ],
  "style": { "mode": "education", "fontSize": 30, "originalColor": "#fff", "translationColor": "#9cf", "box": true, "position": "bottom" },
  "flashcards": [ /* saved words/lines */ ]
}
```

Persist projects as JSON in `~/.dualsub/projects/<id>/` (mirrors the existing `~/.scribe-center` convention), alongside extracted audio and any generated subtitle files.

---

## 7. The subtitle pipeline (step by step)

### Step A — Probe
Run `ffprobe -v quiet -print_format json -show_format -show_streams -show_chapters input`. Populate `media`. Decide which source paths are available (embedded subtitle stream? user gave a sidecar? neither → transcribe).

### Step B — Acquire the base (original-language) cues
**Path 1 — Embedded subs exist:**
```
ffmpeg -i input.mkv -map 0:s:0 base.srt
```
(Choose the stream by language/title; for bitmap subs like PGS/VOBSUB, OCR is needed — flag as a known limitation, optionally offer an OCR step.)

**Path 2 — Sidecar subs:** parse the provided `.srt`/`.vtt`/`.ass` directly.

**Path 3 — No subs → transcribe:**
1. Extract mono 16 kHz audio: `ffmpeg -i input -vn -ac 1 -ar 16000 audio.wav`
2. Run Whisper with word timestamps → cues with `start/end/words`.
3. Optionally VAD-segment first to improve cue boundaries.

Normalize all three into the same `cues[]` shape.

### Step C — Detect & confirm source language
Whisper reports language; for existing subs, detect from track metadata or a language-ID pass. Show the user a confirm/override control.

### Step D — Translate
Batch cues (respecting cue boundaries, never merging across them) through `translateText`. Use Gemini (`geminiTranslate`) for quality-sensitive or free-endpoint-weak languages, and `geminiRefine` for the "make this line more natural" action. Cache by (text, from, to) hash to avoid re-paying for repeats. Fill `translations[target]`.

### Step E — Enrich (education features)
Generate word readings/transliteration, frequency ranks (from a bundled frequency list per language), and — if word timestamps exist — karaoke timing. This step is skippable in leisure mode for speed.

### Step F — Render / export
- **In-app:** the React player reads `cues[]` and paints dual lines synced to `currentTime`.
- **Soft export:** write dual `.srt` (two stacked lines per cue) or `.ass` (styled, positioned, colored) and/or mux into `.mkv`:
  ```
  ffmpeg -i input.mp4 -i dual.ass -c copy -c:s mov_text output.mkv
  ```
- **Hard-sub (burn-in):**
  ```
  ffmpeg -i input.mp4 -vf "subtitles=dual.ass" -c:a copy output.mp4
  ```
  `.ass` is preferred over `.srt` for burn-in because it carries font, color, outline, and positioning for the two-language stack. Parse FFmpeg's `-progress` output to drive the progress bar.

---

## 8. Design (`/design` lens) — minimal, progressive disclosure

**Design principle: one obvious path, everything else tucked away.** A first-time user should be able to go from "drop a video" to "watching with dual subs" without ever opening a settings panel. Power and depth exist, but they live behind tabs and only appear when asked for. Nothing intrusive is ever on screen by default — no dense toolbars, no walls of options, no controls competing with the video.

### 8.1 The three-screen flow (that's the whole app)

```
  ┌───────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐
  │                           │   │   movie.mkv · 1h 42m       │   │  ▓▓▓▓▓▓▓ video ▓▓▓▓▓▓▓▓▓▓  │
  │         ⬆                 │   │                            │   │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
  │   Drop a video            │   │   From  [日本語 ▾ auto]     │   │                            │
  │   or click to browse      │   │   To    [English ▾]        │   │   こんにちは、元気ですか？    │
  │                           │   │                            │   │   Hi, how are you?         │
  │                           │   │   ◉ Watch    ○ Export      │   │  ──────────────────────    │
  │   [ Learn ]  [ Watch ]    │   │                            │   │  ⏯  ──●───────  ⚙  ⤢       │
  │                           │   │        [  Start  ]         │   │  (bar auto-hides)          │
  └───────────────────────────┘   └───────────────────────────┘   └───────────────────────────┘
      1. Landing (drop)              2. One config card             3. Player (video-first)
```

1. **Landing** — almost empty: a drop zone and a single pair of buttons, **Learn** or **Watch**, that pick the default experience. That one choice sets sensible defaults for everything downstream; the user never has to configure anything to start.
2. **Config card** — one small card: source language (auto-detected, shown as a confirmable chip), target language, and a Watch/Export toggle. One **Start** button. Every other setting is behind the quiet **"Advanced ▾"** disclosure or the ⚙ settings tabs — hidden unless wanted.
3. **Player** — video-first. Subtitles sit over the video; the control bar is thin and **auto-hides** after a couple seconds of no mouse movement. Learning tools are *not* permanently on screen — they surface on interaction (hover a word, click a line) so leisure users never see clutter and learners get depth on demand.

### 8.2 Settings live in tabs, not on the main surface
All depth is consolidated into one **Settings panel (⚙)** opened as a side sheet or modal, organized into tabs so each screen stays sparse. Nothing here is required to get a result — they're refinements.

| Tab | What's inside (hidden until opened) |
|---|---|
| **Languages** | Source override, multiple target languages, mixed-language handling, transliteration (pinyin/furigana/romaja) |
| **Subtitles** | Style presets, font/size/color per language, position (top/bottom), outline vs box, one-language-hidden self-test |
| **Audio & Recognition** | Quality preset (Fast/Balanced/Best), vocal isolation, denoise, diarization, model size — the §15 controls |
| **Learning** | Dictionary on/off, flashcards & Anki export, frequency coloring, karaoke highlight, A–B loop defaults |
| **Export** | Soft vs hard-sub, container, per-language toggles, output folder, naming |
| **Batch** | The §16 queue, manifest import, watch folder, concurrency |
| **Advanced** | API keys, cache, FFmpeg path, logs |

Progressive disclosure rule of thumb: **the main screens show ≤ 5 controls; anything a first session doesn't need goes in a tab.** Defaults are chosen by the Learn/Watch pick, so most users touch tabs rarely or never.

### 8.3 Mode = defaults, not a different app
**Learn** and **Watch** don't change the layout — they change *defaults and what surfaces on interaction*. Watch: clean subs, no word chips, dictionary off, export-friendly. Learn: clickable words, readings on, flashcard tray reachable, self-test available. A user can switch modes anytime from settings without relearning the interface.

### 8.4 Visual language (kept deliberately quiet)
- **Calm, low-chrome surface** — dark-neutral by default (video content looks best on dark), high contrast only where it matters (the subtitles). Minimal borders; separation by spacing, not lines.
- **Token-driven** so the player and the exported `.ass` share one styling source (what you see == what you export). Tokens: `--surface`, `--surface-raised`, `--text-primary/-muted`, `--accent`; subtitle tokens `--sub-original`, `--sub-translation`, `--sub-outline`, `--sub-box`; a 5-step `--freq-1…5` scale for frequency coloring (Learn only).
- **Type:** one quiet UI family + a CJK-capable subtitle family (Noto Sans / Noto Sans CJK); `--reading-size` for furigana/pinyin.
- **Motion:** subtle only — `--fast 120ms` cue fades, `--base 200ms` panel/tab transitions. No animation that pulls attention off the video.
- **Controls fade, content stays** — bars, chips, and panels are transient; the video and its subtitles are the only persistent elements.

### 8.5 Components (each with variants + states)
`MediaDropzone` (idle / drag-over / invalid / loading) · `ModeToggle` (Learn / Watch) · `ConfigCard` with `AdvancedDisclosure` (collapsed default) · `LanguageChip` (auto-detected / confirmed / override) · `AutoHideControlBar` · `DualSubtitleRenderer` (both / original-only / translation-only / hidden-for-test) · `WordChip` (default / hover-definition / saved; frequency-colored — Learn only) · `TranscriptPanel` (active-line highlight, click-to-seek; collapsible) · `SettingsSheet` + `SettingsTab` · `JobQueueItem` (queued / running / done / error / canceled) · `ExportDialog` · `FlashcardTray`.

**Consistency & a11y rules:** tokens only (no hardcoded colors/sizes); the subtitle token set feeds both renderer and `.ass` generator; every control has hover/focus/disabled/loading states; icon-only buttons carry accessible labels. A later `accessibility-review` pass checks subtitle contrast over arbitrary video (why the outline/box tokens exist), keyboard access to the auto-hiding bar, and touch-target sizing.

---

## 9. Failure modes & debugging plan (`/engineering:debug` lens)

Media processing fails in many boring, specific ways. Plan for them up front rather than discovering them in the field.

**Reproduce/isolate strategy:** every job writes a structured log (`~/.dualsub/logs/<jobId>.log`) capturing the exact `ffmpeg`/`ffprobe`/Whisper commands, exit codes, stderr tails, and timings — so any bug report is reproducible from the log alone.

| Failure mode | Detection | Handling |
|---|---|---|
| FFmpeg/ffprobe binary missing or wrong arch | Startup health check runs `ffmpeg -version` | Block processing with a clear "repair install" prompt; fall back to system FFmpeg |
| Unsupported/rare codec | ffprobe returns unknown codec | Offer transcode-to-intermediate step; surface a readable message, not raw stderr |
| Bitmap subtitles (PGS/VOBSUB) can't be text-extracted | subtitle codec is `hdmv_pgs`/`dvd_subtitle` | Explain OCR is required; offer transcription path instead |
| Whisper OOM / too slow on large file | Monitor RSS + elapsed vs duration | Auto-downgrade model size, chunk audio, or suggest cloud/native STT |
| Translation endpoint rate-limit / network drop | HTTP status + retries | Exponential backoff; cache partial results; resume, never restart from zero |
| Subtitle timing drift vs audio | User-visible or auto-detected offset | Manual re-sync slider + auto-align attempt |
| Wrong auto-detected source language | Low confidence score | Confirm dialog before translating; one-click re-detect |
| Encoding/mojibake in sidecar subs | Charset sniff | Detect and transcode to UTF-8 (handles Windows-1251, Shift-JIS, GBK, etc.) |
| Corrupt/partial input file | ffprobe error / zero duration | Reject early with specifics |
| User cancels mid-job | Cancel signal | Kill child process cleanly, remove temp files, leave project consistent |
| Disk full during export | Pre-flight free-space check vs estimate | Warn before starting; fail gracefully mid-way |

**Golden rule:** never show the user a raw FFmpeg stack dump. Map known stderr signatures to friendly messages; keep the raw log one click away.

---

## 10. Code quality & review standards (`/engineering:code-review` lens)

Standards to hold every change to, given this app shells out to binaries and handles user files.

**Security & safety**
- **Never build FFmpeg commands via string concatenation of user input.** Always pass arguments as an array to `spawn` (no shell), so filenames with spaces/quotes/`;`/`$()` can't inject. This is the single highest-risk area.
- Validate/normalize all file paths; confine writes to the project temp dir and the user-chosen export location.
- Treat subtitle files as untrusted input (they're plain text but can be huge / malformed / mis-encoded — bound sizes, time-box parsing).
- Keep API keys in the existing config store, never in logs; the usage-tracker already masks keys — keep that behavior.

**Correctness & robustness**
- Every external call (FFmpeg, Whisper, translate) returns a typed result with explicit error paths; no silent `catch` that returns the input unchanged in export paths (acceptable for live preview, not for a paid export).
- Timestamp math is centralized (one module converts between seconds, `hh:mm:ss,ms` SRT, and `.ass` centiseconds) with unit tests — off-by-one framing here corrupts every export.
- Batch translation must preserve cue count and order; assert `out.length === in.length`.

**Performance**
- Avoid re-transcoding when `-c copy` suffices (soft-sub mux shouldn't re-encode video).
- Cache translation and Whisper results keyed by content hash so re-runs are cheap (mirrors the existing quota-conscious design).
- Stream FFmpeg progress rather than polling; free child processes and temp files deterministically.

**Maintainability**
- Reuse `src/lib/translator.js` and `gemini.js` as-is; wrap them behind one `translation` interface so a provider swap touches one file.
- Keep the media worker pure/testable: it takes a job spec and emits events; no UI knowledge.

---

## 11. Testing strategy

- **Unit:** timestamp conversions, SRT/VTT/ASS parse+serialize round-trips, cue merge/split, charset detection, command-arg builder (assert no shell metacharacters leak).
- **Integration (small fixtures):** a 10-second clip with (a) embedded subs, (b) sidecar subs, (c) no subs, each run end-to-end to a burned + a muxed output; assert output plays and cue counts match.
- **Golden-file:** known input → expected `.ass`/`.srt` bytes.
- **Manual/QA matrix:** codecs (h264/hevc/vp9), containers (mp4/mkv/webm), languages incl. CJK + RTL (Arabic/Hebrew) for rendering, and long-form (2 hr film) for performance and cancel.
- **Verification checklist per release:** binaries detected, all three source paths, both export types, cancel mid-job, disk-full handling.

---

## 12. Phased implementation roadmap

**Phase 0 — Foundations (spike, ~1 wk)**
Fork the Electron/Next shell; bundle FFmpeg/ffprobe; prove `ffprobe` → JSON and a trivial burn-in on a test clip; stand up the media-worker child process + progress bridge. *Milestone: a hardcoded clip gets one hardcoded subtitle burned in from the UI.*

**Phase 1 — Base cues from all three sources**
Embedded extraction, sidecar parsing, and Whisper transcription all normalized into `cues[]`. Language detect + confirm. *Milestone: any input yields a correct single-language cue list.*

**Phase 2 — Translation & dual generation**
Wire in `translator.js` / `gemini.js`; batch + cache; produce `translations[target]`; generate dual `.ass`/`.srt`. *Milestone: dual-sub soft files export and play in VLC.*

**Phase 3 — In-app player**
Media playback + `DualSubtitleRenderer` synced to `currentTime`; style presets; re-sync slider; interactive transcript with click-to-seek. *Milestone: watch dual subs inside the app.*

**Phase 4 — Export suite**
Hard-sub burn-in, soft mux to `.mkv`, multi-target stacks, job queue with cancel + progress + error mapping. *Milestone: reliable exports across the QA codec/container matrix.*

**Phase 5 — Learning layer (education mode)**
Clickable dictionary, word readings/transliteration, frequency coloring, karaoke highlighting, flashcards + Anki export, hide-one-language test, A–B loop, playback speed. *Milestone: a learner can study a clip end-to-end and export a study pack.*

**Phase 6 — Polish & scale**
Batch/folder mode, chapter markers, diarization labels, accessibility pass, performance tuning (GPU Whisper, `-c copy` fast paths), packaged installers (dmg/nsis via the existing `electron-builder` config).

---

## 13. Key risks & mitigations
- **Transcription accuracy on noisy/accented audio** → offer model-size choice + cloud/native STT fallback (already in repo); let users edit cues.
- **Burn-in time on long films** → GPU-accelerated encode option, `-c copy` for audio, clear time estimates, background queue.
- **Free translation endpoint reliability/ToS** → Gemini and pluggable providers already abstracted; cache aggressively.
- **Bitmap-subtitle inputs** → clearly documented limitation + transcription alternative; OCR as a later add-on.
- **Font/rendering correctness for CJK & RTL** → bundle Noto CJK fonts; test RTL early.

---

## 14. Performance: faster transcription & translation than the current method

The existing app is built for *live* overlay: it transcribes in 4-second chunks and translates one line at a time, each over the network. That per-unit-over-network shape is the wrong fit for batch video and is the main thing to change.

**Current bottlenecks (from code review of `translator.js`, `api/translate`, `geminiSTT`, `api/stt`):**
- **Translation = 1 HTTP request per cue.** ~1,500 cues → ~1,500 serial round-trips.
- **Transcription = 1 request per 4s chunk.** A 90-min video → ~1,350 sequential Gemini/Google calls, each with TLS + model-discovery overhead.
- **No caching/dedup** — repeated lines re-translated every time.
- **Translate-then-refine = 2 LLM calls per line** when a refine model is set.
- **`geminiSTT`** adds a `listModels` round-trip on 404 and probes `v1`→`v1beta` sequentially, per chunk.

**Faster design:**
1. **Local Whisper, one pass, no chunking.** Transcribe the whole extracted 16 kHz WAV in a single `@xenova/transformers` (or `whisper.cpp` + Metal/CUDA) pass with word timestamps. Removes all per-chunk network + model-discovery cost, runs offline/free, and is many× real-time on GPU. Keep cloud/native STT only as an optional fallback.
2. **Batch translation** — ~50 cues per request (Google repeated `q=` params, or one Gemini prompt returning a JSON array). ~1,500 requests → ~30. Assert output length == input length so a mis-parse can't shift subtitles.
3. **Bounded concurrency + backoff** — a `p-limit` pool (~6 in flight) with exponential backoff on 429 (reuse the existing `retryAfterSeconds` parsing).
4. **Content-hash translation cache** — key by `hash(text|from|to)`, persist to `~/.dualsub/cache/` (reuse the existing `hashKey` helper and `~/.scribe-center`-style disk convention). Re-runs and repeated lines become instant.
5. **Cut the double LLM call** — refine inside the same batch prompt, or make refine an explicit off-by-default per-line action, not a whole-file pass.
6. **Trim `geminiSTT`** (as fallback) — resolve+cache the model once per session; don't probe both API versions per chunk.

**Rough impact (90-min video, ~1,500 cues):** translation drops from ~1,500 serial requests to ~30 batched × 6 concurrent (≈1–2 orders of magnitude faster, near-zero on cached re-runs); transcription drops from ~1,350 network chunks to a single local pass. Correctness guardrails: batch length assertions, deterministic cache keys, and the array-arg FFmpeg rule from §10 still apply.

---

## 15. Audio clean-up & robust ASR (noisy, multi-voice, multi-language)

Raw video audio is rarely clean — music beds, crowd noise, overlapping speakers, phone-quality mics, and occasional language switching all wreck a naive Whisper pass. Insert a **pre-processing chain before ASR** and use an ASR stack built for these conditions. Every stage is optional and toggleable (leisure mode can skip most of it for speed; education/hard cases turn it all on).

### 15.1 Audio pre-processing chain (order matters)
Applied to the extracted 16 kHz mono WAV, mostly via FFmpeg filters plus a couple of models:

1. **Band-pass / rumble removal** — `highpass=f=80, lowpass=f=8000` to drop sub-bass rumble and hiss outside the speech band.
2. **Vocal isolation / source separation** — split speech from music and background using **Demucs** (`htdemucs`) or Spleeter, keep the vocal stem. This is the single biggest win for content with a music bed (film, vlogs, TV).
3. **Denoise** — spectral denoise via FFmpeg `afftdn`, or a learned denoiser (**RNNoise** via `arnndn`, or **DeepFilterNet**) for non-stationary noise. Model-based denoisers beat `afftdn` on real-world noise.
4. **Loudness normalization + gentle compression** — `loudnorm` (EBU R128) so quiet speakers come up to a consistent level, with mild dynamic compression to even out loud/soft dialogue.
5. **De-reverb** (optional) — for echoey rooms, a de-reverb pass before ASR.

Cache the cleaned audio per project so re-runs (different target language, edits) don't re-process.

### 15.2 Segmentation & speaker handling (multiple voices)
- **VAD (Voice Activity Detection)** — **Silero VAD** to find speech regions and drop silence/noise. This improves accuracy *and* speed (ASR only runs on speech) and gives cleaner cue boundaries than Whisper's internal segmentation.
- **Speaker diarization** — **pyannote.audio** to answer "who spoke when," producing speaker turns. Feed those turns to ASR so cues don't merge two people, and label cues `Speaker 1/2/…` (optional on-screen, useful for classrooms and interviews).
- **Recommended stack: WhisperX** — it wraps Whisper with batched inference (much faster than real-time), VAD-based chunking, forced phoneme **alignment for accurate word-level timestamps** (which the karaoke + flashcard-audio features in §4.2 depend on), and **pyannote diarization** integration. It directly solves noisy + multi-voice + word-timing in one component. Keep plain `@xenova` Whisper as the lightweight/offline-simple path and WhisperX as the "hard audio" path.

### 15.3 Multiple / switching languages
- **Per-segment language ID** — run language detection on each VAD segment rather than once for the whole file, so code-switching (e.g., English dialogue with Spanish phrases) is caught.
- **Mixed-language mode** — when segments differ, transcribe each segment in its detected language and tag the cue with its language; the translation step then translates each cue *from its own source language* into the chosen target(s).
- **Model choice** — use **Whisper large-v3** for multilingual/accented/noisy material (best robustness); allow smaller models for clean single-language content where speed matters.
- **User override** — let the user pin "this video is Japanese + English" or force a single language when auto-detect is jumpy.

### 15.4 Confidence, review & accountability
- ASR emits a **per-cue confidence / avg-logprob**; flag low-confidence cues in the editor (highlighted) so users can quickly fix the parts the model was unsure about.
- **"Enhance this line" action** — re-run a single low-confidence segment with a larger model or the cloud/native STT fallback.
- Keep the structured job log (§9) recording which cleanup stages ran, detected languages, and diarization result — so a bad transcript is diagnosable, not mysterious.
- Expose a small **quality preset**: *Fast* (VAD + base model, no separation), *Balanced* (denoise + VAD + small/medium), *Best* (separation + denoise + WhisperX large-v3 + diarization). Default by mode: leisure→Fast/Balanced, education→Balanced/Best.

### 15.5 Cost/perf note
Separation and diarization are heavy — run them in the media worker (§5.2), GPU-accelerate where available (Demucs and WhisperX both support CUDA/Metal), and let the batch queue (§16) chew through them offline rather than making the user wait interactively.

---

## 16. Batch upload & offline transcription queue

Users shouldn't watch text generate in real time. They submit **a list of videos**, walk away, and come back to finished subtitle files. This is a persistent, resumable job queue in the media worker.

### 16.1 Ways to enqueue
- **Drag a folder** (or multiselect files) → each video becomes a job using the current default config.
- **Drop a manifest file** — a `.json`/`.csv`/`.txt` list describing many jobs with per-video settings (below). This is the "upload a list" format requested.
- **Watch folder** (optional) — point the app at a folder; anything dropped in is auto-enqueued and processed, output written alongside.

### 16.2 Manifest format (the upload "list")
A simple, human-editable batch spec. CSV for quick lists, JSON when per-job overrides are needed.

```jsonc
// batch.dsjob.json
{
  "defaults": {
    "sourceLang": "auto",
    "targets": ["en"],
    "quality": "balanced",        // fast | balanced | best  (maps to §15.4)
    "cleanup": { "separateVocals": true, "denoise": true, "diarize": false },
    "output": ["srt-dual", "ass-dual"],   // also: mkv-mux, mp4-hardsub
    "outputDir": "/exports"
  },
  "jobs": [
    { "input": "/videos/lecture01.mp4" },
    { "input": "/videos/interview.mkv", "sourceLang": "ja", "targets": ["en","zh"], "quality": "best", "cleanup": { "diarize": true } },
    { "input": "/videos/vlog.webm", "output": ["mp4-hardsub"] }
  ]
}
```

Equivalent minimal CSV:
```
input,sourceLang,targets,quality,output
/videos/lecture01.mp4,auto,en,balanced,srt-dual
/videos/interview.mkv,ja,"en;zh",best,mkv-mux
```
On import, validate every row (file exists, langs known, output types valid) and show a pre-flight summary — count, total duration, estimated time and disk — before the user hits **Start**.

### 16.3 Queue behavior
- **Persistent & resumable** — the queue lives in `~/.dualsub/queue.json`; if the app is closed or crashes mid-batch, it resumes on relaunch (each job tracks stage: probed → cleaned → transcribed → translated → exported, so it restarts at the last completed stage, not from zero).
- **Sequential by default, small parallelism optional** — heavy stages (separation, WhisperX) are GPU/CPU-bound, so 1–2 concurrent jobs is usually optimal; expose a concurrency setting.
- **Per-job + overall progress**, ETA, and pause/resume/cancel/reorder. **Priority** flag to jump a job to the front.
- **Retry policy** — failed jobs are retried with backoff, then parked in a "Needs attention" list with the error (§9 mapping) rather than silently dropped.
- **Dedup** — skip inputs whose content hash + config already produced an output (re-running a folder shouldn't redo finished files).
- **Completion notifications** — desktop notification and a batch summary (succeeded / failed / skipped, with per-file output paths). Optionally scheduled: kick a big batch off overnight.

### 16.4 Outputs
Each job writes its chosen artifacts to `outputDir` (or beside the source), named `<video>.<srcLang>-<tgtLang>.dual.srt/.ass/.mkv/.mp4`, plus an optional per-video **study pack** (§4.2). A `batch-report.csv` logs every job's status, detected language(s), speaker count, mean confidence, and output paths.

---

## 17. Covering / hiding existing subtitles (legibility layer)

Two very different cases hide behind "the video already has subtitles":

- **Case A — soft/selectable subs** (embedded track or sidecar): the original text is a separate stream. We simply **don't render or mux it** — nothing to cover. Common and trivial.
- **Case B — burned-in (hard) subs**: the original text is baked into the video **pixels** and can't be switched off. To add clean dual subs without them colliding, we must **mask the old region**. This is the actual feature.

Independently, a subtle **dark scrim behind our new subtitles** improves readability over bright/busy scenes — same mechanism, always available even when there were no old subs (this is the `--sub-box` token from §8).

### 17.1 Two rendering paths (preview vs export)

**In-app preview — non-destructive, instant.** Render a positioned overlay `<div>` over the `<video>` element (a bar/box with adjustable opacity or backdrop-blur), with our new dual subs drawn on top. Toggle **Off / Dark box / Blur**; the region is draggable/resizable and remembered per project. No re-encode, updates live.

**Export burn-in — destructive, via FFmpeg.** Apply a cover filter, then draw new subs on top, all in the single export encode (no extra pass):

```bash
# Solid dark band over the bottom, then new dual subs on top
ffmpeg -i in.mp4 -vf \
"drawbox=x=0:y=ih*0.80:w=iw:h=ih*0.20:color=black@0.85:t=fill, subtitles=dual.ass" \
-c:a copy out.mp4
```
```bash
# Less-intrusive alternative: blur/interpolate the old text away with delogo, then new subs
ffmpeg -i in.mp4 -vf \
"delogo=x=0:y=H*0.82:w=W:h=H*0.18, subtitles=dual.ass" \
-c:a copy out.mp4
```
`drawbox` (solid, optionally semi-transparent) is safest for dense text; `delogo`/`boxblur` looks like the sub was never there but needs the region to fully cover the text or artifacts remain. **The preview overlay maps 1:1 to these filters so what you see equals what you export** (§8 consistency rule).

### 17.2 Choosing the region
- **Default** — bottom band (~18–20% of frame height), where subtitles usually sit.
- **Manual** — drag a box in the player; store as a **normalized rect** (x, y, w, h in 0–1) so it's resolution-independent and works on any export size.
- **Auto-detect** — sample frames across the timeline and run edge/text detection (or the OCR pass) to find the recurring high-contrast text region and the time spans it appears; propose a box the user can accept or nudge.

### 17.3 Time-gating (v2)
Only apply the cover **during spans where the original subs actually appear** (from OCR timing), instead of darkening the whole film. v1 ships an always-on band for simplicity; v2 adds time-gated masking via FFmpeg `enable='between(t,start,end)'` on the `drawbox`/`delogo` filter.

### 17.4 Controls (in the Subtitles settings tab, §8.2)
- **Original subs:** Keep · Hide (soft only) · **Cover (box)** · **Blur (delogo)**.
- **Cover style:** color, opacity, blur amount, feathered edges (a soft gradient edge is far less jarring than a hard rectangle), region source (auto / manual).
- **Legibility scrim** behind new subs: on/off + opacity (reuses `--sub-box`), independent of whether old subs exist.
- New component **`SubtitleMaskOverlay`** (states: off / box / blur; with edit handles) whose settings serialize straight into the export filter string.

### 17.5 Edge cases
- Bitmap **PGS/VOBSUB burned into the picture** → treat as Case B (mask it).
- Subs that **move** or sit mid-frame → manual/auto region must support non-bottom placement, possibly multiple boxes.
- **Feather** box edges and, over very bright backgrounds, prefer a fully opaque box for the new sub's scrim so contrast holds (ties into the later `accessibility-review`).
- Keep it to **one encode** — these are per-frame filters; chain them with the subtitle burn rather than adding a pass.

---

## 18. One-line summary
Reuse Scribe Center's translation, Whisper STT, and Electron shell; add an FFmpeg-driven media worker, a normalized subtitle data model, an interactive dual-sub player, and soft/hard export — then layer on the dictionary, flashcards, readings, and karaoke features that make it a genuine learning tool, not just a subtitle merger.

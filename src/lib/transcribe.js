'use client';

/**
 * Fallback client-side transcription.
 *
 * LingoLoop's primary transcription path is the local FFmpeg + whisper.cpp
 * media worker in src/lib/whisper-cpp.js. This module keeps the browser-only
 * Whisper path available for preview builds where Electron cannot expose the
 * original desktop file path.
 *
 * Language handling:
 *   - A specific language code (e.g. 'ja')  -> Whisper is forced to that language.
 *   - 'detect'                              -> Whisper runs language recognition
 *                                              itself and transcribes in whatever
 *                                              language it hears. We also surface a
 *                                              best-effort detected code back to the UI.
 *   - 'none' / empty                        -> caller must pick one first; we throw.
 */

// Whisper accepts full language names; map our short codes to them.
const WHISPER_LANGUAGE_NAMES = {
  en: 'english',
  ja: 'japanese',
  zh: 'chinese',
  ko: 'korean',
  es: 'spanish',
  fr: 'french',
  de: 'german',
};

// Default multilingual model. 'base' balances speed vs accuracy and, unlike the
// *.en variants, can auto-detect language. Callers can pass a larger model
// ('Xenova/whisper-small', 'Xenova/whisper-medium') for the "Best" quality tier.
const DEFAULT_MODEL = 'Xenova/whisper-base';
const TARGET_SAMPLE_RATE = 16000;

let asrPipelinePromise = null;
let asrPipelineModel = null;

async function getRecognizer(model, onProgress) {
  // Rebuild the pipeline if the requested model changed.
  if (!asrPipelinePromise || asrPipelineModel !== model) {
    asrPipelineModel = model;
    const { pipeline, env } = await import('@xenova/transformers');
    // Pull weights from the CDN rather than expecting local files.
    env.allowLocalModels = false;
    asrPipelinePromise = pipeline('automatic-speech-recognition', model, {
      progress_callback: onProgress,
    });
  }
  return asrPipelinePromise;
}

/**
 * Decode the file's audio track and resample to 16 kHz mono Float32 —
 * the format Whisper expects. Works for mp4/mkv/mov/webm/mp3/wav because the
 * browser's decodeAudioData handles the container's audio stream.
 */
export async function extractAudio(file) {
  if (typeof window === 'undefined') {
    throw new Error('extractAudio must run in the browser.');
  }
  const arrayBuffer = await file.arrayBuffer();

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio API is not available in this environment.');

  const decodeCtx = new AudioCtx();
  let decoded;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    throw new Error(`Could not read audio from "${file.name}". The file may have no audio track or an unsupported codec. (${err.message})`);
  } finally {
    if (decodeCtx.close) decodeCtx.close();
  }

  // Resample + downmix to mono @ 16 kHz using an OfflineAudioContext.
  const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0); // Float32Array, mono, 16 kHz
}

// Cheap script-based heuristic so the UI can show *a* detected language when the
// user chose auto-detect. The real recognition is done by Whisper; this only
// labels the result. Falls back to null when unsure.
function guessLanguageFromText(text) {
  if (!text) return null;
  if (/[぀-ヿ]/.test(text)) return 'ja';        // hiragana/katakana
  if (/[가-힯]/.test(text)) return 'ko';        // hangul
  if (/[一-鿿]/.test(text)) return 'zh';        // CJK ideographs (after JP check)
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
  if (/[àâçéèêëîïôûùüœ]/i.test(text)) return 'fr';
  if (/[äöüß]/i.test(text)) return 'de';
  if (/[a-z]/i.test(text)) return 'en';
  return null;
}

/**
 * Transcribe the media file into timed cues.
 * @returns {Promise<{cues: Array, detectedLanguage: string|null}>}
 */
export async function transcribeMedia(file, options = {}) {
  const {
    language = 'detect',
    model = DEFAULT_MODEL,
    onProgress,   // (fraction 0..1, stage string)
    onModelLoad,  // transformers progress_callback
  } = options;

  if (!file) throw new Error('No media file to transcribe. Import a video or audio file first.');
  if (!language || language === 'none') {
    throw new Error('Pick a source language or choose "Auto-detect" before transcribing.');
  }

  onProgress?.(0.05, 'Extracting audio');
  const audio = await extractAudio(file);

  onProgress?.(0.2, 'Loading speech model');
  const recognizer = await getRecognizer(model, onModelLoad);

  const runOptions = {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  };
  const forced = language !== 'detect';
  if (forced) {
    runOptions.language = WHISPER_LANGUAGE_NAMES[language] || language;
    runOptions.task = 'transcribe';
  }

  onProgress?.(0.35, forced ? 'Transcribing' : 'Detecting language & transcribing');
  const result = await recognizer(audio, runOptions);

  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  const cues = chunks
    .map((chunk, index) => {
      const text = (chunk.text || '').trim();
      if (!text) return null;
      const start = Number(chunk.timestamp?.[0]) || 0;
      const end = Number(chunk.timestamp?.[1]) || start + 2;
      return { id: `asr-${index + 1}`, start, end, original: text };
    })
    .filter(Boolean);

  // If the model returned only a single blob of text with no chunk timings,
  // still surface it as one cue rather than silently failing.
  if (!cues.length && result?.text?.trim()) {
    cues.push({ id: 'asr-1', start: 0, end: 4, original: result.text.trim() });
  }

  const detectedLanguage = forced
    ? language
    : guessLanguageFromText(result?.text || cues.map((c) => c.original).join(' '));

  onProgress?.(1, 'Done');
  return { cues, detectedLanguage };
}

export const SUPPORTED_TRANSCRIBE_LANGUAGES = Object.keys(WHISPER_LANGUAGE_NAMES);

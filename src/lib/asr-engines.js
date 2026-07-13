'use client';

/**
 * The supported transcription engine:
 *
 *   1. 'node-whisper'  — LOCAL Node-side Whisper via the /api/transcribe route.
 *                        FFmpeg prepares real media and the selected model is
 *                        cached locally after its first download.
 *
 * The legacy browser-side Transformers.js implementation remains in
 * src/lib/transcribe.js for reference, but it is deliberately not a production
 * fallback: it cannot reliably decode real-world MP4/MKV audio and its Node
 * shims are incompatible with this Next.js client bundle.
 */

// Send the imported media to the local Node-side Whisper backend. In Electron we use
// the original desktop path; in a normal browser we upload the File as a
// bridge to the same local route.
async function transcribeWithLocalEngine(file, { language, quality, mediaPath, samplePath, onProgress }) {
  const lang = language === 'detect' ? 'auto' : language;
  let request;

  if (mediaPath || samplePath) {
    onProgress?.(0.08, mediaPath ? 'Sending desktop path to local engine' : 'Running sample smoke test');
    request = fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: mediaPath, samplePath, language: lang, quality }),
    });
  } else if (file) {
    onProgress?.(0.08, 'Uploading audio to local engine');
    const form = new FormData();
    form.append('file', file);
    form.append('language', lang);
    form.append('quality', quality);
    request = fetch('/api/transcribe', { method: 'POST', body: form });
  } else {
    throw new Error('No media file or sample path was provided for local transcription.');
  }

  // The server can't stream progress for a single local recognition run, so tick a
  // soft heartbeat while we wait — otherwise long jobs look frozen.
  let heartbeat = 0.1;
  const ticker = setInterval(() => {
    heartbeat = Math.min(0.8, heartbeat + 0.02);
    onProgress?.(heartbeat, 'Transcribing with local Whisper');
  }, 2000);

  let res;
  try {
    res = await request;
  } finally {
    clearInterval(ticker);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Local transcription failed (${res.status}).`);
    err.code = data.code || null;
    err.status = res.status;
    err.job = data.job || null;
    err.statusInfo = data.status || null;
    throw err;
  }
  onProgress?.(0.85, 'Reading cues');
  const data = await res.json();
  return {
    cues: data.cues || [],
    detectedLanguage: data.detectedLanguage || null,
    engine: 'node-whisper',
    logPath: data.logPath || null,
    status: data.status || null,
    job: data.job || null,
  };
}

/**
 * Transcribe a media File with the chosen engine.
 * Local Node-side Whisper is intentionally the only supported production path.
 *
 * @param {File|null} file
 * @param {{engine?:string, language?:string, quality?:string,
 *          mediaPath?:string, samplePath?:string,
 *          onProgress?:(fraction:number, stage:string)=>void,
 *          onEngine?:(engineId:string)=>void}} options
 */
export async function transcribeVideo(file, options = {}) {
  const {
    engine = 'node-whisper',
    language = 'detect',
    quality = 'balanced',
    mediaPath = '',
    samplePath = '',
    onProgress,
    onEngine,
  } = options;

  if (engine !== 'node-whisper') {
    const error = new Error('In-browser transcription is disabled for imported media. Use the local server-side Whisper engine to process MP4 files reliably.');
    error.code = 'UNSUPPORTED_ENGINE';
    throw error;
  }

  onEngine?.('node-whisper');
  return transcribeWithLocalEngine(file, { language, quality, mediaPath, samplePath, onProgress });
}

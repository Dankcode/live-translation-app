import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { env, pipeline } from '@xenova/transformers';

const require = createRequire(import.meta.url);
const DEFAULT_HOME = path.join(os.homedir(), '.lingoloop');
const SAMPLE_RATE = 16000;
const WINDOW_SECONDS = 30;
const WINDOW_OVERLAP_SECONDS = 5;
const MIN_CUE_SECONDS = 0.25;
const MAX_NEW_TOKENS = 128;

const QUALITY_MODELS = {
  fast: { id: 'Xenova/whisper-tiny', label: 'Tiny' },
  balanced: { id: 'Xenova/whisper-base', label: 'Base' },
  best: { id: 'Xenova/whisper-small', label: 'Small' },
};

const recognizerPromises = new Map();

function pathExists(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath));
  } catch {
    return false;
  }
}

function firstExisting(candidates) {
  return candidates.find(pathExists) || null;
}

function appRoot() {
  return process.cwd();
}

function packageValuePath(packageValue) {
  const candidate = typeof packageValue === 'string' ? packageValue : packageValue?.path;
  return typeof candidate === 'string' ? candidate : null;
}

function bundledFfmpegPath() {
  try {
    return packageValuePath(require('ffmpeg-static'));
  } catch {
    return null;
  }
}

function bundledFfprobePath() {
  try {
    return packageValuePath(require('@ffprobe-installer/ffprobe'));
  } catch {
    return null;
  }
}

function modelForQuality(quality = 'fast') {
  return QUALITY_MODELS[quality] || QUALITY_MODELS.fast;
}

function remoteModelDownloadsEnabled() {
  return process.env.LINGOLOOP_OFFLINE !== '1' && process.env.LINGOLOOP_ALLOW_REMOTE_MODELS !== 'false';
}

function modelCachePath(modelCacheDir, modelId) {
  return path.join(modelCacheDir, ...modelId.split('/'));
}

function modelIsCached(modelCacheDir, modelId) {
  const directory = modelCachePath(modelCacheDir, modelId);
  try {
    return fs.statSync(directory).isDirectory() && fs.readdirSync(directory).length > 0;
  } catch {
    return false;
  }
}

function configureTransformers(modelCacheDir) {
  fs.mkdirSync(modelCacheDir, { recursive: true });
  env.cacheDir = modelCacheDir;
  env.allowLocalModels = true;
  env.allowRemoteModels = remoteModelDownloadsEnabled();
  env.useFS = true;
  env.useFSCache = true;
}

export function lingoloopPaths() {
  const home = process.env.LINGOLOOP_HOME || DEFAULT_HOME;
  const binDir = path.join(home, 'bin');
  const modelsDir = process.env.LINGOLOOP_MODEL_DIR || path.join(home, 'models');
  const logsDir = process.env.LINGOLOOP_LOG_DIR || path.join(home, 'logs');
  const tempDir = process.env.LINGOLOOP_TEMP_DIR || path.join(home, 'tmp');
  const modelCacheDir = path.join(modelsDir, 'transformers');
  const bundledFfmpeg = bundledFfmpegPath();
  const bundledFfprobe = bundledFfprobePath();
  const ffmpeg = process.env.LINGOLOOP_FFMPEG_PATH || firstExisting([
    path.join(appRoot(), 'bin', 'ffmpeg'),
    bundledFfmpeg,
    path.join(binDir, 'ffmpeg'),
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ]);
  const ffprobe = process.env.LINGOLOOP_FFPROBE_PATH || firstExisting([
    path.join(appRoot(), 'bin', 'ffprobe'),
    bundledFfprobe,
    path.join(binDir, 'ffprobe'),
    '/opt/homebrew/bin/ffprobe',
    '/usr/local/bin/ffprobe',
    '/usr/bin/ffprobe',
  ]);

  return { binDir, ffmpeg, ffprobe, home, logsDir, modelCacheDir, modelsDir, tempDir };
}

export function getWhisperStatus(quality = 'fast') {
  const paths = lingoloopPaths();
  const model = modelForQuality(quality);
  const cached = modelIsCached(paths.modelCacheDir, model.id);
  const downloadable = remoteModelDownloadsEnabled();
  const checks = {
    ffmpeg: pathExists(paths.ffmpeg),
    ffprobe: pathExists(paths.ffprobe),
    recognizer: typeof pipeline === 'function',
    model: cached || downloadable,
  };

  return {
    ready: Object.values(checks).every(Boolean),
    checks,
    model: {
      id: model.id,
      label: model.label,
      cached,
      downloadOnDemand: !cached && downloadable,
    },
    paths: {
      ffmpeg: paths.ffmpeg,
      ffprobe: paths.ffprobe,
      recognizer: '@xenova/transformers',
      // Keep this alias for older API consumers while the engine moves away
      // from a compiled whisper-cli binary.
      whisper: '@xenova/transformers',
      model: model.id,
      modelCacheDir: paths.modelCacheDir,
      modelsDir: paths.modelsDir,
      logsDir: paths.logsDir,
      tempDir: paths.tempDir,
      binDir: paths.binDir,
    },
  };
}

function ensureInsideWritableTemp(outputDir) {
  const resolved = path.resolve(outputDir);
  const allowedRoots = [
    path.resolve(lingoloopPaths().tempDir),
    path.resolve(os.tmpdir()),
  ];
  if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error('Output directory must be inside the LingoLoop temp folder.');
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

export function buildWhisperJobPlan({ mediaPath, language = 'auto', quality = 'fast', jobId = `job-${Date.now()}` }) {
  if (!mediaPath || !path.isAbsolute(mediaPath)) {
    throw new Error('An absolute media path is required for local transcription.');
  }

  const status = getWhisperStatus(quality);
  const paths = lingoloopPaths();
  const outputDir = ensureInsideWritableTemp(path.join(paths.tempDir, jobId));
  const wavPath = path.join(outputDir, 'audio.wav');
  const logPath = path.join(paths.logsDir, `${jobId}.log`);
  const model = modelForQuality(quality);
  const lang = language === 'detect' ? 'auto' : language || 'auto';

  return {
    jobId,
    logPath,
    outputDir,
    wavPath,
    status,
    model,
    language: lang,
    commands: {
      probe: {
        bin: paths.ffprobe,
        args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', mediaPath],
      },
      extractAudio: {
        bin: paths.ffmpeg,
        args: ['-nostdin', '-i', mediaPath, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', '-f', 'wav', wavPath],
      },
    },
  };
}

function appendJobLog(logPath, entry) {
  if (!logPath) return;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
}

function stageFailure(stage, message) {
  const error = new Error(message);
  error.stage = stage;
  error.code = 'NATIVE_STAGE_FAILED';
  return error;
}

function runCommand({ bin, args }, stage, logPath) {
  return new Promise((resolve, reject) => {
    if (!bin || !pathExists(bin)) {
      appendJobLog(logPath, { stage, event: 'unavailable', message: `${stage} binary is not installed.` });
      reject(stageFailure(stage, `${stage} binary is not installed.`));
      return;
    }

    appendJobLog(logPath, { stage, event: 'start', argv: [bin, ...args] });
    const startedAt = Date.now();
    const child = spawn(bin, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      appendJobLog(logPath, { stage, event: 'spawn-error', durationMs: Date.now() - startedAt, message: error.message });
      reject(stageFailure(stage, `${stage} could not start: ${error.message}`));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      const durationMs = Date.now() - startedAt;
      appendJobLog(logPath, { stage, event: 'exit', code, durationMs, stderrTail: stderr.slice(-1200) });
      if (code === 0) resolve({ stdout, stderr, durationMs });
      else reject(stageFailure(stage, `${stage} failed with exit code ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

function readPcm16MonoWav(wavPath) {
  const wav = fs.readFileSync(wavPath);
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw stageFailure('audio', 'FFmpeg did not produce a valid WAV file.');
  }

  let offset = 12;
  let format = null;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString('ascii', offset, offset + 4);
    const chunkLength = wav.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkStart + chunkLength > wav.length) break;

    if (chunkId === 'fmt ' && chunkLength >= 16) {
      format = {
        encoding: wav.readUInt16LE(chunkStart),
        channels: wav.readUInt16LE(chunkStart + 2),
        sampleRate: wav.readUInt32LE(chunkStart + 4),
        bitsPerSample: wav.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkStart;
      dataLength = chunkLength;
      break;
    }
    offset = chunkStart + chunkLength + (chunkLength % 2);
  }

  if (!format || dataOffset < 0 || format.encoding !== 1 || format.channels !== 1 || format.sampleRate !== SAMPLE_RATE || format.bitsPerSample !== 16) {
    throw stageFailure('audio', 'Expected mono 16 kHz 16-bit PCM audio from FFmpeg.');
  }

  const sampleCount = Math.floor(dataLength / 2);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = wav.readInt16LE(dataOffset + (index * 2)) / 32768;
  }
  return samples;
}

function createModelProgressLogger(logPath, modelId) {
  let lastPercent = -10;
  return (event) => {
    const progress = Number(event?.progress);
    const percent = Number.isFinite(progress) ? Math.floor(progress) : null;
    if (event?.status === 'progress' && percent !== null && percent < lastPercent + 10 && percent !== 100) return;
    if (percent !== null) lastPercent = percent;
    appendJobLog(logPath, {
      stage: 'model',
      event: event?.status || 'update',
      model: modelId,
      file: event?.file || null,
      percent,
    });
  };
}

async function getRecognizer(model, modelCacheDir, logPath) {
  configureTransformers(modelCacheDir);
  const existing = recognizerPromises.get(model.id);
  if (existing) return existing;

  const pending = pipeline('automatic-speech-recognition', model.id, {
    quantized: true,
    progress_callback: createModelProgressLogger(logPath, model.id),
  });
  recognizerPromises.set(model.id, pending);
  try {
    return await pending;
  } catch (error) {
    recognizerPromises.delete(model.id);
    throw error;
  }
}

export function transformerOutputToCues(output, durationSeconds = 0) {
  const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
  const fallbackText = String(output?.text || '').trim();
  const rawCues = chunks.length ? chunks : (fallbackText ? [{ text: fallbackText, timestamp: [0, durationSeconds] }] : []);

  return rawCues
    .map((chunk, index) => {
      const original = compactRepeatedWords(String(chunk?.text || '').trim());
      if (!original) return null;
      const timestamp = Array.isArray(chunk?.timestamp) ? chunk.timestamp : [];
      const start = Number.isFinite(Number(timestamp[0])) ? Math.max(0, Number(timestamp[0])) : 0;
      const candidateEnd = Number(timestamp[1]);
      const end = Number.isFinite(candidateEnd) && candidateEnd > start
        ? candidateEnd
        : Math.max(start + 0.1, durationSeconds);
      return {
        id: `node-whisper-${index + 1}`,
        start,
        end,
        original,
        confidence: 0.86,
      };
    })
    .filter(Boolean);
}

function compactRepeatedWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const compact = [];
  let previous = '';
  let repeats = 0;

  for (const word of words) {
    const normalized = word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (normalized && normalized === previous) {
      repeats += 1;
      if (repeats > 2) continue;
    } else {
      previous = normalized;
      repeats = 0;
    }
    compact.push(word);
  }
  return compact.join(' ');
}

function audioWindows(samples) {
  const windowSamples = WINDOW_SECONDS * SAMPLE_RATE;
  const stepSamples = (WINDOW_SECONDS - WINDOW_OVERLAP_SECONDS) * SAMPLE_RATE;
  const windows = [];
  for (let offset = 0; offset < samples.length; offset += stepSamples) {
    windows.push({
      offsetSeconds: offset / SAMPLE_RATE,
      samples: samples.subarray(offset, Math.min(samples.length, offset + windowSamples)),
    });
    if (offset + windowSamples >= samples.length) break;
  }
  return windows;
}

function normalizedWords(text) {
  return String(text || '')
    .split(/\s+/)
    .map((word) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(Boolean);
}

function trimRepeatedPrefix(previousText, currentText) {
  const previousWords = normalizedWords(previousText);
  const currentRawWords = String(currentText || '').split(/\s+/).filter(Boolean);
  const currentWords = normalizedWords(currentText);
  const maxOverlap = Math.min(10, previousWords.length, currentWords.length);

  for (let length = maxOverlap; length >= 2; length -= 1) {
    const previousSuffix = previousWords.slice(-length).join(' ');
    const currentPrefix = currentWords.slice(0, length).join(' ');
    if (previousSuffix === currentPrefix) return currentRawWords.slice(length).join(' ');
  }
  return currentText;
}

function stitchWindowCues(cues, durationSeconds) {
  const sorted = cues
    .map((cue) => ({
      ...cue,
      start: Math.max(0, Math.min(durationSeconds, cue.start)),
      end: Math.max(0, Math.min(durationSeconds, cue.end)),
    }))
    .filter((cue) => cue.end > cue.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const stitched = [];
  for (const rawCue of sorted) {
    const cue = { ...rawCue };
    const previous = stitched[stitched.length - 1];
    if (previous && cue.start <= previous.end + WINDOW_OVERLAP_SECONDS) {
      cue.original = trimRepeatedPrefix(previous.original, cue.original).trim();
      if (!cue.original) continue;
    }
    if (previous && cue.start < previous.end) {
      const boundary = Math.max(
        previous.start + 0.08,
        Math.min(cue.end - 0.08, (previous.end + cue.start) / 2),
      );
      if (cue.end - boundary < MIN_CUE_SECONDS) continue;
      previous.end = boundary;
      cue.start = boundary;
    }
    if (cue.end - cue.start >= MIN_CUE_SECONDS) stitched.push(cue);
  }
  return stitched;
}

async function recognizeAudio(plan) {
  const samples = readPcm16MonoWav(plan.wavPath);
  const durationSeconds = samples.length / SAMPLE_RATE;
  const recognizer = await getRecognizer(plan.model, lingoloopPaths().modelCacheDir, plan.logPath);
  const windows = audioWindows(samples);
  appendJobLog(plan.logPath, {
    stage: 'recognize',
    event: 'start',
    model: plan.model.id,
    durationSeconds,
    windows: windows.length,
  });
  const startedAt = Date.now();
  const options = {
    return_timestamps: true,
    max_new_tokens: MAX_NEW_TOKENS,
    task: 'transcribe',
  };
  if (plan.language !== 'auto') options.language = plan.language;
  const cues = [];
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    const ownershipStart = index === 0
      ? 0
      : window.offsetSeconds + (WINDOW_OVERLAP_SECONDS / 2);
    const ownershipEnd = index === windows.length - 1
      ? durationSeconds
      : window.offsetSeconds + WINDOW_SECONDS - (WINDOW_OVERLAP_SECONDS / 2);
    appendJobLog(plan.logPath, {
      stage: 'recognize',
      event: 'window-start',
      index: index + 1,
      total: windows.length,
      offsetSeconds: window.offsetSeconds,
      ownershipStart,
      ownershipEnd,
    });
    // Transformers.js augments the options object with Whisper prompt tokens.
    // Each window needs a fresh object or the next call rejects that carried state.
    const output = await recognizer(window.samples, { ...options });
    const windowDuration = window.samples.length / SAMPLE_RATE;
    const rawWindowCues = transformerOutputToCues(output, windowDuration).map((cue, cueIndex) => ({
      ...cue,
      id: `node-whisper-${index + 1}-${cueIndex + 1}`,
      start: cue.start + window.offsetSeconds,
      end: cue.end + window.offsetSeconds,
    }));
    // Each overlapping window owns only its central time region. The overlap
    // gives Whisper context across a 30-second boundary without emitting the
    // same spoken phrase twice.
    const windowCues = rawWindowCues.filter((cue) => {
      const midpoint = cue.start + ((cue.end - cue.start) / 2);
      return midpoint >= ownershipStart
        && (index === windows.length - 1 ? midpoint <= ownershipEnd : midpoint < ownershipEnd);
    });
    cues.push(...windowCues);
    appendJobLog(plan.logPath, {
      stage: 'recognize',
      event: 'window-complete',
      index: index + 1,
      total: windows.length,
      rawCueCount: rawWindowCues.length,
      cueCount: windowCues.length,
    });
  }
  const stitchedCues = stitchWindowCues(cues, durationSeconds);
  const durationMs = Date.now() - startedAt;
  appendJobLog(plan.logPath, { stage: 'recognize', event: 'complete', durationMs, cueCount: stitchedCues.length });
  return { cues: stitchedCues, durationMs };
}

export async function runWhisperJob(jobSpec) {
  const plan = buildWhisperJobPlan(jobSpec);
  if (!plan.status.ready) {
    const checks = plan.status?.checks && typeof plan.status.checks === 'object' ? plan.status.checks : {};
    const missing = Object.entries(checks).filter(([, ready]) => !ready).map(([name]) => name);
    const error = stageFailure('preflight', `Local transcription is not ready. Missing: ${missing.join(', ')}.`);
    error.jobId = plan.jobId;
    error.logPath = plan.logPath;
    throw error;
  }

  const stages = [];
  try {
    appendJobLog(plan.logPath, { event: 'job-start', jobId: plan.jobId, outputDir: plan.outputDir, model: plan.model.id });

    const probe = await runCommand(plan.commands.probe, 'ffprobe', plan.logPath);
    stages.push({ id: 'ffprobe', label: 'Probe media', durationMs: probe.durationMs });

    const audio = await runCommand(plan.commands.extractAudio, 'ffmpeg', plan.logPath);
    stages.push({ id: 'ffmpeg', label: 'Extract mono 16 kHz audio', durationMs: audio.durationMs });

    const recognized = await recognizeAudio(plan);
    stages.push({ id: 'recognize', label: 'Recognize speech with local Whisper', durationMs: recognized.durationMs });
    stages.push({ id: 'cues', label: 'Parse timestamped cues', durationMs: 0, count: recognized.cues.length });
    appendJobLog(plan.logPath, { event: 'job-complete', cueCount: recognized.cues.length });
    return {
      cues: recognized.cues,
      detectedLanguage: plan.language === 'auto' ? null : plan.language,
      plan,
      stages,
    };
  } catch (error) {
    error.jobId = error.jobId || plan.jobId;
    error.logPath = error.logPath || plan.logPath;
    appendJobLog(plan.logPath, { event: 'job-failed', stage: error.stage || 'unknown', message: error.message });
    throw error;
  } finally {
    // Keep disk usage low: the extracted WAV (~2 MB per minute of video) is
    // only needed during recognition. Remove the whole job temp dir; the
    // small JSONL log in logsDir is kept for debugging.
    try {
      fs.rmSync(plan.outputDir, { recursive: true, force: true });
    } catch {
      // Best effort — never fail the job over cleanup.
    }
    cleanupStaleJobDirs(plan.outputDir);
  }
}

// Sweep any temp job dirs older than a day that a crashed run left behind.
function cleanupStaleJobDirs(currentOutputDir) {
  try {
    const { tempDir } = lingoloopPaths();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(tempDir)) {
      const full = path.join(tempDir, entry);
      if (full === currentOutputDir) continue;
      const stats = fs.statSync(full);
      if (stats.isDirectory() && stats.mtimeMs < cutoff) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    }
  } catch {
    // Best effort.
  }
}

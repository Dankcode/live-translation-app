import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_MODEL_NAME = 'ggml-base.bin';
const DEFAULT_HOME = path.join(os.homedir(), '.lingoloop');

const QUALITY_MODELS = {
  fast: 'ggml-base.bin',
  balanced: 'ggml-small.bin',
  best: 'ggml-large-v3.bin',
};

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

export function lingoloopPaths() {
  const home = process.env.LINGOLOOP_HOME || DEFAULT_HOME;
  const modelsDir = process.env.LINGOLOOP_MODEL_DIR || path.join(home, 'models');
  const logsDir = process.env.LINGOLOOP_LOG_DIR || path.join(home, 'logs');
  const tempDir = process.env.LINGOLOOP_TEMP_DIR || path.join(home, 'tmp');
  const ffmpeg = process.env.LINGOLOOP_FFMPEG_PATH || firstExisting([
    path.join(appRoot(), 'bin', 'ffmpeg'),
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ]);
  const ffprobe = process.env.LINGOLOOP_FFPROBE_PATH || firstExisting([
    path.join(appRoot(), 'bin', 'ffprobe'),
    '/opt/homebrew/bin/ffprobe',
    '/usr/local/bin/ffprobe',
    '/usr/bin/ffprobe',
  ]);
  const whisper = process.env.LINGOLOOP_WHISPER_PATH || firstExisting([
    path.join(appRoot(), 'bin', 'whisper-cli'),
    path.join(appRoot(), 'bin', 'whisper.cpp', 'whisper-cli'),
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
  ]);

  return { ffmpeg, ffprobe, home, logsDir, modelsDir, tempDir, whisper };
}

export function modelPathForQuality(quality = 'fast') {
  const { modelsDir } = lingoloopPaths();
  return path.join(modelsDir, QUALITY_MODELS[quality] || DEFAULT_MODEL_NAME);
}

export function getWhisperStatus(quality = 'fast') {
  const paths = lingoloopPaths();
  const model = modelPathForQuality(quality);
  const checks = {
    ffmpeg: pathExists(paths.ffmpeg),
    ffprobe: pathExists(paths.ffprobe),
    whisper: pathExists(paths.whisper),
    model: pathExists(model),
  };
  const ready = Object.values(checks).every(Boolean);
  return {
    ready,
    checks,
    paths: {
      ffmpeg: paths.ffmpeg,
      ffprobe: paths.ffprobe,
      whisper: paths.whisper,
      model,
      modelsDir: paths.modelsDir,
      logsDir: paths.logsDir,
      tempDir: paths.tempDir,
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
    throw new Error('A desktop file path is required for local whisper.cpp transcription.');
  }

  const status = getWhisperStatus(quality);
  const paths = lingoloopPaths();
  const outputDir = ensureInsideWritableTemp(path.join(paths.tempDir, jobId));
  const wavPath = path.join(outputDir, 'audio.wav');
  const whisperOut = path.join(outputDir, 'whisper');
  const modelPath = modelPathForQuality(quality);
  const lang = language === 'detect' ? 'auto' : language || 'auto';

  return {
    jobId,
    outputDir,
    wavPath,
    whisperJsonPath: `${whisperOut}.json`,
    status,
    commands: {
      probe: {
        bin: paths.ffprobe,
        args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', mediaPath],
      },
      extractAudio: {
        bin: paths.ffmpeg,
        args: ['-i', mediaPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', wavPath],
      },
      whisper: {
        bin: paths.whisper,
        args: ['-m', modelPath, '-f', wavPath, '-l', lang, '-oj', '-ml', '1', '--output-file', whisperOut],
      },
    },
  };
}

function runCommand({ bin, args }, stage) {
  return new Promise((resolve, reject) => {
    if (!bin || !pathExists(bin)) {
      reject(new Error(`${stage} binary is not installed.`));
      return;
    }

    const child = spawn(bin, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${stage} failed with exit code ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

export function whisperJsonToCues(payload) {
  const segments = Array.isArray(payload?.transcription)
    ? payload.transcription
    : Array.isArray(payload?.segments)
      ? payload.segments
      : [];

  return segments
    .map((segment, index) => {
      const original = String(segment.text || segment.tokens?.map((token) => token.text).join('') || '').trim();
      if (!original) return null;
      return {
        id: `whisper-${index + 1}`,
        start: Number(segment.offsets?.from ?? segment.start ?? 0) / (segment.offsets ? 1000 : 1),
        end: Number(segment.offsets?.to ?? segment.end ?? 0) / (segment.offsets ? 1000 : 1),
        original,
        confidence: Number(segment.confidence ?? 0.86),
      };
    })
    .filter(Boolean);
}

export async function runWhisperJob(jobSpec) {
  const plan = buildWhisperJobPlan(jobSpec);
  if (!plan.status.ready) {
    const missing = Object.entries(plan.status.checks).filter(([, ready]) => !ready).map(([name]) => name);
    throw new Error(`Local transcription is not ready. Missing: ${missing.join(', ')}.`);
  }

  await runCommand(plan.commands.probe, 'ffprobe');
  await runCommand(plan.commands.extractAudio, 'ffmpeg audio extraction');
  await runCommand(plan.commands.whisper, 'whisper.cpp');

  const raw = fs.readFileSync(plan.whisperJsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  return { cues: whisperJsonToCues(parsed), plan };
}

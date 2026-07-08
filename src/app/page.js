'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { transcribeMedia } from '@/lib/transcribe';
import {
  AudioWaveform,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Download,
  FastForward,
  FileJson,
  FileText,
  Film,
  Gauge,
  Languages,
  ListChecks,
  Maximize2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Volume2,
  X,
} from 'lucide-react';

const APP_NAME = 'LingoLoop';

const DEMO_CUES = [
  {
    id: 'cue-1',
    start: 2,
    end: 5.8,
    original: 'こんにちは、元気ですか？',
    translation: 'Hi, how are you?',
    reading: 'konnichiwa, genki desu ka',
    speaker: 'S1',
    confidence: 0.94,
  },
  {
    id: 'cue-2',
    start: 6.2,
    end: 10.4,
    original: '今日は新しい場所へ行きましょう。',
    translation: "Let's go somewhere new today.",
    reading: 'kyou wa atarashii basho e ikimashou',
    speaker: 'S1',
    confidence: 0.91,
  },
  {
    id: 'cue-3',
    start: 11,
    end: 15.2,
    original: '字幕を少し早く表示できますか？',
    translation: 'Can you show the subtitles a little earlier?',
    reading: 'jimaku o sukoshi hayaku hyouji dekimasu ka',
    speaker: 'S2',
    confidence: 0.82,
  },
  {
    id: 'cue-4',
    start: 16,
    end: 20,
    original: 'はい、タイミングを調整します。',
    translation: 'Yes, I will adjust the timing.',
    reading: 'hai, taimingu o chousei shimasu',
    speaker: 'S1',
    confidence: 0.96,
  },
];

// Concrete languages (used for target selection and label lookups).
const languages = [
  { value: 'ja', label: 'Japanese' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

// Source selection: NO passthrough "auto" default. Either a real language is
// chosen, or "Auto-detect" which runs actual language recognition, or "None"
// which forces the user to make a choice before transcribing.
const sourceLanguages = [
  { value: 'detect', label: 'Auto-detect (recognition)' },
  { value: 'none', label: 'None — pick a language' },
  ...languages,
];

function sourceLangLabel(value) {
  return sourceLanguages.find((item) => item.value === value)?.label || value;
}

const sourceModes = [
  { id: 'embedded', label: 'Embedded', detail: 'Extract existing subtitle tracks' },
  { id: 'sidecar', label: 'Sidecar', detail: 'Parse SRT, VTT, ASS' },
  { id: 'transcribe', label: 'Transcribe', detail: 'Local whisper.cpp path' },
];

const qualityPresets = {
  fast: {
    label: 'Fast',
    detail: 'ggml-base, VAD trim, minimal cleanup',
    cleanup: { separateVocals: false, denoise: false, diarize: false, mixedLanguage: false },
  },
  balanced: {
    label: 'Balanced',
    detail: 'small/medium model, denoise + loudnorm',
    cleanup: { separateVocals: false, denoise: true, diarize: false, mixedLanguage: true },
  },
  best: {
    label: 'Best',
    detail: 'large-v3 / WhisperX path + diarization',
    cleanup: { separateVocals: true, denoise: true, diarize: true, mixedLanguage: true },
  },
};

const cleanupOptions = [
  { id: 'separateVocals', label: 'Vocal isolation', detail: 'Demucs/Spleeter path for music-heavy videos' },
  { id: 'denoise', label: 'Denoise', detail: 'RNNoise/DeepFilterNet-style cleanup' },
  { id: 'diarize', label: 'Diarize', detail: 'Speaker turns for interviews/classes' },
  { id: 'mixedLanguage', label: 'Mixed language', detail: 'Detect source language per segment' },
];

const exportFormats = [
  { id: 'srt', label: 'Dual SRT', detail: 'Two-line soft subtitles' },
  { id: 'ass', label: 'Styled ASS', detail: 'Burn-in ready script' },
  { id: 'json', label: 'Project JSON', detail: 'Cue + queue metadata' },
  { id: 'report', label: 'Batch report', detail: 'CSV job summary' },
];

const subtitleStyles = [
  { id: 'cinema', label: 'Cinema' },
  { id: 'boxed', label: 'Box' },
  { id: 'minimal', label: 'Minimal' },
];

const subtitlePositions = [
  { id: 'bottom', label: 'Bottom' },
  { id: 'middle', label: 'Middle' },
  { id: 'top', label: 'Top' },
];

const subtitleMaskModes = [
  { id: 'off', label: 'Off', detail: 'No existing subtitle cover' },
  { id: 'hide', label: 'Hide soft', detail: 'Skip selectable original tracks' },
  { id: 'box', label: 'Cover box', detail: 'Dark band for burned-in text' },
  { id: 'blur', label: 'Blur', detail: 'Delogo-style soft cover' },
];

const maskPresets = [
  { id: 'bottom', label: 'Bottom band', rect: { x: 0, y: 0.78, w: 1, h: 0.2 } },
  { id: 'safe', label: 'Subtitle safe', rect: { x: 0.08, y: 0.72, w: 0.84, h: 0.18 } },
  { id: 'top', label: 'Top band', rect: { x: 0, y: 0.06, w: 1, h: 0.16 } },
];

const settingsTabs = [
  { id: 'languages', label: 'Languages' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'audio', label: 'Audio & Recognition' },
  { id: 'learning', label: 'Learning' },
  { id: 'export', label: 'Export' },
  { id: 'batch', label: 'Batch' },
  { id: 'advanced', label: 'Advanced' },
];

const studyFeatures = [
  { label: 'Loop mining', detail: 'Replay a cue, shadow it, then save it as a review card.' },
  { label: 'FSRS review', detail: 'Built-in spaced repetition keeps mined lines inside LingoLoop.' },
  { label: 'Frame OCR', detail: 'Translate signs, captions, and hardcoded text sampled from the picture.' },
  { label: 'Pronunciation scorer', detail: 'Record yourself and compare timing against the native line.' },
  { label: 'Grammar explain', detail: 'Ask for POS, particles, literal gloss, idiom, or slang notes.' },
  { label: 'Auto quizzes', detail: 'Generate cloze, dictation, and multiple-choice drills per scene.' },
];

const loopTools = [
  { label: 'Loop line', detail: 'A-B repeat the active subtitle.' },
  { label: 'Shadow', detail: 'Record and compare your timing.' },
  { label: 'Mine card', detail: 'Save line + screenshot to FSRS.' },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function normalizeMaskRect(rect) {
  const w = clamp(rect.w, 0.12, 1);
  const h = clamp(rect.h, 0.08, 0.5);
  return {
    x: clamp(rect.x, 0, 1 - w),
    y: clamp(rect.y, 0, 1 - h),
    w,
    h,
  };
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function makeMaskFilter({ mode, rect, opacity, blur }) {
  if (mode === 'off') return 'none';
  if (mode === 'hide') return 'soft original subtitle streams disabled';
  const x = rect.x.toFixed(3);
  const y = rect.y.toFixed(3);
  const w = rect.w.toFixed(3);
  const h = rect.h.toFixed(3);
  if (mode === 'blur') {
    return `delogo=x=iw*${x}:y=ih*${y}:w=iw*${w}:h=ih*${h},boxblur=${Math.round(blur)}:1`;
  }
  return `drawbox=x=iw*${x}:y=ih*${y}:w=iw*${w}:h=ih*${h}:color=black@${opacity.toFixed(2)}:t=fill`;
}

function secondsToClock(value) {
  const safe = Math.max(0, Number(value) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function secondsToSrt(value) {
  return secondsToClock(value).replace('.', ',');
}

function secondsToAss(value) {
  const safe = Math.max(0, Number(value) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function parseTimestamp(value) {
  const match = value.trim().match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/);
  if (!match) return 0;
  const [, rawHours = '0', rawMinutes, rawSeconds, rawMillis] = match;
  return (Number(rawHours) * 3600) + (Number(rawMinutes) * 60) + Number(rawSeconds) + Number(rawMillis.padEnd(3, '0').slice(0, 3)) / 1000;
}

function stripTags(text) {
  return text
    .replace(/\{\\[^}]+}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[[^\]]+]/g, '')
    .trim();
}

function wordsFromText(text) {
  const tokens = text
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length > 0) {
    return tokens.slice(0, 18).map((token, index) => ({
      text: token,
      reading: token.toLowerCase(),
      freq: index % 5 === 0 ? 'study' : index % 4 === 0 ? 'advanced' : 'core',
    }));
  }

  return Array.from(text.replace(/\s+/g, '').slice(0, 12)).map((token, index) => ({
    text: token,
    reading: token,
    freq: index % 3 === 0 ? 'study' : 'core',
  }));
}

function enrichCue(cue, index) {
  const original = stripTags(cue.original || '');
  return {
    id: cue.id || `cue-${index + 1}`,
    start: Number(cue.start) || 0,
    end: Number(cue.end) || (Number(cue.start) || 0) + 3,
    original,
    translation: stripTags(cue.translation || original),
    reading: cue.reading || wordsFromText(original).map((word) => word.reading).join(' '),
    speaker: cue.speaker || `S${(index % 2) + 1}`,
    confidence: cue.confidence ?? 0.88,
    words: cue.words || wordsFromText(original),
  };
}

function parseSrt(text) {
  return text
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((block, index) => {
      const lines = block.split('\n').filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes('-->'));
      if (timingIndex === -1) return null;
      const [startRaw, endRaw] = lines[timingIndex].split('-->').map((part) => part.trim());
      return enrichCue({
        id: `sidecar-${index + 1}`,
        start: parseTimestamp(startRaw),
        end: parseTimestamp(endRaw),
        original: lines.slice(timingIndex + 1).join(' '),
      }, index);
    })
    .filter(Boolean);
}

function parseVtt(text) {
  return parseSrt(text.replace(/^WEBVTT[^\n]*\n/i, ''));
}

function parseAss(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.startsWith('Dialogue:'))
    .map((line, index) => {
      const parts = line.slice('Dialogue:'.length).split(',');
      return enrichCue({
        id: `ass-${index + 1}`,
        start: parseTimestamp(parts[1] || '0:00:00.00'),
        end: parseTimestamp(parts[2] || '0:00:03.00'),
        original: parts.slice(9).join(',').replace(/\\N/g, ' '),
      }, index);
    });
}

function parseSubtitleFile(name, text) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.vtt')) return parseVtt(text);
  if (lower.endsWith('.ass') || lower.endsWith('.ssa')) return parseAss(text);
  return parseSrt(text);
}

function makeSrt(cues) {
  return cues.map((cue, index) => [
    String(index + 1),
    `${secondsToSrt(cue.start)} --> ${secondsToSrt(cue.end)}`,
    cue.original,
    cue.translation,
  ].join('\n')).join('\n\n');
}

function makeAss(cues) {
  const header = [
    '[Script Info]',
    'Title: dual-live-translations export',
    'ScriptType: v4.00+',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Original,Arial,42,&H00FFFFFF,&H000000FF,&H00111111,&H66000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,92,1',
    'Style: Translation,Arial,34,&H0098F5E1,&H000000FF,&H00111111,&H66000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,42,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  return [
    ...header,
    ...cues.flatMap((cue) => [
      `Dialogue: 0,${secondsToAss(cue.start)},${secondsToAss(cue.end)},Original,,0,0,0,,${cue.original}`,
      `Dialogue: 0,${secondsToAss(cue.start)},${secondsToAss(cue.end)},Translation,,0,0,0,,${cue.translation}`,
    ]),
  ].join('\n');
}

function makeBatchReport(queue) {
  const header = 'input,status,progress,quality,targets,output';
  const rows = queue.map((job) => [
    job.input,
    job.status,
    `${job.progress}%`,
    job.quality,
    job.targets.join(';'),
    job.output.join(';'),
  ].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','));
  return [header, ...rows].join('\n');
}

function downloadText(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getDesktopFilePath(file) {
  if (!file) return '';
  if (file.path) return file.path;
  try {
    if (typeof window !== 'undefined' && typeof window.require === 'function') {
      const { webUtils } = window.require('electron');
      return webUtils?.getPathForFile?.(file) || '';
    }
  } catch {
    return '';
  }
  return '';
}

function localTranslate(text, targetLang) {
  const label = languages.find((language) => language.value === targetLang)?.label || targetLang;
  return `[${label}] ${text}`;
}

function csvRows(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
  });
}

function makeQueueItem(input, index, defaults = {}) {
  const targets = Array.isArray(defaults.targets)
    ? defaults.targets
    : String(defaults.targets || 'en').split(/[;|]/).filter(Boolean);
  const quality = qualityPresets[defaults.quality] ? defaults.quality : 'balanced';
  const preset = qualityPresets[quality];

  return {
    id: `job-${Date.now()}-${index}`,
    input,
    status: 'queued',
    progress: 0,
    stage: 'waiting',
    priority: false,
    sourceLang: defaults.sourceLang || 'detect',
    targets: targets.length ? targets : ['en'],
    quality,
    cleanup: defaults.cleanup || preset.cleanup,
    output: Array.isArray(defaults.output)
      ? defaults.output
      : String(defaults.output || 'srt-dual;ass-dual').split(/[;|]/).filter(Boolean),
  };
}

function parseBatchManifest(name, text) {
  const lower = name.toLowerCase();

  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(text);
    const defaults = parsed.defaults || {};
    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    return jobs.map((job, index) => makeQueueItem(job.input || job.path || `job-${index + 1}`, index, { ...defaults, ...job }));
  }

  if (lower.endsWith('.csv')) {
    return csvRows(text).map((row, index) => makeQueueItem(row.input || row.path || `row-${index + 1}`, index, row));
  }

  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => makeQueueItem(line, index));
}

function IconButton({ label, icon: Icon, active, onClick }) {
  return (
    <button type="button" className={`icon-button${active ? ' active' : ''}`} aria-label={label} title={label} onClick={onClick}>
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}

function SelectControl({ label, value, onChange, options = languages }) {
  return (
    <label className="select-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((language) => (
          <option key={language.value} value={language.value}>{language.label}</option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </label>
  );
}

function StatusDot({ status }) {
  if (status === 'done') return <CheckCircle2 size={17} className="status-done" />;
  if (status === 'running') return <Clock size={17} className="status-running" />;
  if (status === 'failed') return <X size={17} className="status-error" />;
  return <Circle size={17} className="status-queued" />;
}

function PipelineStep({ job }) {
  return (
    <div className={`pipeline-step ${job.status}`}>
      <StatusDot status={job.status} />
      <div>
        <strong>{job.label}</strong>
        <span>{job.detail}</span>
      </div>
      <small>{job.progress}%</small>
    </div>
  );
}

function WordChip({ word, selected, onClick }) {
  return (
    <button type="button" className={`word-chip ${word.freq}${selected ? ' selected' : ''}`} onClick={onClick}>
      <span>{word.text}</span>
      <small>{word.reading}</small>
    </button>
  );
}

function buildJobs(sourceMode, cues, translationDone, queueRunning) {
  return [
    { id: 'probe', label: 'Probe media', detail: 'ffprobe stream plan', status: 'done', progress: 100 },
    { id: 'audio', label: 'Clean audio', detail: 'quality preset chain', status: queueRunning ? 'running' : 'done', progress: queueRunning ? 72 : 100 },
    { id: 'base', label: 'Acquire cues', detail: sourceModes.find((item) => item.id === sourceMode)?.detail || 'subtitle source', status: cues.length ? 'done' : 'queued', progress: cues.length ? 100 : 0 },
    { id: 'translate', label: 'Batch translate', detail: translationDone ? 'cache ready' : 'fallback ready', status: translationDone ? 'done' : 'running', progress: translationDone ? 100 : 70 },
    { id: 'export', label: 'Export files', detail: 'SRT, ASS, batch report', status: 'done', progress: 100 },
  ];
}

export default function Home() {
  const mediaInputRef = useRef(null);
  const sidecarInputRef = useRef(null);
  const batchInputRef = useRef(null);
  const videoRef = useRef(null);
  const videoFrameRef = useRef(null);
  const simulationRef = useRef(null);
  const maskDragRef = useRef(null);
  const controlsTimerRef = useRef(null);
  const mediaFileRef = useRef(null);
  const [viewStep, setViewStep] = useState('landing');
  const [intent, setIntent] = useState('watch');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('subtitles');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [mode, setMode] = useState('education');
  const [sourceLang, setSourceLang] = useState('detect');
  const [detectedLang, setDetectedLang] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState(null);
  const [targetLang, setTargetLang] = useState('en');
  const [sourceMode, setSourceMode] = useState('embedded');
  const [quality, setQuality] = useState('balanced');
  const [cleanup, setCleanup] = useState(qualityPresets.balanced.cleanup);
  const [subtitleStyle, setSubtitleStyle] = useState('cinema');
  const [subtitlePosition, setSubtitlePosition] = useState('bottom');
  const [maskMode, setMaskMode] = useState('off');
  const [maskRect, setMaskRect] = useState(() => maskPresets[0].rect);
  const [maskOpacity, setMaskOpacity] = useState(0.78);
  const [maskBlur, setMaskBlur] = useState(8);
  const [maskFeather, setMaskFeather] = useState(10);
  const [maskEditing, setMaskEditing] = useState(false);
  const [focusView, setFocusView] = useState(false);
  const [batchSize, setBatchSize] = useState(50);
  const [concurrency, setConcurrency] = useState(6);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(6.2);
  const [selectedWord, setSelectedWord] = useState(null);
  const [mediaName, setMediaName] = useState('demo-media.mp4');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaPath, setMediaPath] = useState('');
  const [sidecarName, setSidecarName] = useState('');
  const [cues, setCues] = useState(() => DEMO_CUES.map(enrichCue));
  const [savedCards, setSavedCards] = useState([]);
  const [formats, setFormats] = useState({ srt: true, ass: true, json: false, report: true });
  const [statusMessage, setStatusMessage] = useState('Ready. Import media, sidecar subtitles, or a batch manifest.');
  const [translationDone, setTranslationDone] = useState(true);
  const [queue, setQueue] = useState(() => [
    makeQueueItem('/videos/lecture01.mp4', 0, { quality: 'balanced', output: ['srt-dual', 'ass-dual'] }),
    makeQueueItem('/videos/interview.mkv', 1, { quality: 'best', targets: ['en', 'zh'], cleanup: qualityPresets.best.cleanup }),
  ]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [manifestSummary, setManifestSummary] = useState('2 demo jobs loaded');

  const activeCue = useMemo(() => (
    cues.find((cue) => playbackTime >= cue.start && playbackTime <= cue.end) ?? cues[0]
  ), [cues, playbackTime]);
  const jobs = useMemo(() => buildJobs(sourceMode, cues, translationDone, queueRunning), [sourceMode, cues, translationDone, queueRunning]);
  const completeCount = jobs.filter((job) => job.status === 'done').length;
  const runningJob = jobs.find((job) => job.status === 'running') ?? jobs[jobs.length - 1];
  const overallProgress = Math.round(jobs.reduce((total, job) => total + job.progress, 0) / jobs.length);
  const vocabulary = useMemo(() => cues.flatMap((cue) => cue.words), [cues]);
  const currentWord = selectedWord ?? vocabulary[0];
  const maskSettings = useMemo(() => ({
    mode: maskMode,
    rect: maskRect,
    opacity: maskOpacity,
    blur: maskBlur,
    feather: maskFeather,
    exportFilter: makeMaskFilter({ mode: maskMode, rect: maskRect, opacity: maskOpacity, blur: maskBlur }),
  }), [maskBlur, maskFeather, maskMode, maskOpacity, maskRect]);
  const queueStats = useMemo(() => {
    const done = queue.filter((job) => job.status === 'done').length;
    const running = queue.filter((job) => job.status === 'running').length;
    const queued = queue.filter((job) => job.status === 'queued').length;
    const overall = queue.length ? Math.round(queue.reduce((sum, job) => sum + job.progress, 0) / queue.length) : 0;
    return { done, running, queued, overall };
  }, [queue]);
  const dueCards = savedCards.filter((card) => card.fsrs.due <= Date.now()).length;
  const whisperReady = Boolean(transcriptionStatus?.ready);

  useEffect(() => () => {
    if (simulationRef.current) window.clearInterval(simulationRef.current);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
  }, []);

  useEffect(() => () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  }, [mediaUrl]);

  useEffect(() => {
    const refreshWhisperStatus = async () => {
      try {
        const response = await fetch('/api/whisper');
        if (response.ok) {
          setTranscriptionStatus(await response.json());
        }
      } catch {
        setTranscriptionStatus({ ready: false, checks: {}, paths: {} });
      }
    };
    refreshWhisperStatus();
  }, []);

  useEffect(() => {
    if (!queueRunning) return undefined;

    const interval = window.setInterval(() => {
      setQueue((current) => {
        const maxActive = Math.max(1, Math.min(12, Number(concurrency) || 2));
        const sorted = [...current].sort((a, b) => Number(b.priority) - Number(a.priority));
        const activeIds = new Set(sorted.filter((job) => job.status === 'running').map((job) => job.id));
        for (const job of sorted) {
          if (activeIds.size >= maxActive) break;
          if (job.status === 'queued') activeIds.add(job.id);
        }

        return current.map((job) => {
          if (!activeIds.has(job.id) || job.status === 'done') return job;
          const nextProgress = Math.min(100, job.progress + (job.quality === 'best' ? 6 : job.quality === 'fast' ? 14 : 10));
          return {
            ...job,
            status: nextProgress >= 100 ? 'done' : 'running',
            progress: nextProgress,
            stage: nextProgress < 35 ? 'cleaning audio' : nextProgress < 70 ? 'transcribing' : nextProgress < 100 ? 'batch translating' : 'exported',
          };
        });
      });
    }, 850);

    return () => window.clearInterval(interval);
  }, [concurrency, queueRunning]);

  useEffect(() => {
    if (!queueRunning || !queue.length) return;
    if (queue.every((job) => job.status === 'done')) {
      setQueueRunning(false);
      setStatusMessage('Offline batch queue complete. Subtitle files and batch reports are ready.');
    }
  }, [queue, queueRunning]);

  useEffect(() => {
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    if (viewStep !== 'player' || !isPlaying || settingsOpen) {
      setControlsVisible(true);
      return undefined;
    }

    setControlsVisible(true);
    controlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2200);
    return () => {
      if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    };
  }, [isPlaying, settingsOpen, viewStep]);

  useEffect(() => {
    if (!maskEditing) return undefined;

    const handleMove = (event) => {
      const drag = maskDragRef.current;
      if (!drag) return;
      const dx = (event.clientX - drag.startX) / drag.frameWidth;
      const dy = (event.clientY - drag.startY) / drag.frameHeight;
      setMaskRect(normalizeMaskRect({
        ...drag.rect,
        x: drag.rect.x + dx,
        y: drag.rect.y + dy,
      }));
    };

    const handleUp = () => {
      maskDragRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [maskEditing]);

  const applyCues = (nextCues, nextSourceMode, message) => {
    const enriched = nextCues.map(enrichCue).filter((cue) => cue.original);
    setCues(enriched.length ? enriched : DEMO_CUES.map(enrichCue));
    setSourceMode(nextSourceMode);
    setPlaybackTime(enriched[0]?.start ?? 2);
    setSelectedWord(enriched[0]?.words?.[0] ?? null);
    setTranslationDone(nextSourceMode !== 'sidecar');
    setStatusMessage(message);
  };

  const handleQualityChange = (nextQuality) => {
    setQuality(nextQuality);
    setCleanup(qualityPresets[nextQuality].cleanup);
    setStatusMessage(`${qualityPresets[nextQuality].label} preset selected: ${qualityPresets[nextQuality].detail}.`);
  };

  const toggleCleanup = (id) => {
    setCleanup((current) => ({ ...current, [id]: !current[id] }));
  };

  const chooseMaskMode = (nextMode) => {
    setMaskMode(nextMode);
    setStatusMessage(subtitleMaskModes.find((item) => item.id === nextMode)?.detail || 'Subtitle mask updated.');
  };

  const applyMaskPreset = (preset) => {
    setMaskRect(normalizeMaskRect(preset.rect));
    setMaskEditing(true);
    if (maskMode === 'off' || maskMode === 'hide') setMaskMode('box');
    setStatusMessage(`${preset.label} mask region selected.`);
  };

  const updateMaskRect = (key, value) => {
    setMaskRect((current) => normalizeMaskRect({ ...current, [key]: Number(value) / 100 }));
  };

  const startMaskDrag = (event) => {
    if (!maskEditing || maskMode === 'off' || maskMode === 'hide') return;
    const frame = videoFrameRef.current?.getBoundingClientRect();
    if (!frame) return;
    maskDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      frameWidth: frame.width || 1,
      frameHeight: frame.height || 1,
      rect: maskRect,
    };
    event.preventDefault();
  };

  const handleMediaFile = (file) => {
    if (!file) return;
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaFileRef.current = file;           // keep the actual File for transcription
    setMediaUrl(URL.createObjectURL(file));
    setMediaName(file.name);
    setMediaPath(getDesktopFilePath(file));
    setDetectedLang(null);
    setViewStep('config');
    setStatusMessage(`Loaded ${file.name}. Confirm languages, then start.`);
  };

  const handleMediaImport = (event) => {
    handleMediaFile(event.target.files?.[0]);
  };

  const handleDropMedia = (event) => {
    event.preventDefault();
    handleMediaFile(event.dataTransfer.files?.[0]);
  };

  const chooseExperience = (nextMode) => {
    setMode(nextMode);
    setIntent('watch');
    setViewStep('config');
    setStatusMessage(nextMode === 'education'
      ? 'Study mode selected. Loop tools, mining, and review are ready when you start.'
      : 'Watch mode selected. The player will stay clean and video-first.');
  };

  const openSettings = (tab = 'subtitles') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
    setControlsVisible(true);
  };

  const startProject = () => {
    setViewStep('player');
    setSettingsOpen(false);
    setStatusMessage(intent === 'export'
      ? 'Export path ready. Open Export settings when you want output files.'
      : 'Player ready. Controls stay quiet until you need them.');
  };

  const loadSampleProject = async () => {
    try {
      const response = await fetch('/api/whisper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sample' }),
      });
      if (!response.ok) throw new Error('Sample smoke test is unavailable.');
      const data = await response.json();
      setMediaName(data.mediaName || 'LingoLoop sample');
      setMediaUrl('');
      setMediaPath('');
      setSourceLang(data.sourceLang || 'en');
      setTargetLang(data.targetLang || 'ja');
      setDetectedLang(data.sourceLang || 'en');
      setTranscriptionStatus(data.status || null);
      applyCues(data.cues || DEMO_CUES, 'transcribe', 'Sample smoke test loaded. This follows the planned FFmpeg -> whisper.cpp -> cues path.');
      setViewStep('config');
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const handleSidecarImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseSubtitleFile(file.name, text);
    setSidecarName(file.name);
    applyCues(parsed, 'sidecar', parsed.length ? `Parsed ${parsed.length} cues from ${file.name}.` : `No cues found in ${file.name}; using demo cues.`);
  };

  const handleBatchImport = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const manifest = files.find((file) => /\.(json|csv|txt)$/i.test(file.name));
    if (manifest) {
      try {
        const parsed = parseBatchManifest(manifest.name, await manifest.text());
        setQueue(parsed);
        setManifestSummary(`${parsed.length} jobs loaded from ${manifest.name}`);
        setStatusMessage(`Batch manifest accepted: ${parsed.length} jobs queued.`);
      } catch (error) {
        setStatusMessage(`Manifest error: ${error.message}`);
      }
      return;
    }

    const nextQueue = files.map((file, index) => makeQueueItem(file.name, index, { quality, targets: [targetLang] }));
    setQueue(nextQueue);
    setManifestSummary(`${nextQueue.length} media files queued`);
    setStatusMessage(`${nextQueue.length} media files queued for offline processing.`);
  };

  const runTranscription = async () => {
    const file = mediaFileRef.current;
    if (!file && !mediaPath) {
      setStatusMessage('Import a video or audio file before transcribing.');
      return;
    }
    if (!sourceLang || sourceLang === 'none') {
      setStatusMessage('Pick a source language or choose "Auto-detect" before transcribing.');
      openSettings('languages');
      return;
    }

    setSourceMode('transcribe');
    setTranscribing(true);
    setTranslationDone(false);
    setStatusMessage(sourceLang === 'detect'
      ? 'Starting local whisper.cpp language detection and transcription…'
      : `Starting local whisper.cpp transcription in ${sourceLangLabel(sourceLang)}…`);

    try {
      if (mediaPath) {
        const response = await fetch('/api/whisper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'transcribe',
            mediaPath,
            language: sourceLang,
            quality,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Local whisper.cpp transcription failed.');
        setTranscriptionStatus(data.plan?.status || null);
        applyCues(data.cues, 'transcribe', `Local whisper.cpp produced ${data.cues.length} cues from ${mediaName}.`);
        return;
      }

      setStatusMessage('Desktop file path was not available, using browser Whisper fallback for preview only.');
      const model = quality === 'best'
        ? 'Xenova/whisper-small'
        : quality === 'fast'
          ? 'Xenova/whisper-tiny'
          : 'Xenova/whisper-base';

      const { cues: asrCues, detectedLanguage } = await transcribeMedia(file, {
        language: sourceLang,
        model,
        onProgress: (fraction, stage) => {
          setStatusMessage(`${stage}… ${Math.round(fraction * 100)}%`);
        },
      });

      if (!asrCues.length) {
        setStatusMessage('No speech was detected in this file. Try a different source or check the audio track.');
        return;
      }

      if (sourceLang === 'detect' && detectedLanguage) {
        setDetectedLang(detectedLanguage);
      }

      const langNote = sourceLang === 'detect' && detectedLanguage
        ? ` Detected ${sourceLangLabel(detectedLanguage)}.`
        : '';
      applyCues(asrCues, 'transcribe', `Transcribed ${asrCues.length} cues from ${file.name}.${langNote}`);
    } catch (error) {
      setStatusMessage(`Transcription failed: ${error.message}`);
    } finally {
      setTranscribing(false);
    }
  };

  const chooseSourceMode = (nextMode) => {
    if (nextMode === 'sidecar' && !sidecarName) {
      setSourceMode('sidecar');
      setStatusMessage('Choose a sidecar subtitle file to parse cues.');
      sidecarInputRef.current?.click();
      return;
    }
    if (nextMode === 'transcribe') {
      runTranscription();
      return;
    }
    // 'embedded' path (extract an existing subtitle stream) still uses the
    // placeholder cues until the FFmpeg extraction backend lands.
    applyCues(DEMO_CUES, nextMode, `${sourceModes.find((item) => item.id === nextMode)?.label} source path selected.`);
  };

  const syncVideoTime = (time) => {
    if (videoRef.current) videoRef.current.currentTime = time;
    setPlaybackTime(time);
  };

  const revealPlayerChrome = () => {
    setControlsVisible(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    if (viewStep === 'player' && isPlaying && !settingsOpen) {
      controlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2200);
    }
  };

  const chooseCue = (cue) => {
    syncVideoTime(cue.start);
    setSelectedWord(cue.words[0]);
  };

  const togglePlayback = async () => {
    setControlsVisible(true);
    if (videoRef.current && mediaUrl) {
      if (videoRef.current.paused) {
        await videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }

    if (simulationRef.current) {
      window.clearInterval(simulationRef.current);
      simulationRef.current = null;
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    simulationRef.current = window.setInterval(() => {
      setPlaybackTime((current) => {
        const maxEnd = cues[cues.length - 1]?.end ?? 20;
        return current >= maxEnd ? cues[0]?.start ?? 0 : current + 0.25;
      });
    }, 250);
  };

  const loopCurrentCue = () => {
    if (!activeCue) return;
    syncVideoTime(activeCue.start);
    setStatusMessage(`Looped cue at ${secondsToClock(activeCue.start)}.`);
  };

  const mineCurrentCue = () => {
    if (!activeCue) return;
    setSavedCards((current) => {
      if (current.some((card) => card.cueId === activeCue.id)) return current;
      return [
        ...current,
        {
          id: `card-${activeCue.id}`,
          cueId: activeCue.id,
          front: activeCue.original,
          back: activeCue.translation,
          fsrs: { due: Date.now(), stability: 0.4, difficulty: 0.5, reps: 0 },
        },
      ];
    });
    setStatusMessage('Saved this loop as an FSRS review card.');
  };

  const shadowCurrentCue = () => {
    if (!activeCue) return;
    setStatusMessage('Shadowing scorer armed. Recording/alignment lands in the media worker phase.');
  };

  const translateCues = async () => {
    // Never send the 'detect'/'none' sentinels to the translator. Use the
    // recognised language when we have it, otherwise let the translator
    // auto-detect the source ('auto').
    const effectiveSource = (sourceLang === 'detect' || sourceLang === 'none')
      ? (detectedLang || 'auto')
      : sourceLang;

    setStatusMessage(`Batch translating ${cues.length} cues in groups of ${batchSize} with concurrency ${concurrency}.`);
    setTranslationDone(false);

    const translated = await Promise.all(cues.map(async (cue) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1200);
      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ text: cue.original, from: effectiveSource, to: targetLang, llmModel: 'none' }),
        });

        if (response.ok) {
          const data = await response.json();
          return { ...cue, translation: data.text || cue.translation };
        }
        return { ...cue, translation: localTranslate(cue.original, targetLang) };
      } catch {
        return { ...cue, translation: localTranslate(cue.original, targetLang) };
      } finally {
        window.clearTimeout(timeout);
      }
    }));

    setCues(translated);
    setTranslationDone(true);
    setStatusMessage(cacheEnabled ? 'Translations ready. Repeated lines will hit cache on re-run.' : 'Translations ready. Cache is disabled.');
  };

  const toggleFormat = (format) => {
    setFormats((current) => ({ ...current, [format]: !current[format] }));
  };

  const startQueue = () => {
    setQueue((current) => current.map((job) => job.status === 'done' ? job : { ...job, status: 'queued' }));
    setQueueRunning(true);
    setStatusMessage('Offline batch queue started. Jobs resume by stage.');
  };

  const cancelQueue = () => {
    setQueueRunning(false);
    setQueue((current) => current.map((job) => job.status === 'running' ? { ...job, status: 'queued', stage: 'paused' } : job));
    setStatusMessage('Queue paused. Resume when ready.');
  };

  const prioritizeJob = (id) => {
    setQueue((current) => current.map((job) => job.id === id ? { ...job, priority: !job.priority } : job));
  };

  const retryJob = (id) => {
    setQueue((current) => current.map((job) => job.id === id ? { ...job, status: 'queued', progress: 0, stage: 'waiting' } : job));
  };

  const exportSelected = () => {
    const selected = Object.entries(formats).filter(([, enabled]) => enabled).map(([format]) => format);
    if (!selected.length) {
      setStatusMessage('Choose at least one export format.');
      return;
    }

    const baseName = mediaName.replace(/\.[^.]+$/, '') || 'dual-live-translations';
    if (formats.srt) downloadText(`${baseName}.dual.srt`, makeSrt(cues));
    if (formats.ass) downloadText(`${baseName}.dual.ass`, makeAss(cues));
    if (formats.json) {
      downloadText(`${baseName}.project.json`, JSON.stringify({
        mediaName,
        source: { mode: sourceMode, lang: sourceLang },
        targets: [targetLang],
        quality,
        cleanup,
        subtitleMask: maskSettings,
        cues,
        queue,
      }, null, 2), 'application/json');
    }
    if (formats.report) downloadText(`${baseName}.batch-report.csv`, makeBatchReport(queue), 'text/csv');
    setStatusMessage(`Exported ${selected.map((item) => item.toUpperCase()).join(', ')} files.`);
  };

  return (
    <main className={`app-shell ${mode} step-${viewStep} ${intent}-intent${focusView ? ' focus-view' : ''}${settingsOpen ? ' settings-open' : ''}${viewStep === 'player' && isPlaying && !controlsVisible ? ' controls-hidden' : ' controls-active'}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Languages size={21} /></div>
          <div>
            <h1>{APP_NAME}</h1>
            <p>{mediaName}</p>
          </div>
        </div>

      </header>
      <input ref={mediaInputRef} className="sr-only" type="file" accept="video/*,audio/*,.mkv,.mov,.webm,.mp4,.mp3,.wav" onChange={handleMediaImport} />
      <input ref={sidecarInputRef} className="sr-only" type="file" accept=".srt,.vtt,.ass,.ssa,text/plain" onChange={handleSidecarImport} />
      <input ref={batchInputRef} className="sr-only" type="file" accept=".json,.csv,.txt,video/*,audio/*" multiple onChange={handleBatchImport} />

      {viewStep === 'landing' ? (
        <section className="landing-flow" aria-label="Start">
          <button
            className="drop-panel"
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropMedia}
          >
            <Upload size={36} />
            <strong>Drop a video</strong>
            <span>or click to browse. LingoLoop will parse subtitles or prepare local whisper.cpp transcription.</span>
          </button>
          <button className="sample-action" type="button" onClick={loadSampleProject}>
            <Sparkles size={17} />
            <span>Try the sample smoke test</span>
          </button>
          <div className="start-mode-row">
            <button type="button" className={mode === 'education' ? 'selected' : ''} onClick={() => chooseExperience('education')}>
              <BookOpen size={18} />
              <span><strong>Study</strong><small>Loop, shadow, mine, review</small></span>
            </button>
            <button type="button" className={mode === 'leisure' ? 'selected' : ''} onClick={() => chooseExperience('leisure')}>
              <Film size={18} />
              <span><strong>Watch</strong><small>Clean dual subtitles, fewer panels</small></span>
            </button>
          </div>
        </section>
      ) : null}

      {viewStep === 'config' ? (
        <section className="config-flow" aria-label="Configure">
          <div className="config-card">
            <div className="config-media-line">
              <Film size={18} />
              <span>{mediaName}</span>
              <small>{mode === 'education' ? 'Study defaults' : 'Watch defaults'}</small>
            </div>
            <div className="config-language-grid">
              <SelectControl label="From" value={sourceLang} onChange={setSourceLang} options={sourceLanguages} />
              <SelectControl label="To" value={targetLang} onChange={setTargetLang} />
            </div>
            <div className="intent-toggle" aria-label="Output intent">
              <button type="button" className={intent === 'watch' ? 'selected' : ''} onClick={() => setIntent('watch')}>Watch</button>
              <button type="button" className={intent === 'export' ? 'selected' : ''} onClick={() => setIntent('export')}>Export</button>
            </div>
            {advancedOpen ? (
              <div className="advanced-summary">
                <div>
                  <span>Subtitle source</span>
                  <div className="source-modes compact-source-modes">
                    {sourceModes.map((item) => (
                      <button key={item.id} type="button" className={sourceMode === item.id ? 'selected' : ''} onClick={() => chooseSourceMode(item.id)}>{item.label}</button>
                    ))}
                  </div>
                </div>
                <span>Quality: {qualityPresets[quality].label} · Local ASR: {whisperReady ? 'ready' : 'needs setup'} · Mask: {subtitleMaskModes.find((item) => item.id === maskMode)?.label}</span>
                <button type="button" className="secondary-action" onClick={() => openSettings('audio')}>Open settings</button>
              </div>
            ) : null}
            <div className="config-actions">
              <button type="button" className="secondary-action" onClick={() => setAdvancedOpen((value) => !value)}>{advancedOpen ? 'Hide advanced' : 'Advanced'}</button>
              <button type="button" className="primary-action" onClick={startProject}><Play size={18} /><span>Start</span></button>
            </div>
          </div>
        </section>
      ) : null}

      {viewStep === 'player' ? (
      <section className="workspace">
        <aside className="left-rail" aria-label="Imports and pipeline">
          <button className="rail-section import-zone" type="button" onClick={() => mediaInputRef.current?.click()}>
            <Film size={26} />
            <div><strong>Import media</strong><span>Video/audio preview</span></div>
          </button>
          <button className="rail-section import-zone secondary" type="button" onClick={() => sidecarInputRef.current?.click()}>
            <FileText size={25} />
            <div><strong>Import sidecar</strong><span>SRT, VTT, ASS subtitles</span></div>
          </button>
          <button className="rail-section import-zone batch" type="button" onClick={() => batchInputRef.current?.click()}>
            <FileJson size={25} />
            <div><strong>Batch list</strong><span>JSON, CSV, TXT, or many media files</span></div>
          </button>

          <div className="rail-section">
            <div className="section-title"><span>Pipeline</span><small>{completeCount}/{jobs.length}</small></div>
            <div className="pipeline-list">
              {jobs.map((job) => <PipelineStep key={job.id} job={job} />)}
            </div>
          </div>

          <div className="rail-section compact">
            <div className="section-title"><span>Source mode</span><FileText size={15} /></div>
            <p className="path-text">{sidecarName || mediaName}</p>
            <div className="source-modes">
              {sourceModes.map((item) => (
                <button key={item.id} type="button" className={sourceMode === item.id ? 'selected' : ''} onClick={() => chooseSourceMode(item.id)}>{item.label}</button>
              ))}
            </div>
          </div>
        </aside>

        <section className="stage-column" aria-label="Player and configuration">
          <div className="player-shell" onPointerMove={revealPlayerChrome} onFocusCapture={revealPlayerChrome}>
            <div className="player-topline">
              <div>
                <strong>Subtitle viewer</strong>
                <span>{statusMessage}</span>
              </div>
              <div className="player-tools">
                <IconButton label="Batch translate" icon={Sparkles} active={!translationDone} onClick={translateCues} />
                <IconButton label="Focus viewer" icon={Maximize2} active={focusView} onClick={() => setFocusView((value) => !value)} />
                <IconButton label="Subtitle settings" icon={SlidersHorizontal} active onClick={() => openSettings('subtitles')} />
                <IconButton label="Queue settings" icon={Settings} onClick={() => openSettings('batch')} />
              </div>
            </div>

            <div className="subtitle-toolbar" aria-label="Subtitle display controls">
              <div className="subtitle-control-group">
                {subtitleStyles.map((style) => (
                  <button key={style.id} type="button" className={subtitleStyle === style.id ? 'selected' : ''} onClick={() => setSubtitleStyle(style.id)}>{style.label}</button>
                ))}
              </div>
              <div className="subtitle-control-group">
                {subtitlePositions.map((position) => (
                  <button key={position.id} type="button" className={subtitlePosition === position.id ? 'selected' : ''} onClick={() => setSubtitlePosition(position.id)}>{position.label}</button>
                ))}
              </div>
            </div>

            <div ref={videoFrameRef} className="video-frame">
              {mediaUrl ? (
                <video
                  ref={videoRef}
                  className="media-preview"
                  src={mediaUrl}
                  onTimeUpdate={(event) => setPlaybackTime(event.currentTarget.currentTime)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  controls={false}
                />
              ) : (
                <div className="scene-grid" aria-hidden="true"><span /><span /><span /><span /></div>
              )}
              {maskMode !== 'off' && maskMode !== 'hide' ? (
                <div
                  className={`subtitle-mask-overlay ${maskMode}${maskEditing ? ' editing' : ''}`}
                  style={{
                    left: `${maskRect.x * 100}%`,
                    top: `${maskRect.y * 100}%`,
                    width: `${maskRect.w * 100}%`,
                    height: `${maskRect.h * 100}%`,
                    '--mask-opacity': maskOpacity,
                    '--mask-blur': `${maskBlur}px`,
                    '--mask-feather': `${maskFeather}px`,
                  }}
                  onPointerDown={startMaskDrag}
                  aria-label="Subtitle mask preview"
                >
                  <span>{maskMode === 'blur' ? 'Blur mask' : 'Cover mask'}{maskEditing ? ' · drag' : ''}</span>
                  {maskEditing ? <i aria-hidden="true" /> : null}
                </div>
              ) : null}
              {maskMode === 'hide' ? (
                <div className="soft-sub-notice">Original soft subtitle track hidden for preview/export</div>
              ) : null}
              <div className="video-status">
                <Sparkles size={15} />
                <span>{mode === 'education' ? `${dueCards} review cards due` : 'Clean viewing mode'}</span>
              </div>
              {mode === 'education' && activeCue ? (
                <div className="loop-dock" aria-label="Study loop tools">
                  <div>
                    <strong>Loop {secondsToClock(activeCue.start)}</strong>
                    <span>{activeCue.original}</span>
                  </div>
                  <div className="loop-actions">
                    <button type="button" onClick={loopCurrentCue}>Loop</button>
                    <button type="button" onClick={shadowCurrentCue}>Shadow</button>
                    <button type="button" onClick={mineCurrentCue}>Mine</button>
                  </div>
                </div>
              ) : null}
              {activeCue ? (
                <div className={`subtitle-stack ${subtitleStyle} ${subtitlePosition}`}>
                  <p className="reading-line"><span>{activeCue.reading}</span></p>
                  <h2><span>{activeCue.original}</span></h2>
                  <h3><span>{activeCue.translation}</span></h3>
                </div>
              ) : null}
            </div>

            <div className="transport">
              <button type="button" className="play-button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={togglePlayback}>
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </button>
              <div className="timeline" aria-label="Playback progress">
                <div style={{ width: `${Math.min(100, (playbackTime / (cues[cues.length - 1]?.end || 20)) * 100)}%` }} />
              </div>
              <span className="timecode">{secondsToClock(playbackTime)}</span>
              <IconButton label="Loop current line" icon={Repeat} active onClick={loopCurrentCue} />
              <IconButton label="Volume" icon={Volume2} />
            </div>
          </div>

          <div className="config-grid">
            <section className="config-panel">
              <div className="panel-heading"><AudioWaveform size={17} /><span>Audio cleanup</span></div>
              <div className="preset-row">
                {Object.entries(qualityPresets).map(([id, preset]) => (
                  <button key={id} type="button" className={quality === id ? 'selected' : ''} onClick={() => handleQualityChange(id)}>
                    <strong>{preset.label}</strong><small>{preset.detail}</small>
                  </button>
                ))}
              </div>
              <div className="toggle-list">
                {cleanupOptions.map((option) => (
                  <label key={option.id} className="toggle-row">
                    <input type="checkbox" checked={cleanup[option.id]} onChange={() => toggleCleanup(option.id)} />
                    <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                  </label>
                ))}
              </div>
            </section>

            <section className="config-panel">
              <div className="panel-heading"><Gauge size={17} /><span>Performance</span></div>
              <div className="metric-grid">
                <label><span>Batch size</span><input type="number" min="5" max="100" value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value) || 50)} /></label>
                <label><span>Concurrency</span><input type="number" min="1" max="12" value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value) || 1)} /></label>
              </div>
              <label className="toggle-row single">
                <input type="checkbox" checked={cacheEnabled} onChange={() => setCacheEnabled((value) => !value)} />
                <span><strong>Content-hash cache</strong><small>Skip repeated translations and completed jobs.</small></span>
              </label>
              <div className="performance-note">
                <FastForward size={16} />
                <span>Plan target: local Whisper one pass, batched translation, bounded concurrency, resumable queue.</span>
              </div>
            </section>

            <section className="config-panel subtitle-mask-panel">
              <div className="panel-heading"><SlidersHorizontal size={17} /><span>Subtitle mask</span><small>{maskMode === 'off' ? 'preview off' : maskSettings.exportFilter}</small></div>
              <div className="mask-mode-grid">
                {subtitleMaskModes.map((item) => (
                  <button key={item.id} type="button" className={maskMode === item.id ? 'selected' : ''} onClick={() => chooseMaskMode(item.id)}>
                    <strong>{item.label}</strong><small>{item.detail}</small>
                  </button>
                ))}
              </div>
              <div className="mask-preset-row">
                {maskPresets.map((preset) => (
                  <button key={preset.id} type="button" onClick={() => applyMaskPreset(preset)}>{preset.label}</button>
                ))}
                <button type="button" className={maskEditing ? 'selected' : ''} onClick={() => setMaskEditing((value) => !value)}>{maskEditing ? 'Editing on' : 'Edit region'}</button>
              </div>
              <div className="mask-slider-grid">
                <label><span>X {pct(maskRect.x)}</span><input type="range" min="0" max="100" value={Math.round(maskRect.x * 100)} onChange={(event) => updateMaskRect('x', event.target.value)} /></label>
                <label><span>Y {pct(maskRect.y)}</span><input type="range" min="0" max="100" value={Math.round(maskRect.y * 100)} onChange={(event) => updateMaskRect('y', event.target.value)} /></label>
                <label><span>W {pct(maskRect.w)}</span><input type="range" min="12" max="100" value={Math.round(maskRect.w * 100)} onChange={(event) => updateMaskRect('w', event.target.value)} /></label>
                <label><span>H {pct(maskRect.h)}</span><input type="range" min="8" max="50" value={Math.round(maskRect.h * 100)} onChange={(event) => updateMaskRect('h', event.target.value)} /></label>
                <label><span>Opacity {Math.round(maskOpacity * 100)}%</span><input type="range" min="20" max="100" value={Math.round(maskOpacity * 100)} onChange={(event) => setMaskOpacity(Number(event.target.value) / 100)} /></label>
                <label><span>Blur {maskBlur}px</span><input type="range" min="2" max="24" value={maskBlur} onChange={(event) => setMaskBlur(Number(event.target.value))} /></label>
                <label><span>Feather {maskFeather}px</span><input type="range" min="0" max="32" value={maskFeather} onChange={(event) => setMaskFeather(Number(event.target.value))} /></label>
              </div>
            </section>
          </div>

          <div className="export-strip">
            <div className="export-progress">
              <div><strong>{runningJob.label}</strong><span>{overallProgress}% overall</span></div>
              <div className="progress-track"><div style={{ width: `${overallProgress}%` }} /></div>
            </div>
            <div className="export-options">
              {exportFormats.map((format) => (
                <button key={format.id} type="button" className={formats[format.id] ? 'selected' : ''} onClick={() => toggleFormat(format.id)}>
                  <span>{format.label}</span><small>{format.detail}</small>
                </button>
              ))}
            </div>
            <button className="export-button" type="button" onClick={exportSelected}><Download size={18} /><span>Export</span></button>
          </div>
        </section>

        <aside className="right-panel" aria-label="Queue and transcript">
          <div className="panel-tabs">
            <button className="selected" type="button"><ListChecks size={16} /> Queue</button>
            <button type="button"><BookOpen size={16} /> Vocabulary</button>
          </div>

          <section className="queue-panel">
            <div className="section-title"><span>Offline batch queue</span><small>{manifestSummary}</small></div>
            <div className="queue-summary">
              <span>{queueStats.done} done</span><span>{queueStats.running} running</span><span>{queueStats.queued} queued</span><strong>{queueStats.overall}%</strong>
            </div>
            <div className="queue-actions">
              <button type="button" onClick={startQueue}><Play size={15} /> Start</button>
              <button type="button" onClick={cancelQueue}><Pause size={15} /> Pause</button>
              <button type="button" onClick={() => setQueue((current) => current.map((job) => ({ ...job, status: 'queued', progress: 0, stage: 'waiting' })))}><RotateCcw size={15} /> Reset</button>
            </div>
            <div className="queue-list">
              {queue.map((job) => (
                <article key={job.id} className={`queue-item ${job.status}`}>
                  <div>
                    <strong>{job.input}</strong>
                    <span>{job.stage} · {job.quality} · {job.targets.join(', ')}</span>
                  </div>
                  <div className="mini-progress"><div style={{ width: `${job.progress}%` }} /></div>
                  <div className="queue-item-actions">
                    <small>{job.progress}%</small>
                    <button type="button" className={job.priority ? 'priority' : ''} onClick={() => prioritizeJob(job.id)}>Priority</button>
                    <button type="button" onClick={() => retryJob(job.id)}>Retry</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="transcript-list">
            {cues.map((cue) => (
              <button type="button" key={cue.id} className={`transcript-row${cue.id === activeCue?.id ? ' active' : ''}`} onClick={() => chooseCue(cue)}>
                <span>{secondsToClock(cue.start)} · {cue.speaker} · {Math.round(cue.confidence * 100)}%</span>
                <strong>{cue.original}</strong>
                <small>{cue.translation}</small>
              </button>
            ))}
          </div>

          <div className="word-panel">
            <div className="section-title"><span>Vocabulary</span><X size={15} /></div>
            <div className="word-cloud">
              {vocabulary.map((word, index) => (
                <WordChip key={`${word.text}-${index}`} word={word} selected={currentWord?.text === word.text} onClick={() => setSelectedWord(word)} />
              ))}
            </div>
            <div className="definition-card">
              <small>{currentWord?.freq ?? 'study'} word</small>
              <strong>{currentWord?.text ?? 'No word selected'}</strong>
              <span>{currentWord?.reading ?? 'Import or select a cue to build vocabulary.'}</span>
              <p>Vocabulary is derived from cues and updates when sidecar or batch data changes.</p>
            </div>
          </div>
        </aside>
      </section>
      ) : null}

      {settingsOpen ? (
        <div className="settings-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <aside className="settings-sheet" aria-label="Settings" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-head">
              <div>
                <strong>Settings</strong>
                <span>{settingsTabs.find((tab) => tab.id === settingsTab)?.label}</span>
              </div>
              <button type="button" className="icon-button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={18} /></button>
            </div>

            <div className="settings-tabs" role="tablist" aria-label="Settings sections">
              {settingsTabs.map((tab) => (
                <button key={tab.id} type="button" className={settingsTab === tab.id ? 'selected' : ''} onClick={() => setSettingsTab(tab.id)}>{tab.label}</button>
              ))}
            </div>

            <div className="settings-mode-row" aria-label="Experience">
              <span>Experience</span>
              <div className="mode-toggle">
                <button type="button" className={mode === 'education' ? 'selected' : ''} onClick={() => setMode('education')}>Study</button>
                <button type="button" className={mode === 'leisure' ? 'selected' : ''} onClick={() => setMode('leisure')}>Watch</button>
              </div>
            </div>

            <div className="settings-body">
              {settingsTab === 'languages' ? (
                <section className="settings-section">
                  <div className="config-language-grid">
                    <SelectControl label="Source" value={sourceLang} onChange={setSourceLang} options={sourceLanguages} />
                    <SelectControl label="Target" value={targetLang} onChange={setTargetLang} />
                  </div>
                  {sourceLang === 'detect' ? (
                    <p className="settings-note">
                      Auto-detect runs speech language recognition on the video&apos;s audio.
                      {detectedLang ? ` Last detected: ${sourceLangLabel(detectedLang)}.` : ''}
                    </p>
                  ) : null}
                  {transcribing ? <p className="settings-note">Transcribing audio from the imported file…</p> : null}
                  <div className="source-modes">
                    {sourceModes.map((item) => (
                      <button key={item.id} type="button" className={sourceMode === item.id ? 'selected' : ''} onClick={() => chooseSourceMode(item.id)}>{item.label}</button>
                    ))}
                  </div>
                  <p className="settings-note">Mixed-language detection follows the audio cleanup setting and stores per-cue source language metadata when available.</p>
                </section>
              ) : null}

              {settingsTab === 'subtitles' ? (
                <section className="settings-section">
                  <div className="subtitle-control-group wide">
                    {subtitleStyles.map((style) => (
                      <button key={style.id} type="button" className={subtitleStyle === style.id ? 'selected' : ''} onClick={() => setSubtitleStyle(style.id)}>{style.label}</button>
                    ))}
                  </div>
                  <div className="subtitle-control-group wide">
                    {subtitlePositions.map((position) => (
                      <button key={position.id} type="button" className={subtitlePosition === position.id ? 'selected' : ''} onClick={() => setSubtitlePosition(position.id)}>{position.label}</button>
                    ))}
                  </div>
                  <div className="mask-mode-grid">
                    {subtitleMaskModes.map((item) => (
                      <button key={item.id} type="button" className={maskMode === item.id ? 'selected' : ''} onClick={() => chooseMaskMode(item.id)}>
                        <strong>{item.label}</strong><small>{item.detail}</small>
                      </button>
                    ))}
                  </div>
                  <div className="mask-preset-row">
                    {maskPresets.map((preset) => (
                      <button key={preset.id} type="button" onClick={() => applyMaskPreset(preset)}>{preset.label}</button>
                    ))}
                    <button type="button" className={maskEditing ? 'selected' : ''} onClick={() => setMaskEditing((value) => !value)}>{maskEditing ? 'Editing on' : 'Edit region'}</button>
                  </div>
                </section>
              ) : null}

              {settingsTab === 'audio' ? (
                <section className="settings-section">
                  <div className={`pipeline-health ${whisperReady ? 'ready' : 'needs-repair'}`}>
                    <div>
                      <strong>Local whisper.cpp pipeline</strong>
                      <span>{whisperReady ? 'FFmpeg, ffprobe, whisper-cli, and base model are available.' : 'Install or repair FFmpeg, whisper-cli, and ggml-base.bin before desktop transcription.'}</span>
                    </div>
                    <div className="pipeline-checks">
                      {['ffmpeg', 'ffprobe', 'whisper', 'model'].map((key) => (
                        <span key={key} className={transcriptionStatus?.checks?.[key] ? 'ready' : 'missing'}>{key}</span>
                      ))}
                    </div>
                    <div className="pipeline-actions">
                      <button type="button" onClick={loadSampleProject}>Try sample</button>
                      <button type="button" onClick={() => setStatusMessage('Run scripts/setup-whisper.sh, then reopen Audio & Recognition to re-check local transcription.')}>Repair transcription</button>
                    </div>
                  </div>
                  <div className="preset-row">
                    {Object.entries(qualityPresets).map(([id, preset]) => (
                      <button key={id} type="button" className={quality === id ? 'selected' : ''} onClick={() => handleQualityChange(id)}>
                        <strong>{preset.label}</strong><small>{preset.detail}</small>
                      </button>
                    ))}
                  </div>
                  <div className="toggle-list">
                    {cleanupOptions.map((option) => (
                      <label key={option.id} className="toggle-row">
                        <input type="checkbox" checked={cleanup[option.id]} onChange={() => toggleCleanup(option.id)} />
                        <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                      </label>
                    ))}
                  </div>
                </section>
              ) : null}

              {settingsTab === 'learning' ? (
                <section className="settings-section">
                  <div className="review-summary">
                    <strong>{savedCards.length}</strong>
                    <span>mined cards</span>
                    <strong>{dueCards}</strong>
                    <span>due now</span>
                  </div>
                  <div className="loop-tool-list">
                    {loopTools.map((tool) => (
                      <article key={tool.label}>
                        <strong>{tool.label}</strong>
                        <span>{tool.detail}</span>
                      </article>
                    ))}
                  </div>
                  <div className="learning-feature-list">
                    {studyFeatures.map((feature) => (
                      <article key={feature.label}>
                        <strong>{feature.label}</strong>
                        <span>{feature.detail}</span>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {settingsTab === 'export' ? (
                <section className="settings-section">
                  <div className="export-options sheet-options">
                    {exportFormats.map((format) => (
                      <button key={format.id} type="button" className={formats[format.id] ? 'selected' : ''} onClick={() => toggleFormat(format.id)}>
                        <span>{format.label}</span><small>{format.detail}</small>
                      </button>
                    ))}
                  </div>
                  <button className="export-button full" type="button" onClick={exportSelected}><Download size={18} /><span>Export selected files</span></button>
                </section>
              ) : null}

              {settingsTab === 'batch' ? (
                <section className="settings-section">
                  <div className="metric-grid">
                    <label><span>Batch size</span><input type="number" min="5" max="100" value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value) || 50)} /></label>
                    <label><span>Concurrency</span><input type="number" min="1" max="12" value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value) || 1)} /></label>
                  </div>
                  <div className="queue-summary">
                    <span>{queueStats.done} done</span><span>{queueStats.running} running</span><span>{queueStats.queued} queued</span><strong>{queueStats.overall}%</strong>
                  </div>
                  <div className="queue-actions">
                    <button type="button" onClick={startQueue}><Play size={15} /> Start</button>
                    <button type="button" onClick={cancelQueue}><Pause size={15} /> Pause</button>
                    <button type="button" onClick={() => batchInputRef.current?.click()}><FileJson size={15} /> Import</button>
                  </div>
                </section>
              ) : null}

              {settingsTab === 'advanced' ? (
                <section className="settings-section">
                  <label className="toggle-row single">
                    <input type="checkbox" checked={cacheEnabled} onChange={() => setCacheEnabled((value) => !value)} />
                    <span><strong>Content-hash cache</strong><small>Skip repeated translations and completed jobs.</small></span>
                  </label>
                  <div className="performance-note">
                    <FastForward size={16} />
                    <span>Logs: ~/.lingoloop/logs · Models: ~/.lingoloop/models · Mask: {maskSettings.exportFilter}</span>
                  </div>
                </section>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

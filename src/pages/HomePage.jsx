import { useState, useRef, useEffect } from 'react';
import {
  Mic, MicOff, Monitor, Languages, Sparkles, ChevronDown,
  Key, History, Moon, Sun, X, Settings, GripHorizontal,
  Globe, Cloud, Cpu, ArrowLeftRight, QrCode
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { translateText } from '../lib/translator';
import { recognizeSpeech } from '../lib/google-stt';
import { geminiSTT } from '../lib/gemini';
import { useTranslation } from '../lib/i18n';

const { ipcRenderer } = (typeof window !== 'undefined' && typeof window.require === 'function')
  ? window.require('electron')
  : { ipcRenderer: null };

export default function HomePage() {
  const { t, locale, setLocale } = useTranslation();
  // --- State ---
  const [isRecording, setIsRecording] = useState(false);
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('es');
  const [transcriptLimit, setTranscriptLimit] = useState(50);
  const [transcript, setTranscript] = useState({ original: '', translated: '' });
  const [transcriptHistory, setTranscriptHistory] = useState([]);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [llmModel, setLlmModel] = useState('none');
  const [hasMounted, setHasMounted] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [cloudApiKey, setCloudApiKey] = useState('');
  const [sttMode, setSttMode] = useState('satellite');
  const [sttError, setSttError] = useState('');
  const [satelliteReady, setSatelliteReady] = useState(false);
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [showShareQR, setShowShareQR] = useState(false);
  const [transcriptFontSize, setTranscriptFontSize] = useState(1.0);

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');

  const [usageStats, setUsageStats] = useState(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  // Theme State
  const [theme, setTheme] = useState('light');

  // --- Refs ---
  const mediaRecorderRef = useRef(null);
  const isRecordingRef = useRef(false);
  const targetLangRef = useRef(targetLang);
  const llmModelRef = useRef(llmModel);
  const recordingIntervalRef = useRef(null);
  const sourceLangRef = useRef(sourceLang);
  const lastInterimRef = useRef({ time: 0, length: 0, requestId: 0 });

  // --- Effects ---

  // Mount & Theme
  useEffect(() => {
    setHasMounted(true);
    const savedGemini = localStorage.getItem('google_gemini_api_key');
    const savedCloud = localStorage.getItem('google_cloud_stt_api_key');
    const savedTheme = localStorage.getItem('app_theme') || 'light';
    const savedTranscriptSize = localStorage.getItem('transcript_font_size');

    if (savedGemini) setGeminiApiKey(savedGemini);
    if (savedCloud) setCloudApiKey(savedCloud);
    if (savedTranscriptSize) setTranscriptFontSize(parseFloat(savedTranscriptSize));
    setTheme(savedTheme);

    if (ipcRenderer) {
      ipcRenderer.on('overlay-status', (event, visible) => setOverlayVisible(visible));
      ipcRenderer.on('satellite-status', (event, isReady) => setSatelliteReady(isReady));
      ipcRenderer.on('local-ip', (event, ip) => setLocalIp(ip));
      ipcRenderer.on('sync-languages', (event, { sourceLang, targetLang }) => {
        setSourceLang(sourceLang);
        setTargetLang(targetLang);
      });

      // Initial Checks
      ipcRenderer.send('get-overlay-status');
      ipcRenderer.send('check-satellite-status');
      ipcRenderer.send('get-local-ip');

      // Poll Satellite Status every 2s
      const pollInterval = setInterval(() => {
        ipcRenderer.send('check-satellite-status');
      }, 2000);

      return () => clearInterval(pollInterval);
    }
  }, []);


  // Theme Application
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  // Save Settings
  useEffect(() => {
    localStorage.setItem('google_gemini_api_key', geminiApiKey);
    localStorage.setItem('google_cloud_stt_api_key', cloudApiKey);
    localStorage.setItem('transcript_font_size', transcriptFontSize.toString());
  }, [geminiApiKey, cloudApiKey, transcriptFontSize]);

  // Sync Refs
  useEffect(() => {
    isRecordingRef.current = isRecording;
    targetLangRef.current = targetLang;
    llmModelRef.current = llmModel;
    sourceLangRef.current = sourceLang;
  }, [isRecording, targetLang, llmModel, sourceLang]);

  // Broadcast updates to LAN viewers (History Sync)
  useEffect(() => {
    if (transcriptHistory.length > 0 && ipcRenderer) {
      const latest = transcriptHistory[0];
      ipcRenderer.send('broadcast-transcript', {
        id: latest.id,
        transcript: latest.original,
        translated: latest.translated,
        isFinal: latest.isFinal,
        timestamp: latest.timestamp
      });
    }
  }, [transcriptHistory]);

  useEffect(() => {
    if (isRecording && sttMode === 'satellite' && ipcRenderer) {
      console.log(`[Main] Broadcasting language update: ${sourceLang}`);
      ipcRenderer.send('broadcast-stt-command', {
        command: 'start',
        config: { sourceLang, targetLang, llmModel }
      });
    }
  }, [sourceLang]);

  // Auto-stop recording on STT mode switch
  useEffect(() => {
    if (isRecordingRef.current) {
      console.log(`[Main] STT Mode changed to ${sttMode}, stopping recording...`);
      stopRecording();
    }
  }, [sttMode]);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('satellite-transcript', async (event, data) => {
        if (!isRecordingRef.current) return;
        const original = data.transcript;
        if (!original || !original.trim()) return;

        const now = Date.now();
        const isFinal = data.isFinal;

        // 1. Decoupled State Update (Instant UI)
        setTranscriptHistory(prev => {
          let newHistory = [...prev];
          if (newHistory.length > 0 && !newHistory[0].isFinal) {
            newHistory[0] = { ...newHistory[0], original, isFinal };
          } else {
            newHistory.unshift({ id: now, original, translated: '', isFinal, timestamp: now });
          }
          newHistory = newHistory.slice(0, transcriptLimit);
          setTranscript({ original, translated: newHistory[0].translated || '...' });
          return newHistory;
        });

        // 2. Asynchronous Translation Logic
        const shouldTriggerInterim = !isFinal &&
          (original.length > lastInterimRef.current.length + 25 || now > lastInterimRef.current.time + 1500);

        if (isFinal) {
          lastInterimRef.current = { time: 0, length: 0, requestId: 0 };
          translateText(original, sourceLangRef.current.split('-')[0], targetLangRef.current, llmModelRef.current, geminiApiKey)
            .then(translated => {
              setTranscriptHistory(prev => {
                const newHistory = prev.map(item => (item.original === original && item.isFinal) ? { ...item, translated } : item);
                if (newHistory.length > 0 && newHistory[0].original === original) {
                  setTranscript({ original, translated });
                  if (ipcRenderer) ipcRenderer.send('send-subtitle', newHistory);
                }
                return newHistory;
              });
            });
        } else if (shouldTriggerInterim) {
          const requestId = ++lastInterimRef.current.requestId;
          lastInterimRef.current = { time: now, length: original.length, requestId };
          translateText(original, sourceLangRef.current.split('-')[0], targetLangRef.current, llmModelRef.current, geminiApiKey)
            .then(translated => {
              if (requestId === lastInterimRef.current.requestId) {
                setTranscriptHistory(prev => {
                  const newHistory = [...prev];
                  if (newHistory.length > 0 && !newHistory[0].isFinal) {
                    newHistory[0] = { ...newHistory[0], translated };
                    setTranscript({ original: newHistory[0].original, translated });
                    if (ipcRenderer) ipcRenderer.send('send-subtitle', newHistory);
                  }
                  return newHistory;
                });
              }
            });
        }
      });

    }
  }, [transcriptLimit]);

  // --- Functions ---
  const processAudio = async (blob) => {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result.split(',')[1];
          const currentKey = sttMode === 'cloud' ? cloudApiKey : geminiApiKey;

          let original = '';
          try {
            if (sttMode === 'cloud') {
              original = await recognizeSpeech(base64Audio, sourceLang, currentKey);
            } else {
              original = await geminiSTT(base64Audio, sourceLang, 'gemini-1.5-flash', currentKey);
            }
          } catch (sttErr) {
            setSttError(sttErr.message || 'STT Failed');
            return;
          }

          setSttError('');
          if (!original?.trim()) return;

          const translated = await translateText(original, sourceLang.split('-')[0], targetLangRef.current, llmModelRef.current, geminiApiKey);
          const now = Date.now();
          const result = { id: now, original, translated, isFinal: true, timestamp: now };

          setTranscript(result);
          setTranscriptHistory(prev => [result, ...prev].slice(0, transcriptLimit));
          if (ipcRenderer) ipcRenderer.send('send-subtitle', [result]);
        } catch (error) {
          setSttError(error?.message);
        }
      };
    } catch (e) { console.error(e); }
  };

  const startRecording = async () => {
    try {
      if (sttMode === 'satellite') {
        if (!satelliteReady) {
          setSttError(t('error.satellite_not_connected'));
          return;
        }
        setSttError('');
        if (ipcRenderer) ipcRenderer.send('broadcast-stt-command', { command: 'start', config: { sourceLang, targetLang, llmModel } });
        setIsRecording(true);
        return;
      }

      const requiredKey = sttMode === 'cloud' ? cloudApiKey : geminiApiKey;
      if (!requiredKey) { setSttError(t('error.api_key_required')); return; }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) processAudio(e.data); };
      mediaRecorder.start();
      setIsRecording(true);
      recordingIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.start();
        }
      }, 4000);
    } catch (err) { setSttError(err.message); setIsRecording(false); }
  };

  const stopRecording = () => {
    if (sttMode === 'satellite' && ipcRenderer) ipcRenderer.send('broadcast-stt-command', { command: 'stop' });
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    setIsRecording(false);
  };

  const toggleRecording = () => isRecording ? stopRecording() : startRecording();
  const toggleOverlay = () => ipcRenderer?.send('toggle-overlay');

  const swapLanguages = () => {
    const langToLocale = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'zh': 'zh-CN'
    };

    const newSource = langToLocale[targetLang] || `${targetLang}-US`;
    const newTarget = sourceLang.split('-')[0];

    setSourceLang(newSource);
    setTargetLang(newTarget);

    if (ipcRenderer) {
      ipcRenderer.send('sync-languages', { sourceLang: newSource, targetLang: newTarget });
      if (isRecording && sttMode === 'satellite') {
        ipcRenderer.send('broadcast-stt-command', {
          command: 'start',
          config: { sourceLang: newSource, targetLang: newTarget, llmModel }
        });
      }
    }
  };

  const fetchUsageStats = async () => {
    setIsLoadingUsage(true);
    try {
      setUsageStats({ date: new Date().toISOString().split('T')[0], totalChars: 0 });
    } finally { setIsLoadingUsage(false); }
  };

  const clearTranscript = () => {
    setTranscript({ original: '', translated: '' });
    setTranscriptHistory([]);
    ipcRenderer?.send('send-subtitle', []);
  };

  const launchSatellite = () => {
    if (ipcRenderer) ipcRenderer.send('open-satellite-browser');
    else window.open('/satellite.html', '_blank');
  };

  // --- Render ---
  return (
    <main className="min-h-screen bg-bg-main text-text-main font-sans selection:bg-accent-primary/20 transition-colors duration-300">
      <div className="max-w-6xl mx-auto p-6 h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between mb-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl text-white shadow-lg transition-colors duration-300 ${isRecording ? 'bg-red-500 shadow-red-500/30' : 'bg-accent-primary shadow-custom'}`}>
              <Languages className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t('app.title')}</h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                className={`p-2.5 rounded-full transition-all ${showLangMenu ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-bg-hover text-text-muted hover:text-text-main'}`}
                title={t('settings.interface_lang')}
              >
                <Globe className="w-5 h-5" />
              </button>

              {showLangMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowLangMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-bg-card border border-border-color rounded-2xl shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => { setLocale('en'); setShowLangMenu(false); }}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${locale === 'en' ? 'bg-accent-primary text-white shadow-sm' : 'hover:bg-bg-hover text-text-main'}`}
                      >
                        <span>English</span>
                        {locale === 'en' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </button>
                      <button
                        onClick={() => { setLocale('zh'); setShowLangMenu(false); }}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${locale === 'zh' ? 'bg-accent-primary text-white shadow-sm' : 'hover:bg-bg-hover text-text-main'}`}
                      >
                        <span>简体中文</span>
                        {locale === 'zh' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-full hover:bg-bg-hover text-text-muted hover:text-text-main transition-all"
              title={t('settings.title')}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 min-h-0">

          {/* Left Panel: Configuration */}
          <div className="flex flex-col gap-4 overflow-y-auto pr-1">
            <section className="bg-bg-card border border-border-color p-5 rounded-3xl shadow-sm space-y-6">

              {/* Engine Selection Tabs */}
              <div>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Monitor className="w-4 h-4 text-accent-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">{t('engine.title')}</h3>
                </div>
                <div className="bg-bg-input p-1 rounded-xl flex">
                  {[
                    { id: 'satellite', icon: Globe, label: t('engine.satellite.label') },
                    { id: 'cloud', icon: Cloud, label: t('engine.cloud.label') },
                    { id: 'gemini', icon: Sparkles, label: t('engine.gemini.label') }
                  ].map(engine => (
                    <button
                      key={engine.id}
                      onClick={() => setSttMode(engine.id)}
                      className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-lg gap-1 transition-all ${sttMode === engine.id
                        ? 'bg-bg-card text-accent-primary shadow-sm font-bold'
                        : 'text-text-muted hover:text-text-main hover:bg-bg-hover'
                        }`}
                    >
                      <engine.icon className="w-4 h-4" />
                      <span className="text-[9px] uppercase tracking-wider">{engine.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Engine Description & Config */}
              <div className="bg-bg-input/50 rounded-xl p-4 border border-border-color/50 min-h-[120px]">
                {sttMode === 'satellite' && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
                    <p className="text-xs text-text-muted leading-relaxed">
                      <strong className="text-text-main">Web Speech API (Free)</strong>.
                      {t('engine.satellite.desc')}
                    </p>
                    <div className="flex items-center justify-between bg-bg-card p-3 rounded-lg border border-border-color">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${satelliteReady ? 'bg-green-500' : 'bg-red-400 animate-pulse'}`} />
                        <span className="text-xs font-bold text-text-muted">{satelliteReady ? t('engine.connected') : t('engine.disconnected')}</span>
                      </div>
                      {!satelliteReady && (
                        <button onClick={launchSatellite} className="text-[10px] font-bold text-accent-primary hover:underline">
                          {t('engine.launch_now')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {sttMode === 'cloud' && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
                    <p className="text-xs text-text-muted leading-relaxed">
                      <strong className="text-text-main">Google Cloud STT (Paid)</strong>.
                      {t('engine.cloud.desc')}
                    </p>
                    <input
                      type="password"
                      value={cloudApiKey}
                      onChange={e => setCloudApiKey(e.target.value)}
                      placeholder={t('engine.placeholder.cloud')}
                      className="w-full bg-bg-card border border-border-color rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-accent-primary/20 outline-none"
                    />
                  </div>
                )}
                {sttMode === 'gemini' && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
                    <p className="text-xs text-text-muted leading-relaxed">
                      <strong className="text-text-main">Gemini Multimodal (Experimental)</strong>.
                      {t('engine.gemini.desc')}
                    </p>
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={e => setGeminiApiKey(e.target.value)}
                      placeholder={t('engine.placeholder.gemini')}
                      className="w-full bg-bg-card border border-border-color rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-accent-primary/20 outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Languages */}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">{t('lang.mic_input')}</label>
                  <div className="relative">
                    <select
                      value={sourceLang}
                      onChange={e => {
                        const val = e.target.value;
                        setSourceLang(val);
                        ipcRenderer?.send('sync-languages', { sourceLang: val, targetLang });
                      }}
                      className="w-full appearance-none bg-bg-input hover:bg-bg-hover border border-border-color rounded-xl p-3 pr-8 text-xs font-bold text-text-main cursor-pointer focus:ring-2 focus:ring-accent-primary/20 outline-none transition-colors"
                    >
                      <option value="en-US">English (US)</option>
                      <option value="es-ES">Spanish</option>
                      <option value="fr-FR">French</option>
                      <option value="de-DE">German</option>
                      <option value="zh-CN">Chinese</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
                  </div>
                </div>

                <button
                  onClick={swapLanguages}
                  className="mb-1 p-2.5 rounded-xl bg-bg-input hover:bg-bg-hover border border-border-color text-text-muted hover:text-accent-primary transition-all active:scale-90"
                  title={t('lang.swap')}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>

                <div className="flex-1 space-y-2">
                  <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">{t('lang.translation')}</label>
                  <div className="relative">
                    <select
                      value={targetLang}
                      onChange={e => {
                        const val = e.target.value;
                        setTargetLang(val);
                        ipcRenderer?.send('sync-languages', { sourceLang, targetLang: val });
                      }}
                      className="w-full appearance-none bg-bg-input hover:bg-bg-hover border border-border-color rounded-xl p-3 pr-8 text-xs font-bold text-text-main cursor-pointer focus:ring-2 focus:ring-accent-primary/20 outline-none transition-colors"
                    >
                      <option value="es">Spanish</option>
                      <option value="en">English</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="zh">Chinese</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Primary Action */}
              <div className="pt-2 space-y-3">
                <button
                  onClick={toggleRecording}
                  disabled={sttMode === 'satellite' && !satelliteReady && !isRecording}
                  className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-all shadow-lg active:scale-95 ${isRecording
                    ? 'bg-red-500 text-white shadow-red-500/20'
                    : sttMode === 'satellite' && !satelliteReady
                      ? 'bg-bg-input text-text-muted cursor-not-allowed opacity-70'
                      : 'bg-accent-primary text-white shadow-custom hover:brightness-110'
                    }`}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isRecording
                    ? t('action.stop')
                    : sttMode === 'satellite' && !satelliteReady
                      ? t('action.satellite_not_ready')
                      : t('action.start')
                  }
                </button>
                {sttError && (
                  <div className="bg-red-500/10 border border-red-500/20 p-2 rounded-lg">
                    <p className="text-[10px] text-red-600 text-center font-bold">{sttError}</p>
                  </div>
                )}

                <button
                  onClick={toggleOverlay}
                  className={`w-full py-3 rounded-xl border flex items-center justify-between px-4 text-xs font-bold uppercase tracking-wider transition-all ${overlayVisible
                    ? 'bg-accent-primary/10 border-accent-primary text-accent-primary'
                    : 'bg-bg-input border-transparent text-text-muted hover:bg-bg-hover'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4" />
                    <span>{t('action.overlay')}</span>
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full ${overlayVisible ? 'bg-accent-primary animate-pulse' : 'bg-slate-400'}`} />
                </button>

                {overlayVisible && (
                  <div className="grid grid-cols-3 gap-2 animate-in slide-in-from-top-1">
                    <button onClick={toggleOverlay} className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${overlayVisible ? 'bg-accent-primary text-white border-transparent shadow-custom' : 'bg-bg-input text-text-muted border-transparent hover:bg-bg-hover'}`}>
                      {overlayVisible ? t('action.hide_overlay') : t('action.show_overlay')}
                    </button>
                    <button onClick={() => ipcRenderer?.send('open-devtools')} className="py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-bg-input text-text-main border border-transparent hover:bg-bg-hover">
                      {t('action.log')}
                    </button>
                    <button onClick={() => ipcRenderer?.send('close-overlay')} className="py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-bg-input text-red-500 hover:text-red-600 border border-transparent hover:bg-red-50 dark:hover:bg-red-900/10">
                      {t('action.close')}
                    </button>
                  </div>
                )}

                <div className="pt-1 border-t border-border-color/30 my-2" />

                <button
                  onClick={() => setShowShareQR(!showShareQR)}
                  className={`w-full py-3 rounded-xl border flex items-center justify-between px-4 text-xs font-bold uppercase tracking-wider transition-all ${showShareQR
                    ? 'bg-teal-500/10 border-teal-500 text-teal-600'
                    : 'bg-bg-input border-transparent text-text-muted hover:bg-bg-hover'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4" />
                    <span>{t('action.share_lan')}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showShareQR ? 'rotate-180' : 'opacity-50'}`} />
                </button>

                {showShareQR && (
                  <div className="bg-bg-card border border-border-color rounded-2xl p-4 flex flex-col items-center gap-3 shadow-md animate-in zoom-in-95 duration-200">
                    <div className="bg-white p-2 rounded-xl border border-border-color shadow-sm">
                      <QRCodeCanvas
                        value={`http://${localIp}:3000/history`}
                        size={120}
                        level="H"
                        includeMargin={false}
                      />
                    </div>
                    <div className="text-center">
                      <h4 className="text-[10px] font-bold text-text-main uppercase tracking-widest mb-1">{t('action.share_lan')}</h4>
                      <p className="text-[9px] text-text-muted leading-tight mb-2">
                        {t('action.share_desc')}
                      </p>
                      <code className="bg-bg-input px-2 py-0.5 rounded text-[8px] text-accent-primary font-mono border border-border-color/50">
                        http://{localIp}:3000/history
                      </code>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right Panel: Live Feedback */}
          <section className="bg-bg-card border border-border-color rounded-3xl p-6 shadow-sm flex flex-col relative overflow-hidden h-full min-h-[400px]">
            <div className="flex items-center justify-between mb-6 shrink-0">
              <h2 className="text-lg font-bold flex items-center gap-2 text-text-main">
                <Sparkles className="w-5 h-5 text-accent-primary" />
                {t('transcript.title')}
              </h2>

              <div className="flex items-center gap-4">
                {/* Transcript Size Slider */}
                <div className="flex items-center gap-2 bg-bg-input/50 px-3 py-1.5 rounded-full border border-border-color/30">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">{t('transcript.size')}</span>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={transcriptFontSize}
                    onChange={(e) => setTranscriptFontSize(parseFloat(e.target.value))}
                    className="w-20 h-1 bg-border-color rounded-full appearance-none cursor-pointer accent-accent-primary"
                  />
                  <span className="text-[9px] font-mono font-bold text-accent-primary w-6">{Math.round(transcriptFontSize * 100)}%</span>
                </div>

                <div className="h-4 w-px bg-border-color/50" />

                <button onClick={clearTranscript} className="text-[10px] font-bold text-text-muted hover:text-accent-primary transition-colors uppercase tracking-wider">
                  {t('action.clear')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
              {transcriptHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-40">
                  <Monitor className="w-12 h-12 mb-4 stroke-1" />
                  <p className="text-sm">{t('transcript.ready')}</p>
                </div>
              ) : (
                transcriptHistory.map((item, idx) => (
                  <div key={idx} className={`p-3 rounded-xl transition-all ${idx === 0
                    ? 'bg-bg-input border border-border-color shadow-sm ring-1 ring-accent-primary/5'
                    : 'bg-bg-input/30 opacity-70 border border-transparent'
                    }`}>
                    <div className="flex flex-col gap-1.5">
                      {/* Original */}
                      <p
                        className="text-accent-primary font-bold leading-tight"
                        style={{ fontSize: `${14 * transcriptFontSize}px` }}
                      >
                        {item.original}
                      </p>

                      {/* Translated */}
                      <div className={`${!item.translated && !item.isFinal ? 'hidden' : ''}`}>
                        <p
                          className="font-black leading-snug text-text-main"
                          style={{ fontSize: `${idx === 0 ? 18 * transcriptFontSize : 14 * transcriptFontSize}px` }}
                        >
                          {item.translated || (item.isFinal ? t('transcript.translating') : '...')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-bg-card border border-border-color rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-border-color flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-main">{t('settings.title')}</h3>
              <button onClick={() => setShowSettingsModal(false)} className="p-2 hover:bg-bg-hover rounded-full transition-colors"><X className="w-5 h-5 text-text-muted" /></button>
            </div>

            <div className="flex border-b border-border-color p-2 gap-2 bg-bg-input/50">
              <button onClick={() => setSettingsTab('general')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${settingsTab === 'general' ? 'bg-bg-card shadow-sm text-text-main border border-border-color' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}>{t('settings.tab.general')}</button>
              <button onClick={() => setSettingsTab('translation')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${settingsTab === 'translation' ? 'bg-bg-card shadow-sm text-text-main border border-border-color' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}>{t('settings.tab.translation')}</button>
              <button onClick={() => { setSettingsTab('usage'); fetchUsageStats(); }} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${settingsTab === 'usage' ? 'bg-bg-card shadow-sm text-text-main border border-border-color' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}>{t('settings.tab.usage')}</button>
            </div>

            <div className="p-6 h-[400px] overflow-y-auto custom-scrollbar flex flex-col">
              {settingsTab === 'general' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Display Settings */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-accent-primary">
                      <Monitor className="w-4 h-4" />
                      <h4 className="text-xs font-bold uppercase tracking-widest">{t('settings.display')}</h4>
                    </div>
                    <div className="bg-bg-input p-4 rounded-xl border border-border-color flex items-center justify-between">
                      <span className="text-sm font-medium text-text-main">{t('settings.history_lines')}</span>
                      <input type="number" min="1" max="100" value={transcriptLimit} onChange={(e) => setTranscriptLimit(Number(e.target.value))} className="w-16 bg-bg-card border border-border-color rounded-lg px-2 py-1 text-sm text-center focus:ring-2 focus:ring-accent-primary/20 outline-none" />
                    </div>
                  </div>

                  {/* Theme Toggle */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-text-muted">
                      {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      <h4 className="text-xs font-bold uppercase tracking-widest">{t('settings.appearance')}</h4>
                    </div>
                    <div
                      onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                      className="bg-bg-input p-4 rounded-xl border border-border-color flex items-center justify-between cursor-pointer group hover:bg-bg-hover transition-colors"
                    >
                      <span className="text-sm font-medium text-text-main">{theme === 'light' ? t('settings.theme.light') : t('settings.theme.dark')}</span>
                      <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${theme === 'dark' ? 'bg-accent-primary' : 'bg-slate-300'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0'}`} />
                      </div>
                    </div>
                  </div>


                </div>
              )}

              {settingsTab === 'translation' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-accent-primary">
                      <Languages className="w-4 h-4" />
                      <h4 className="text-xs font-bold uppercase tracking-widest text-text-muted">{t('settings.method.title')}</h4>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-bg-input p-4 rounded-xl border border-border-color space-y-2">
                        <label className="text-xs font-bold text-text-main uppercase tracking-tighter">{t('settings.mode.title')}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setLlmModel('none')}
                            className={`py-2 rounded-lg text-[10px] font-bold transition-all border ${llmModel === 'none' ? 'bg-accent-primary text-white border-transparent shadow-sm' : 'bg-bg-card text-text-muted border-border-color'}`}
                          >
                            {t('settings.mode.standard')}
                          </button>
                          <button
                            onClick={() => setLlmModel('gemini-1.5-flash')}
                            className={`py-2 rounded-lg text-[10px] font-bold transition-all border ${llmModel !== 'none' ? 'bg-accent-primary text-white border-transparent shadow-sm' : 'bg-bg-card text-text-muted border-border-color'}`}
                          >
                            {t('settings.mode.ai')}
                          </button>
                        </div>
                        <p className="mt-2 text-[10px] text-text-muted leading-relaxed italic">
                          {llmModel === 'none'
                            ? t('settings.mode.standard_desc')
                            : t('settings.mode.ai_desc')}
                        </p>
                      </div>

                      {llmModel !== 'none' && (
                        <div className="bg-bg-input p-4 rounded-xl border border-border-color animate-in slide-in-from-top-2 duration-300">
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-4 h-4 text-accent-secondary" />
                            <h4 className="text-xs font-bold uppercase tracking-widest text-text-muted">{t('settings.ai.capabilities')}</h4>
                          </div>
                          <select
                            value={llmModel}
                            onChange={(e) => setLlmModel(e.target.value)}
                            className="w-full bg-bg-card border border-border-color rounded-lg p-2.5 text-xs font-medium text-text-main outline-none focus:ring-2 focus:ring-accent-primary/20"
                          >
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Balanced)</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep context)</option>
                          </select>
                          <p className="mt-3 text-[10px] text-text-muted leading-relaxed">
                            {t('settings.ai.desc')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'usage' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1">
                  {isLoadingUsage ? (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                      <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mb-2" />
                      <p className="text-xs">Loading...</p>
                    </div>
                  ) : usageStats ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-bg-input rounded-xl border border-border-color">
                        <p className="text-xs text-text-muted uppercase tracking-widest font-bold mb-1">{t('settings.usage.chars')}</p>
                        <p className="text-2xl font-bold text-text-main">{usageStats.totalChars}</p>
                      </div>
                      <p className="text-xs text-center text-text-muted italic">Usage data for {usageStats.date}</p>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-text-muted">{t('settings.usage.no_data')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

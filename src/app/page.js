'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Mic, MicOff, Monitor, Languages, Sparkles, ChevronDown,
  Key, History, Moon, Sun, X, Settings, GripHorizontal,
  Globe, Cloud, Cpu, Command
} from 'lucide-react';
import { translateText } from '@/lib/translator';

const { ipcRenderer } = (typeof window !== 'undefined' && typeof window.require === 'function')
  ? window.require('electron')
  : { ipcRenderer: null };

export default function Home() {
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

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general'); // 'general', 'usage'

  const [usageStats, setUsageStats] = useState(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [isOverlayLocked, setIsOverlayLocked] = useState(false);

  // Theme State
  const [theme, setTheme] = useState('light');

  // --- Refs ---
  const mediaRecorderRef = useRef(null);
  const isRecordingRef = useRef(false);
  const targetLangRef = useRef(targetLang);
  const llmModelRef = useRef(llmModel);
  const recordingIntervalRef = useRef(null);
  const recognitionRef = useRef(null);
  const sourceLangRef = useRef(sourceLang);
  const lastInterimRef = useRef({ time: 0, length: 0, requestId: 0 });

  // --- Effects ---

  // Mount & Theme
  useEffect(() => {
    setHasMounted(true);
    const savedGemini = localStorage.getItem('google_gemini_api_key');
    const savedCloud = localStorage.getItem('google_cloud_stt_api_key');
    const savedTheme = localStorage.getItem('app_theme') || 'light';

    if (savedGemini) setGeminiApiKey(savedGemini);
    if (savedCloud) setCloudApiKey(savedCloud);
    setTheme(savedTheme);

    if (ipcRenderer) {
      // Listeners
      ipcRenderer.on('overlay-status', (event, visible) => setOverlayVisible(visible));
      ipcRenderer.on('overlay-lock-status', (event, locked) => setIsOverlayLocked(locked));
      ipcRenderer.on('satellite-status', (event, isReady) => setSatelliteReady(isReady));

      // Initial Checks
      ipcRenderer.send('get-overlay-status');
      ipcRenderer.send('check-satellite-status');

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

  // Save Keys
  useEffect(() => {
    localStorage.setItem('google_gemini_api_key', geminiApiKey);
    localStorage.setItem('google_cloud_stt_api_key', cloudApiKey);
  }, [geminiApiKey, cloudApiKey]);

  // Sync Refs
  useEffect(() => {
    isRecordingRef.current = isRecording;
    targetLangRef.current = targetLang;
    llmModelRef.current = llmModel;
    sourceLangRef.current = sourceLang;
  }, [isRecording, targetLang, llmModel, sourceLang]);

  // Satellite Language Sync
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

  // STT & Transcripts
  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('satellite-transcript', async (event, data) => {
        if (!isRecordingRef.current) return;
        const original = data.transcript;
        if (!original || !original.trim()) return;

        const now = Date.now();
        const shouldTriggerInterim = !data.isFinal &&
          (original.length > lastInterimRef.current.length + 25 || now > lastInterimRef.current.time + 1500);

        setTranscriptHistory(prev => {
          let newHistory = [...prev];
          if (newHistory.length > 0 && !newHistory[0].isFinal) {
            newHistory[0] = { ...newHistory[0], original, isFinal: data.isFinal };
          } else {
            newHistory.unshift({ original, translated: '', isFinal: data.isFinal });
          }
          newHistory = newHistory.slice(0, transcriptLimit);
          setTranscript({ original, translated: newHistory[0].translated || '...' });
          if (ipcRenderer) ipcRenderer.send('send-subtitle', newHistory);
          return newHistory;
        });

        if (shouldTriggerInterim) {
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

        if (data.isFinal) {
          lastInterimRef.current = { time: 0, length: 0, requestId: 0 };
          const translated = await translateText(original, sourceLangRef.current.split('-')[0], targetLangRef.current, llmModelRef.current, geminiApiKey);
          setTranscriptHistory(prev => {
            const newHistory = prev.map(item => (item.original === original && item.isFinal) ? { ...item, translated } : item);
            if (newHistory.length > 0 && newHistory[0].original === original) {
              setTranscript({ original, translated });
            }
            if (ipcRenderer) ipcRenderer.send('send-subtitle', newHistory);
            return newHistory;
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

          const response = await fetch('/api/stt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64Audio, languageCode: sourceLang, apiKey: currentKey, sttMode })
          });
          const data = await response.json();
          if (!response.ok || data.error) {
            setSttError(data.error || 'STT Failed');
            if (response.status === 429) stopRecording();
            return;
          }
          setSttError('');
          const original = data.transcript;
          if (!original?.trim()) return;

          const translated = await translateText(original, sourceLang.split('-')[0], targetLangRef.current, llmModelRef.current, geminiApiKey);
          const result = { original, translated, isFinal: true, timestamp: Date.now() };

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
          setSttError('Satellite not connected. Launch Satellite Browser first.');
          return;
        }
        setSttError('');
        if (ipcRenderer) ipcRenderer.send('broadcast-stt-command', { command: 'start', config: { sourceLang, targetLang, llmModel } });
        setIsRecording(true);
        return;
      }

      if (sttMode === 'apple') {
        setSttError('');
        startNativeSpeechRecognition();
        return;
      }

      const requiredKey = sttMode === 'cloud' ? cloudApiKey : geminiApiKey;
      if (!requiredKey) { setSttError('API Key Required'); return; }

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
    if (sttMode === 'apple') stopNativeSpeechRecognition();
    if (sttMode === 'satellite' && ipcRenderer) ipcRenderer.send('broadcast-stt-command', { command: 'stop' });
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    setIsRecording(false);
  };

  const startNativeSpeechRecognition = () => {
    if (ipcRenderer) { ipcRenderer.send('start-mac-stt', { locale: sourceLang }); setIsRecording(true); return; }
    // Fallback for browser
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = false; rec.lang = sourceLang;
    rec.onresult = async (e) => {
      const original = e.results[e.results.length - 1][0].transcript;
      if (original) {
        const translated = await translateText(original, sourceLang.split('-')[0], targetLangRef.current, llmModelRef.current, geminiApiKey);
        const result = { original, translated };
        setTranscript(result);
        if (ipcRenderer) ipcRenderer.send('send-subtitle', result);
      }
    };
    rec.onend = () => { if (isRecordingRef.current && sttMode === 'apple') rec.start(); };
    recognitionRef.current = rec; rec.start(); setIsRecording(true);
  };

  const stopNativeSpeechRecognition = () => {
    if (ipcRenderer) ipcRenderer.send('stop-mac-stt');
    if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop(); }
  };

  const toggleRecording = () => isRecording ? stopRecording() : startRecording();
  const toggleOverlay = () => ipcRenderer?.send('toggle-overlay');

  const fetchUsageStats = async () => {
    setIsLoadingUsage(true);
    try {
      const res = await fetch('/api/usage');
      setUsageStats(await res.json());
    } finally { setIsLoadingUsage(false); }
  };

  const clearTranscript = () => {
    setTranscript({ original: '', translated: '' });
    setTranscriptHistory([]);
    ipcRenderer?.send('send-subtitle', []);
  };

  const launchSatellite = () => {
    if (ipcRenderer) ipcRenderer.send('open-satellite-browser');
    else window.open('/satellite', '_blank');
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
            <h1 className="text-2xl font-bold tracking-tight">Scribe Center</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-full hover:bg-bg-hover text-text-muted hover:text-text-main transition-all"
              title="Settings"
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
                  <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Speech Engine</h3>
                </div>
                <div className="bg-bg-input p-1 rounded-xl flex">
                  {[
                    { id: 'satellite', icon: Globe, label: 'Satellite' },
                    { id: 'cloud', icon: Cloud, label: 'Cloud' },
                    { id: 'gemini', icon: Sparkles, label: 'Gemini' },
                    { id: 'apple', icon: Command, label: 'Native' }
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
                      Runs in a separate browser window. Best for unlimited free transcription.
                    </p>
                    <div className="flex items-center justify-between bg-bg-card p-3 rounded-lg border border-border-color">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${satelliteReady ? 'bg-green-500' : 'bg-red-400 animate-pulse'}`} />
                        <span className="text-xs font-bold text-text-muted">{satelliteReady ? 'Connected' : 'Disconnected'}</span>
                      </div>
                      {!satelliteReady && (
                        <button onClick={launchSatellite} className="text-[10px] font-bold text-accent-primary hover:underline">
                          Launch Now
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {sttMode === 'cloud' && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
                    <p className="text-xs text-text-muted leading-relaxed">
                      <strong className="text-text-main">Google Cloud STT (Paid)</strong>.
                      Enterprise-grade accuracy. Requires a billing-enabled API Key.
                    </p>
                    <input
                      type="password"
                      value={cloudApiKey}
                      onChange={e => setCloudApiKey(e.target.value)}
                      placeholder="Enter Google Cloud API Key..."
                      className="w-full bg-bg-card border border-border-color rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-accent-primary/20 outline-none"
                    />
                  </div>
                )}
                {sttMode === 'gemini' && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
                    <p className="text-xs text-text-muted leading-relaxed">
                      <strong className="text-text-main">Gemini Multimodal (Experimental)</strong>.
                      Direct audio streaming to Gemini. High latency but context-aware.
                    </p>
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={e => setGeminiApiKey(e.target.value)}
                      placeholder="Enter Gemini API Key..."
                      className="w-full bg-bg-card border border-border-color rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-accent-primary/20 outline-none"
                    />
                  </div>
                )}
                {sttMode === 'apple' && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
                    <p className="text-xs text-text-muted leading-relaxed">
                      <strong className="text-text-main">macOS Dictation (Offline)</strong>.
                      Uses system SFSpeechRecognizer. Completely private and offline.
                    </p>
                    <div className="p-2 bg-bg-card border border-border-color rounded-lg text-center">
                      <span className="text-[10px] text-text-muted uppercase font-bold">No API Key Needed</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Languages */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Mic Input</label>
                  <div className="relative">
                    <select
                      value={sourceLang} onChange={e => setSourceLang(e.target.value)}
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
                <div className="space-y-2">
                  <label className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Translation</label>
                  <div className="relative">
                    <select
                      value={targetLang} onChange={e => setTargetLang(e.target.value)}
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
                    ? 'Stop Translation'
                    : sttMode === 'satellite' && !satelliteReady
                      ? 'Satellite Not Ready'
                      : 'Start Translation'
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
                  <span>Overlay</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${overlayVisible ? 'bg-accent-primary animate-pulse' : 'bg-slate-400'}`} />
                </button>

                {overlayVisible && (
                  <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-1">
                    <button onClick={() => ipcRenderer?.send('set-ignore-mouse', !isOverlayLocked)} className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${isOverlayLocked ? 'bg-accent-secondary text-white border-transparent' : 'bg-bg-input text-text-muted border-transparent hover:bg-bg-hover'}`}>
                      {isOverlayLocked ? 'Unlock' : 'Lock'}
                    </button>
                    <button onClick={() => ipcRenderer?.send('close-overlay')} className="py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-bg-input text-red-500 hover:text-red-600 border border-transparent hover:bg-red-50 dark:hover:bg-red-900/10">
                      Close
                    </button>
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
                Live Transcript
              </h2>
              <button onClick={clearTranscript} className="text-[10px] font-bold text-text-muted hover:text-accent-primary transition-colors uppercase tracking-wider">
                Clear History
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
              {transcriptHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-40">
                  <Monitor className="w-12 h-12 mb-4 stroke-1" />
                  <p className="text-sm">Ready to translate...</p>
                </div>
              ) : (
                transcriptHistory.map((item, idx) => (
                  <div key={idx} className={`p-5 rounded-2xl transition-all ${idx === 0
                    ? 'bg-bg-input border border-border-color shadow-sm'
                    : 'opacity-50 grayscale'
                    }`}>
                    {/* Original */}
                    <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 opacity-70">
                      {item.original}
                    </p>
                    {/* Translated */}
                    <p className={`font-bold leading-relaxed text-text-main ${idx === 0 ? 'text-xl' : 'text-base'}`}>
                      {item.translated || (item.isFinal ? 'Translating...' : '...')}
                    </p>
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
              <h3 className="text-lg font-bold text-text-main">Settings</h3>
              <button onClick={() => setShowSettingsModal(false)} className="p-2 hover:bg-bg-hover rounded-full transition-colors"><X className="w-5 h-5 text-text-muted" /></button>
            </div>

            <div className="flex border-b border-border-color p-2 gap-2 bg-bg-input/50">
              <button onClick={() => setSettingsTab('general')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${settingsTab === 'general' ? 'bg-bg-card shadow-sm text-text-main border border-border-color' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}>General</button>
              <button onClick={() => setSettingsTab('translation')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${settingsTab === 'translation' ? 'bg-bg-card shadow-sm text-text-main border border-border-color' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}>Translation</button>
              <button onClick={() => { setSettingsTab('usage'); fetchUsageStats(); }} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${settingsTab === 'usage' ? 'bg-bg-card shadow-sm text-text-main border border-border-color' : 'text-text-muted hover:text-text-main hover:bg-bg-hover'}`}>Usage</button>
            </div>

            <div className="p-6 h-[400px] overflow-y-auto custom-scrollbar flex flex-col">
              {settingsTab === 'general' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Display Settings */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-accent-primary">
                      <Monitor className="w-4 h-4" />
                      <h4 className="text-xs font-bold uppercase tracking-widest">Display</h4>
                    </div>
                    <div className="bg-bg-input p-4 rounded-xl border border-border-color flex items-center justify-between">
                      <span className="text-sm font-medium text-text-main">History Lines</span>
                      <input type="number" min="1" max="100" value={transcriptLimit} onChange={(e) => setTranscriptLimit(Number(e.target.value))} className="w-16 bg-bg-card border border-border-color rounded-lg px-2 py-1 text-sm text-center focus:ring-2 focus:ring-accent-primary/20 outline-none" />
                    </div>
                  </div>

                  {/* Theme Toggle (Interactive Switch) */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-text-muted">
                      {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      <h4 className="text-xs font-bold uppercase tracking-widest">Appearance</h4>
                    </div>
                    <div
                      onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                      className="bg-bg-input p-4 rounded-xl border border-border-color flex items-center justify-between cursor-pointer group hover:bg-bg-hover transition-colors"
                    >
                      <span className="text-sm font-medium text-text-main">{theme === 'light' ? 'Light Mode' : 'Dark Mode'}</span>
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
                      <h4 className="text-xs font-bold uppercase tracking-widest text-text-muted">Method Settings</h4>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-bg-input p-4 rounded-xl border border-border-color space-y-2">
                        <label className="text-xs font-bold text-text-main uppercase tracking-tighter">Translation Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setLlmModel('none')}
                            className={`py-2 rounded-lg text-[10px] font-bold transition-all border ${llmModel === 'none' ? 'bg-accent-primary text-white border-transparent shadow-sm' : 'bg-bg-card text-text-muted border-border-color'}`}
                          >
                            Standard (Fast)
                          </button>
                          <button
                            onClick={() => setLlmModel('gemini-1.5-flash')}
                            className={`py-2 rounded-lg text-[10px] font-bold transition-all border ${llmModel !== 'none' ? 'bg-accent-primary text-white border-transparent shadow-sm' : 'bg-bg-card text-text-muted border-border-color'}`}
                          >
                            AI Refined (Accurate)
                          </button>
                        </div>
                        <p className="mt-2 text-[10px] text-text-muted leading-relaxed italic">
                          {llmModel === 'none'
                            ? "Standard: Direct translation for near-zero latency. Best for fast-paced speech."
                            : "AI Refined: Processes text through Gemini to ensure natural phrasing and context logic."}
                        </p>
                      </div>

                      {llmModel !== 'none' && (
                        <div className="bg-bg-input p-4 rounded-xl border border-border-color animate-in slide-in-from-top-2 duration-300">
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-4 h-4 text-accent-secondary" />
                            <h4 className="text-xs font-bold uppercase tracking-widest text-text-muted">AI Capabilities</h4>
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
                            AI Refinement processes translations through Gemini to improve coherence and natural phrasing.
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
                        <p className="text-xs text-text-muted uppercase tracking-widest font-bold mb-1">Total Characters</p>
                        <p className="text-2xl font-bold text-text-main">{usageStats.totalChars}</p>
                      </div>
                      <p className="text-xs text-center text-text-muted italic">Usage data for {usageStats.date}</p>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-text-muted">No usage data available.</p>
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

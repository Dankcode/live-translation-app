'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Settings, Monitor, Languages, Sparkles, ChevronDown, Key } from 'lucide-react';
import { translateText } from '@/lib/translator';

const { ipcRenderer } = (typeof window !== 'undefined' && typeof window.require === 'function') ? window.require('electron') : { ipcRenderer: null };

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('es');
  const [transcript, setTranscript] = useState({ original: '', translated: '' });
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [llmModel, setLlmModel] = useState('none');
  const [hasMounted, setHasMounted] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [cloudApiKey, setCloudApiKey] = useState('');
  const [sttMode, setSttMode] = useState('cloud'); // 'gemini' or 'cloud'
  const [sttError, setSttError] = useState('');
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [usageStats, setUsageStats] = useState(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [isOverlayLocked, setIsOverlayLocked] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const isRecordingRef = useRef(false);
  const targetLangRef = useRef(targetLang);
  const llmModelRef = useRef(llmModel);
  const recordingIntervalRef = useRef(null);

  useEffect(() => {
    setHasMounted(true);
    // Load saved keys
    const savedGemini = localStorage.getItem('google_gemini_api_key');
    const savedCloud = localStorage.getItem('google_cloud_stt_api_key');
    if (savedGemini) setGeminiApiKey(savedGemini);
    if (savedCloud) setCloudApiKey(savedCloud);

    // Listen for overlay status sync
    if (ipcRenderer) {
      ipcRenderer.on('overlay-status', (event, visible) => {
        setOverlayVisible(visible);
      });
      ipcRenderer.on('overlay-lock-status', (event, locked) => {
        setIsOverlayLocked(locked);
      });
      // Initial status check
      ipcRenderer.send('get-overlay-status');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('google_gemini_api_key', geminiApiKey);
    localStorage.setItem('google_cloud_stt_api_key', cloudApiKey);
  }, [geminiApiKey, cloudApiKey]);

  // Sync refs with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
    targetLangRef.current = targetLang;
    llmModelRef.current = llmModel;
  }, [isRecording, targetLang, llmModel]);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('overlay-status', (event, status) => {
        setOverlayVisible(status);
      });
      ipcRenderer.send('get-overlay-status');
    }
  }, []);

  const processAudio = async (blob) => {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result.split(',')[1];

          // Use the selected engine's API Key
          const currentKey = sttMode === 'cloud' ? cloudApiKey : geminiApiKey;

          const response = await fetch('/api/stt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio: base64Audio,
              languageCode: sourceLang,
              apiKey: currentKey,
              sttMode: sttMode
            })
          });

          const data = await response.json();
          if (!response.ok || data.error) {
            const retryAfterSeconds = typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : null;
            const message = retryAfterSeconds != null
              ? `${data.error || `STT request failed (${response.status})`} Please retry in ${Math.ceil(retryAfterSeconds)}s.`
              : (data.error || `STT request failed (${response.status})`);
            setSttError(message);
            console.error('[STT Client Error]:', message);
            if (response.status === 429) stopRecording();
            return;
          }
          setSttError('');
          if (data.transcript) {
            const original = data.transcript;
            // Use geminiApiKey for translation/refinement
            const translated = await translateText(
              original,
              sourceLang.split('-')[0],
              targetLangRef.current,
              llmModelRef.current,
              geminiApiKey
            );

            const result = { original, translated };
            setTranscript(result);
            if (ipcRenderer) ipcRenderer.send('send-subtitle', result);
          }
        } catch (error) {
          console.error('Audio processing failed:', error);
          setSttError(error?.message || 'Audio processing failed');
        }
      };
    } catch (error) {
      console.error('Audio processing failed:', error);
    }
  };

  const startRecording = async () => {
    try {
      const requiredKey = sttMode === 'cloud' ? cloudApiKey : geminiApiKey;
      if (!requiredKey) {
        setSttError(sttMode === 'cloud' ? 'Please enter a Google Cloud STT API key.' : 'Please enter a Gemini API key.');
        return;
      }
      setSttError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          processAudio(event.data);
        }
      };

      // Record in intervals of 4 seconds for better flow
      mediaRecorder.start();
      setIsRecording(true);

      recordingIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.start();
        }
      }, 4000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      setSttError(err?.message || 'Failed to start recording');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const toggleOverlay = () => {
    if (ipcRenderer) ipcRenderer.send('toggle-overlay');
  };

  const fetchUsageStats = async () => {
    setIsLoadingUsage(true);
    try {
      const response = await fetch('/api/usage');
      const data = await response.json();
      setUsageStats(data);
    } catch (error) {
      console.error('Failed to fetch usage stats:', error);
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <main className="min-h-screen bg-[#0a0f1c] text-[#94a3b8] p-10 font-sans selection:bg-blue-500/30" suppressHydrationWarning>
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-3 mb-10">
          <div className="bg-[#2563eb] p-2 rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.4)]">
            <Languages className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Scribe Center</h1>
        </header>

        <div className="grid grid-cols-[450px_1fr] gap-10 items-start">
          <div className="space-y-6">
            <section className="bg-[#1e293b]/40 border border-[#334155]/50 p-8 rounded-3xl space-y-8 shadow-xl backdrop-blur-sm relative">
              <div className="flex items-center gap-3 text-blue-400 mb-2">
                <Monitor className="w-5 h-5" />
                <h2 className="text-base font-bold uppercase tracking-widest">Configuration</h2>
              </div>

              <div className="space-y-6">
                {/* STT Mode Toggle */}
                <div className="space-y-3">
                  <label className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black block">Recognition Engine</label>
                  <div className="flex bg-[#0f172a] p-1 rounded-xl border border-[#334155]">
                    <button
                      onClick={() => setSttMode('cloud')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${sttMode === 'cloud' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Cloud STT (Pro)
                    </button>
                    <button
                      disabled
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all bg-slate-800 text-slate-500 cursor-not-allowed opacity-50"
                      title="Gemini STT temporarily unavailable"
                    >
                      Gemini (Free)
                    </button>
                  </div>
                </div>

                {/* Context-Sensitive API Key Input */}
                {sttMode === 'gemini' ? (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black block">Gemini API Key</label>
                    <div className="relative">
                      <input
                        type="password"
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="AIzaSy... (Gemini Key)"
                        className="w-full bg-[#0f172a] border border-[#334155] p-4 pl-12 rounded-2xl outline-none text-sm text-white focus:border-blue-500/50 transition-all font-medium"
                      />
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    </div>
                    <p className="text-[9px] text-slate-500 italic">Enter your Gemini key (supports Free Tier)</p>
                  </div>
                ) : (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black block">Google Cloud API Key</label>
                    <div className="relative">
                      <input
                        type="password"
                        value={cloudApiKey}
                        onChange={(e) => setCloudApiKey(e.target.value)}
                        placeholder="AIzaSy... (Cloud STT Key)"
                        className="w-full bg-[#0f172a] border border-[#334155] p-4 pl-12 rounded-2xl outline-none text-sm text-white focus:border-blue-500/50 transition-all font-medium"
                      />
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    </div>
                    <p className="text-[9px] text-slate-500 italic">Enter your Cloud STT key (requires Billing)</p>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black block">Mic Language</label>
                  <div className="relative">
                    <select
                      value={sourceLang}
                      onChange={(e) => setSourceLang(e.target.value)}
                      className="w-full bg-[#0f172a] border border-[#334155] p-4 pr-12 rounded-2xl outline-none text-sm text-white appearance-none cursor-pointer focus:border-blue-500/50 transition-all font-medium"
                    >
                      <option value="en-US">English (US)</option>
                      <option value="es-ES">Spanish</option>
                      <option value="fr-FR">French</option>
                      <option value="de-DE">German</option>
                      <option value="zh-CN">Chinese</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black block">Target Language</label>
                  <div className="relative">
                    <select
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="w-full bg-[#0f172a] border border-[#334155] p-4 pr-12 rounded-2xl outline-none text-sm text-white appearance-none cursor-pointer focus:border-indigo-500/50 transition-all font-medium"
                    >
                      <option value="es">Spanish</option>
                      <option value="en">English</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="zh">Chinese</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        fetchUsageStats();
                        setShowUsageModal(true);
                      }}
                      className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/20 text-slate-400 hover:text-blue-400 hover:border-blue-500/50 transition-all text-xs font-bold flex items-center justify-center gap-2"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      View Daily Usage Stats
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-[#1e293b]/40 border border-[#334155]/50 p-8 rounded-3xl space-y-4 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between text-indigo-400">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5" />
                  <h2 className="text-base font-bold uppercase tracking-widest">AI Translation Refinement</h2>
                </div>
              </div>
              <div className="relative">
                <select
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  className="w-full bg-[#0f172a] border border-[#334155] p-3 pr-10 rounded-xl outline-none text-xs text-white appearance-none cursor-pointer focus:border-indigo-500/50 transition-all font-medium"
                >
                  <option value="none">Standard Translation</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Accurate)</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
              </div>
            </section>

            <div className="space-y-4">
              <button
                onClick={toggleRecording}
                className={`w-full py-6 rounded-3xl flex items-center justify-center gap-4 font-bold text-xl transition-all duration-300 transform active:scale-[0.98] ${isRecording
                  ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]'
                  : 'bg-[#2563eb] text-white shadow-[0_8px_30px_rgba(37,99,235,0.4)] hover:bg-blue-600'
                  }`}
              >
                {isRecording ? <MicOff className="w-6 h-6 animate-pulse" /> : <Mic className="w-6 h-6" />}
                {isRecording ? 'Stop Live STT' : 'Start Live STT'}
              </button>
              {sttError ? (
                <p className="text-xs text-red-400 font-medium px-1">{sttError}</p>
              ) : null}

              <button
                onClick={toggleOverlay}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl border transition-all duration-300 font-bold text-xs uppercase tracking-[0.1em] ${overlayVisible
                  ? 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                  : 'bg-slate-800/40 border-slate-700/50 text-slate-500 hover:border-slate-500'
                  }`}
              >
                <span>{overlayVisible ? 'Hide Presenter Overlay' : 'Open Presenter Overlay'}</span>
                <div className={`w-2 h-2 rounded-full ${overlayVisible ? 'bg-blue-400 animate-pulse' : 'bg-slate-700'}`}></div>
              </button>

              {overlayVisible && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={() => {
                      if (ipcRenderer) ipcRenderer.send('set-ignore-mouse', !isOverlayLocked);
                    }}
                    className={`py-2.5 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${isOverlayLocked ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                  >
                    {isOverlayLocked ? 'Unlock Overlay' : 'Lock Overlay'}
                  </button>
                  <button
                    onClick={() => {
                      if (ipcRenderer) ipcRenderer.send('close-overlay');
                    }}
                    className="py-2.5 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-800 border border-slate-700 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                  >
                    Close Overlay
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 bg-[#1e293b]/20 border border-[#334155]/30 rounded-3xl">
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                <Sparkles className="w-3 h-3 inline mr-2 text-indigo-400/60" />
                Using Google Cloud Speech-to-Text API for maximum stability and accuracy. No more browser bypass hacks required.
              </p>
            </div>
          </div>

          <section className="bg-[#1e293b]/20 border border-[#334155]/20 rounded-[2.5rem] p-12 flex flex-col min-h-[600px] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
              <Languages className="w-48 h-48" />
            </div>

            <h2 className="text-lg font-bold text-white mb-10 flex items-center gap-3">
              <Languages className="w-5 h-5 text-indigo-400" /> Live Feedback
            </h2>

            <div className="space-y-12 flex-1">
              <div className="space-y-4">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] block">Original (Recognized)</span>
                <p className={`text-2xl font-medium leading-relaxed transition-all duration-500 ${transcript.original ? 'text-slate-200' : 'text-slate-600 italic'}`}>
                  {transcript.original || (isRecording ? "Listening..." : "Click Start to begin...")}
                </p>
              </div>

              <div className="h-px bg-[#334155]/30 w-full" />

              <div className="space-y-4">
                <span className="text-[10px] text-indigo-500/80 uppercase font-black tracking-[0.2em] block">Translated</span>
                <p className={`text-4xl font-bold leading-tight tracking-tight transition-all duration-700 ${transcript.translated ? 'text-white' : 'text-slate-800'}`}>
                  {transcript.translated || "---"}
                </p>
              </div>
            </div>

            {isRecording && hasMounted && (
              <div className="mt-auto flex gap-1 items-end h-8 overflow-hidden opacity-50">
                {[...Array(16)].map((_, idx) => (
                  <div
                    key={idx}
                    className="w-1 bg-blue-500/50 rounded-full animate-wave"
                    style={{
                      height: `${20 + Math.random() * 80}%`,
                      animationDelay: `${idx * 0.05}s`,
                      animationDuration: `${0.5 + Math.random()}s`
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Usage Modal */}
      {showUsageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#1e293b] border border-[#334155] rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-[#334155] flex items-center justify-between bg-[#0f172a]/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600/20 p-2 rounded-lg">
                  <Monitor className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Daily STT Usage</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Today: {usageStats?.date || '...'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowUsageModal(false)}
                className="p-2 hover:bg-slate-700 rounded-full transition-colors"
              >
                <div className="w-5 h-5 flex items-center justify-center text-slate-400">✕</div>
              </button>
            </div>

            <div className="p-8">
              {isLoadingUsage ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                  <p className="text-sm font-medium">Loading statistics...</p>
                </div>
              ) : usageStats && Object.keys(usageStats.usage).length > 0 ? (
                <div className="space-y-6">
                  <div className="overflow-hidden rounded-2xl border border-[#334155] bg-[#0f172a]/30">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#0f172a]/50">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-[#334155]">API Key (Masked)</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-[#334155]">Usage</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-[#334155]">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(usageStats.usage).map(([key, seconds], idx) => {
                          const percent = Math.min(100, (seconds / usageStats.limit) * 100);
                          return (
                            <tr key={idx} className="border-b border-[#334155]/50 last:border-0 hover:bg-white/5 transition-colors">
                              <td className="px-6 py-5">
                                <code className="text-blue-400 text-xs font-mono">{key}</code>
                              </td>
                              <td className="px-6 py-5">
                                <span className="text-white font-bold">{formatDuration(seconds)}</span>
                                <span className="text-slate-500 text-[10px] ml-1">/ {usageStats.limit / 3600}h</span>
                              </td>
                              <td className="px-6 py-5">
                                <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-1000 ${percent > 90 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : percent > 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                    style={{ width: `${percent}%` }}
                                  ></div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed text-center italic">
                    Note: Usage is reset daily at 00:00 (server time). Limits are applied per API Key.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-[#0f172a]/20 rounded-2xl border border-dashed border-[#334155]">
                  <Monitor className="w-12 h-12 text-slate-700 mb-4" />
                  <p className="text-slate-400 font-medium">No usage recorded for today yet.</p>
                </div>
              )}
            </div>

            <div className="p-8 bg-[#0f172a]/30 border-t border-[#334155] flex justify-end">
              <button
                onClick={() => setShowUsageModal(false)}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs transition-all border border-[#334155]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

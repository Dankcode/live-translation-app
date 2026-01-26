'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Settings, Monitor, Languages, Sparkles, ChevronDown, Check, ExternalLink } from 'lucide-react';
import { translateText } from '@/lib/translator';

const { ipcRenderer } = (typeof window !== 'undefined' && typeof window.require === 'function') ? window.require('electron') : { ipcRenderer: null };

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('es');
  const [transcript, setTranscript] = useState({ original: '', translated: '' });
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [llmModel, setLlmModel] = useState('none');
  const [hasMounted, setHasMounted] = useState(false);

  const recognitionRef = useRef(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const isElectron = typeof window !== 'undefined' &&
    window.process &&
    window.process.type === 'renderer';

  // Check authentication on mount and after login
  const checkAuth = useCallback(() => {
    if (ipcRenderer) {
      ipcRenderer.send('check-google-auth');
    }
  }, []);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('google-auth-status', (event, status) => {
        setIsAuthenticated(status);
        console.log("[Auth] Status:", status);
      });

      ipcRenderer.on('auth-finished', () => {
        setIsLoggingIn(false);
        checkAuth();
      });

      ipcRenderer.on('overlay-status', (event, status) => {
        setOverlayVisible(status);
      });

      ipcRenderer.send('get-overlay-status');
      checkAuth();
    }
  }, [checkAuth]);

  // Recognition restart logic
  const startRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.error("Recognition start error:", e);
    }
  }, []);

  useEffect(() => {
    const SpeechRecognition = typeof window !== 'undefined' && (window.webkitSpeechRecognition || window.SpeechRecognition);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = sourceLang;

      recognition.onresult = async (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
          const translated = await translateText(currentText, sourceLang.split('-')[0], targetLang, llmModel);
          const data = { original: currentText, translated };
          setTranscript(data);

          if (ipcRenderer) ipcRenderer.send('send-subtitle', data);
        }
      };

      recognition.onerror = (event) => {
        console.error("Recognition error:", event.error);
        if (event.error === 'network' && !isAuthenticated) {
          console.warn("Network error detected, likely auth required.");
        }
      };

      recognition.onend = () => {
        if (isRecording) {
          startRecognition();
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [sourceLang, targetLang, isRecording, isAuthenticated, startRecognition]);

  const toggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      startRecognition();
      setIsRecording(true);
    }
  };

  const handleLogin = () => {
    if (ipcRenderer) {
      setIsLoggingIn(true);
      ipcRenderer.send('google-oauth');
    }
  };

  const toggleOverlay = () => {
    if (ipcRenderer) ipcRenderer.send('toggle-overlay');
  };

  return (
    <main className="min-h-screen bg-[#0a0f1c] text-[#94a3b8] p-10 font-sans selection:bg-blue-500/30" suppressHydrationWarning>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex items-center gap-3 mb-10">
          <div className="bg-[#2563eb] p-2 rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.4)]">
            <Languages className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Scribe Center</h1>
        </header>

        <div className="grid grid-cols-[450px_1fr] gap-10 items-start">
          {/* Left Column: Controls and Settings */}
          <div className="space-y-6">
            {/* Controls Card */}
            <section className="bg-[#1e293b]/40 border border-[#334155]/50 p-8 rounded-3xl space-y-8 shadow-xl backdrop-blur-sm relative">
              <div className="flex items-center gap-3 text-blue-400 mb-2">
                <Monitor className="w-5 h-5" />
                <h2 className="text-base font-bold uppercase tracking-widest">Controls</h2>
              </div>

              <div className="space-y-6">
                {/* Source Lang Selection */}
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

                {/* Target Lang Selection */}
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
                </div>
              </div>
            </section>

            {/* AI Refinement Card */}
            <section className="bg-[#1e293b]/40 border border-[#334155]/50 p-8 rounded-3xl space-y-4 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between text-indigo-400">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5" />
                  <h2 className="text-base font-bold uppercase tracking-widest">AI Refinement</h2>
                </div>
                <Settings className="w-5 h-5 text-slate-500" />
              </div>

              <div className="relative">
                <select
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  className="w-full bg-[#0f172a] border border-[#334155] p-3 pr-10 rounded-xl outline-none text-xs text-white appearance-none cursor-pointer focus:border-indigo-500/50 transition-all font-medium"
                >
                  <option value="none">No AI Refinement</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Accurate)</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
              </div>
            </section>

            {/* Start Microphone Button */}
            <div className="space-y-4">
              <button
                onClick={toggleRecording}
                className={`w-full py-6 rounded-3xl flex items-center justify-center gap-4 font-bold text-xl transition-all duration-300 transform active:scale-[0.98] ${isRecording
                  ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse'
                  : 'bg-[#2563eb] text-white shadow-[0_8px_30px_rgba(37,99,235,0.4)] hover:bg-blue-600'
                  }`}
              >
                {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                {isRecording ? 'Stop Transcript' : 'Start Microphone'}
              </button>

              {/* Status / Overlay Button */}
              <button
                onClick={toggleOverlay}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl border transition-all duration-300 font-bold text-xs uppercase tracking-[0.1em] ${overlayVisible
                  ? 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                  : 'bg-slate-800/40 border-slate-700/50 text-slate-500 hover:border-slate-500'
                  }`}
              >
                <span>Presenter Overlay</span>
                <div className={`w-2 h-2 rounded-full ${overlayVisible ? 'bg-blue-400 animate-pulse' : 'bg-slate-700'}`}></div>
              </button>
            </div>

            {/* Auth Alert / Login Button */}
            {!isAuthenticated && (
              <div className="p-6 bg-[#2563eb]/10 border border-[#2563eb]/20 rounded-3xl space-y-4 shadow-[0_0_40px_rgba(37,99,235,0.1)]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-blue-400 uppercase font-black tracking-widest">Stability Boost Required</p>
                  <Sparkles className="w-3 h-3 text-blue-400 animate-pulse" />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed italic">
                  To prevent "Network Error -2", please authorize this session in your system browser.
                </p>
                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className={`w-full flex items-center justify-between bg-[#2563eb] text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-xl hover:bg-blue-600 active:scale-95 group ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {isLoggingIn ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 brightness-200" />
                    )}
                    <span>{isLoggingIn ? 'Check Your Browser...' : 'Browser OAuth Login'}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </button>
              </div>
            )}

            <div className="p-6 bg-[#1e293b]/20 border border-[#334155]/30 rounded-3xl">
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed italic">
                <Sparkles className="w-3 h-3 inline mr-2 text-indigo-400/60" />
                The transparent overlay will stay on top of your full-screen PowerPoint. Ensure you use Chrome or Edge for the microphone to work.
              </p>
            </div>
          </div>

          {/* Right Column: Live Feedback */}
          <section className="bg-[#1e293b]/20 border border-[#334155]/20 rounded-[2.5rem] p-12 flex flex-col min-h-[600px] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
              <Languages className="w-48 h-48" />
            </div>

            <h2 className="text-lg font-bold text-white mb-10 flex items-center gap-3">
              <Languages className="w-5 h-5 text-indigo-400" /> Live Feedback
            </h2>

            <div className="space-y-12 flex-1">
              {/* Original Text Section */}
              <div className="space-y-4">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] block">Original</span>
                <p className={`text-2xl font-medium leading-relaxed transition-all duration-500 ${transcript.original ? 'text-slate-200' : 'text-slate-600 italic'}`}>
                  {transcript.original || "Speak to see transcription..."}
                </p>
              </div>

              <div className="h-px bg-[#334155]/30 w-full" />

              {/* Translated Text Section */}
              <div className="space-y-4">
                <span className="text-[10px] text-indigo-500/80 uppercase font-black tracking-[0.2em] block">Translated</span>
                <p className={`text-4xl font-bold leading-tight tracking-tight transition-all duration-700 ${transcript.translated ? 'text-white' : 'text-slate-800'}`}>
                  {transcript.translated || "---"}
                </p>
              </div>
            </div>

            {/* Visual Equalizer / Active Indicator */}
            {isRecording && hasMounted && (
              <div className="mt-auto flex gap-1 items-end h-8 overflow-hidden opacity-50">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6].map((i, idx) => (
                  <div
                    key={idx}
                    className="w-1 bg-blue-500/50 rounded-full animate-wave"
                    style={{
                      height: `${Math.random() * 100}%`,
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


    </main>
  );
}

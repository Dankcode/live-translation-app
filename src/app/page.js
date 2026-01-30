'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Monitor, Languages, Sparkles, ChevronDown, Key, Rocket, Radio } from 'lucide-react';

// Mock translation function - the Satellite will handle real translation logic if needed
const translateText = async (text, from, to, model, apiKey) => {
  if (model === 'none') return `[Translated: ${text}]`;
  return `[AI Refined (${model}): ${text}]`;
};

// Access electron modules safely
const electron = (typeof window !== 'undefined' && typeof window.require === 'function') ? window.require('electron') : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;
const shell = electron ? electron.shell : null;

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('es');
  const [transcript, setTranscript] = useState({ original: '', translated: '' });
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [llmModel, setLlmModel] = useState('none');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [cloudApiKey, setCloudApiKey] = useState('');
  const [sttMode, setSttMode] = useState('satellite'); // New default mode: Satellite
  const [sttError, setSttError] = useState('');
  const [satelliteActive, setSatelliteActive] = useState(false);

  useEffect(() => {
    const savedGemini = localStorage.getItem('google_gemini_api_key');
    const savedCloud = localStorage.getItem('google_cloud_stt_api_key');
    if (savedGemini) setGeminiApiKey(savedGemini);
    if (savedCloud) setCloudApiKey(savedCloud);

    if (ipcRenderer) {
      // Listen for data coming BACK from the Satellite window
      const handleSatelliteData = (event, data) => {
        setTranscript({
          original: data.transcript || '',
          translated: data.translation || ''
        });
      };

      const handleOverlayStatus = (event, visible) => setOverlayVisible(visible);

      ipcRenderer.on('satellite-transcript', handleSatelliteData);
      ipcRenderer.on('overlay-status', handleOverlayStatus);
      ipcRenderer.send('get-overlay-status');

      return () => {
        ipcRenderer.removeListener('satellite-transcript', handleSatelliteData);
        ipcRenderer.removeListener('overlay-status', handleOverlayStatus);
      };
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('google_gemini_api_key', geminiApiKey);
    localStorage.setItem('google_cloud_stt_api_key', cloudApiKey);
  }, [geminiApiKey, cloudApiKey]);

  const toggleRecording = () => {
    if (!ipcRenderer) return;

    if (isRecording) {
      ipcRenderer.send('stop-satellite-stt');
      setIsRecording(false);
    } else {
      setSttError('');
      ipcRenderer.send('start-satellite-stt', {
        sourceLang,
        targetLang,
        llmModel,
        apiKey: geminiApiKey
      });
      setIsRecording(true);
    }
  };

  const openSatellite = () => {
    // Determine the full local URL. Usually Next.js runs on 3000.
    const baseUrl = window.location.origin;
    const satelliteUrl = `${baseUrl}/satellite`;

    if (ipcRenderer) {
      // Option A: Tell main process to open an EXTERNAL browser window via shell
      // This is usually what you want if you want it in Chrome, not an Electron window
      ipcRenderer.send('open-external-link', satelliteUrl);

      // Option B: If your main process opens a new Electron BrowserWindow instead
      ipcRenderer.send('open-satellite', { url: '/satellite' });

      setSatelliteActive(true);
    } else {
      // Fallback: Standard browser behavior
      window.open(satelliteUrl, '_blank');
      setSatelliteActive(true);
    }
  };

  const toggleOverlay = () => ipcRenderer?.send('toggle-overlay');

  return (
    <main className="min-h-screen bg-[#0a0f1c] text-[#94a3b8] p-10 font-sans" suppressHydrationWarning>
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="bg-[#2563eb] p-2 rounded-xl">
              <Languages className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">Scribe Center</h1>
          </div>
          {satelliteActive && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Satellite Linked</span>
            </div>
          )}
        </header>

        <div className="grid grid-cols-[450px_1fr] gap-10">
          <div className="space-y-6">
            <section className="bg-[#1e293b]/40 border border-[#334155]/50 p-8 rounded-3xl space-y-6 shadow-xl backdrop-blur-sm">
              <div className="flex items-center gap-3 text-blue-400">
                <Monitor className="w-5 h-5" />
                <h2 className="text-base font-bold uppercase tracking-widest">Engine Control</h2>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl">
                  <p className="text-xs text-indigo-300 leading-relaxed">
                    <strong>Satellite Mode:</strong> Using browser-native Web Speech API for unlimited free transcription. Results are piped back here via local host.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Source Language</label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="w-full bg-[#0f172a] border border-[#334155] p-3 rounded-xl text-sm text-white outline-none focus:border-blue-500"
                  >
                    <option value="en-US">English (US)</option>
                    <option value="es-ES">Spanish (Spain)</option>
                    <option value="fr-FR">French (France)</option>
                    <option value="ja-JP">Japanese</option>
                    <option value="zh-CN">Chinese (Mandarin)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Target Language</label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full bg-[#0f172a] border border-[#334155] p-3 rounded-xl text-sm text-white outline-none focus:border-blue-500"
                  >
                    <option value="es">Spanish</option>
                    <option value="en">English</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                  </select>
                </div>

                <div className="pt-4 flex flex-col gap-3">
                  <button
                    onClick={openSatellite}
                    className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg hover:opacity-90 transition-all text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Rocket className="w-4 h-4" /> 1. Open Satellite Window
                  </button>
                  <p className="text-[10px] text-center text-slate-500 italic">Connected to local transcription engine</p>
                </div>
              </div>
            </section>

            <button
              onClick={toggleRecording}
              disabled={!satelliteActive}
              className={`w-full py-6 rounded-3xl flex items-center justify-center gap-4 font-bold text-xl transition-all shadow-2xl ${!satelliteActive ? 'bg-slate-800 opacity-50 cursor-not-allowed' :
                  isRecording ? 'bg-red-500 text-white' : 'bg-[#2563eb] text-white hover:bg-blue-600'
                }`}
            >
              {isRecording ? <MicOff className="w-6 h-6 animate-pulse" /> : <Mic className="w-6 h-6" />}
              {isRecording ? 'Stop Listening' : '2. Start Listening'}
            </button>

            {sttError && <p className="text-xs text-red-400 text-center">{sttError}</p>}

            <button onClick={toggleOverlay} className={`w-full py-4 px-6 rounded-2xl border text-xs font-bold uppercase tracking-widest transition-all ${overlayVisible ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
              {overlayVisible ? 'Hide Presenter Overlay' : 'Show Presenter Overlay'}
            </button>
          </div>

          <section className="bg-[#1e293b]/20 border border-[#334155]/20 rounded-[2.5rem] p-12 flex flex-col min-h-[500px] shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Radio className={`w-5 h-5 ${isRecording ? 'text-red-500 animate-pulse' : 'text-slate-500'}`} />
                Live Feed
              </h2>
              {isRecording && (
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] animate-pulse">Processing Via Satellite</span>
              )}
            </div>

            <div className="space-y-12 relative z-10">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-4">Recognized Audio</span>
                <p className={`text-3xl font-medium leading-relaxed ${transcript.original ? 'text-slate-200' : 'text-slate-700 italic'}`}>
                  {transcript.original || "Voice input will appear here..."}
                </p>
              </div>
              <div className="h-px bg-[#334155]/30" />
              <div>
                <span className="text-[10px] text-indigo-500 uppercase font-black tracking-widest block mb-4">Live Translation</span>
                <p className={`text-5xl font-bold leading-tight tracking-tight ${transcript.translated ? 'text-white' : 'text-slate-900'}`}>
                  {transcript.translated || "---"}
                </p>
              </div>
            </div>

            {/* Decorative background element */}
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
          </section>
        </div>
      </div>
    </main>
  );
}
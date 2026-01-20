'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Settings, Monitor, Languages, Sparkles } from 'lucide-react';
import { translateText } from '@/lib/translator';
import { AudioTranscriber } from '@/lib/transcriber';
import io from 'socket.io-client';

const { ipcRenderer } = typeof window !== 'undefined' ? window.require('electron') : { ipcRenderer: null };

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('es');
  const [llmModel, setLlmModel] = useState('none');
  const [translationMode, setTranslationMode] = useState('api');
  const [showSettings, setShowSettings] = useState(false);
  const [segments, setSegments] = useState([]); // Array of { id, original, translated, isFinal }

  // Settings for Voice Recognition
  const [sttProvider, setSttProvider] = useState('whisper');
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');

  const [manualText, setManualText] = useState('');
  const [manualTranslated, setManualTranslated] = useState('');

  const transcriberRef = useRef(null);
  const socketRef = useRef(null);

  // Load settings from localStorage
  useEffect(() => {
    const savedSttProvider = localStorage.getItem('sttProvider');
    const savedOpenaiKey = localStorage.getItem('openaiKey');
    const savedGeminiKey = localStorage.getItem('geminiKey');

    if (savedSttProvider) setSttProvider(savedSttProvider);
    if (savedOpenaiKey) setOpenaiKey(savedOpenaiKey);
    if (savedGeminiKey) setGeminiKey(savedGeminiKey);
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('sttProvider', sttProvider);
    localStorage.setItem('openaiKey', openaiKey);
    localStorage.setItem('geminiKey', geminiKey);

    // Update transcriber if it exists
    if (transcriberRef.current) {
      transcriberRef.current.setOptions({
        provider: sttProvider,
        apiKey: sttProvider === 'whisper' ? openaiKey : geminiKey
      });
    }
  }, [sttProvider, openaiKey, geminiKey]);

  useEffect(() => {
    // Initialize socket
    fetch('/api/socket'); // Wake up the socket handler
    socketRef.current = io();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    // Initialize transcriber
    transcriberRef.current = new AudioTranscriber(async (text) => {
      if (!text || text.trim().length === 0) return;

      const id = 'transcript-' + Date.now();

      // Since Whisper/Gemini are naturally "final" in its chunks
      const translated = await translateText(text, sourceLang.split('-')[0], targetLang, llmModel, translationMode);

      setSegments(prev => {
        const result = [...prev, { id, original: text, translated, isFinal: true }];
        return result.slice(-10);
      });

      if (socketRef.current) {
        socketRef.current.emit('send-subtitle', { original: text, translated });
      }
      if (ipcRenderer) {
        ipcRenderer.send('send-subtitle', { original: text, translated });
      }
    }, {
      provider: sttProvider,
      apiKey: sttProvider === 'whisper' ? openaiKey : geminiKey
    });

    return () => {
      if (transcriberRef.current) transcriberRef.current.stop();
    };
  }, [sourceLang, targetLang, llmModel, translationMode]); // sttProvider and keys are handled by setOptions in their own useEffect

  const toggleRecording = () => {
    if (!transcriberRef.current) return;

    if (isRecording) {
      transcriberRef.current.stop();
      setIsRecording(false);
    } else {
      // Ensure latest options before starting
      transcriberRef.current.setOptions({
        provider: sttProvider,
        apiKey: sttProvider === 'whisper' ? openaiKey : geminiKey
      });
      transcriberRef.current.start();
      setIsRecording(true);
    }
  };

  return (
    <main className="min-h-screen bg-[#0f172a] text-slate-200 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl">
              <Languages className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              Scribe Center
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <section className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl space-y-4 shadow-xl">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-blue-300">
                <Monitor className="w-5 h-5 text-blue-400" /> Controls
              </h2>

              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-bold">Mic Language</label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                  >
                    <option value="en-US">English (US)</option>
                    <option value="es-ES">Spanish</option>
                    <option value="fr-FR">French</option>
                    <option value="de-DE">German</option>
                    <option value="zh-CN">Chinese</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-bold">Target Language</label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                  >
                    <option value="es">Spanish</option>
                    <option value="en">English</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="zh">Chinese</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-indigo-300">
                  <Sparkles className="w-5 h-5 text-indigo-400" /> Settings
                </h2>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Settings className={`w-5 h-5 transition-transform ${showSettings ? 'rotate-90' : ''}`} />
                </button>
              </div>

              {showSettings && (
                <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Transcription Provider Section */}
                  <div className="space-y-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                    <h3 className="text-xs text-indigo-300 uppercase font-bold tracking-widest">Voice Recognition</h3>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-slate-400">Provider</label>
                      <select
                        value={sttProvider}
                        onChange={(e) => setSttProvider(e.target.value)}
                        className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                      >
                        <option value="whisper">OpenAI Whisper (Cloud)</option>
                        <option value="gemini">Google Gemini (Multi-modal)</option>
                      </select>
                    </div>

                    {sttProvider === 'whisper' && (
                      <div className="flex flex-col gap-2">
                        <label className="text-xs text-slate-400">OpenAI API Key</label>
                        <input
                          type="password"
                          value={openaiKey}
                          onChange={(e) => setOpenaiKey(e.target.value)}
                          placeholder="sk-..."
                          className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                        />
                      </div>
                    )}

                    {sttProvider === 'gemini' && (
                      <div className="flex flex-col gap-2">
                        <label className="text-xs text-slate-400">Gemini API Key</label>
                        <input
                          type="password"
                          value={geminiKey}
                          onChange={(e) => setGeminiKey(e.target.value)}
                          placeholder="Your AI Studio Key"
                          className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {/* Translation Settings */}
                  <div className="space-y-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                    <h3 className="text-xs text-indigo-300 uppercase font-bold tracking-widest">Translation Engine</h3>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-slate-400 uppercase tracking-widest font-bold">Translation Strategy</label>
                      <select
                        value={translationMode}
                        onChange={(e) => setTranslationMode(e.target.value)}
                        className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                      >
                        <option value="api">Accurate (Standard API)</option>
                        <option value="fast">Ultra Fast (Google Client)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-slate-400 uppercase tracking-widest font-bold">LLM Assistant</label>
                      <select
                        value={llmModel}
                        onChange={(e) => setLlmModel(e.target.value)}
                        className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                      >
                        <option value="none">Default (No LLM)</option>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro (Accurate)</option>
                      </select>
                      {translationMode === 'fast' && llmModel !== 'none' && (
                        <p className="text-[10px] text-amber-500 italic mt-1 font-medium">
                          * LLM Refinement requires an API call, slightly slowing down the "Fast" mode.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <button
              onClick={toggleRecording}
              className={`w-full py-5 rounded-3xl flex items-center justify-center gap-3 font-bold text-xl transition-all ${isRecording
                ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'
                : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20'
                }`}
            >
              {isRecording ? <MicOff /> : <Mic />}
              {isRecording ? 'Stop Transcript' : 'Start Microphone'}
            </button>

            <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
              <p className="text-xs text-indigo-300 font-medium">
                <Sparkles className="w-3 h-3 inline mr-1" />
                The transparent overlay will stay on top of your full-screen PowerPoint. Ensure you use Chrome or Edge for the microphone to work.
              </p>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col min-h-[400px]">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Languages className="w-5 h-5 text-indigo-400" /> Live Feedback
            </h2>

            <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
              {/* Manual Translation Box */}
              <div className="bg-slate-800/80 border border-indigo-500/30 p-4 rounded-2xl mb-4 shadow-lg animate-in fade-in zoom-in duration-300">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-indigo-300 uppercase font-bold tracking-widest flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Manual Translate (Pasted/Typed)
                  </span>
                  {manualText && (
                    <button
                      onClick={() => { setManualText(''); setManualTranslated(''); }}
                      className="text-[10px] text-slate-500 hover:text-white transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <textarea
                  value={manualText}
                  onChange={async (e) => {
                    const text = e.target.value;
                    setManualText(text);
                    if (!text) {
                      setManualTranslated('');
                      return;
                    }
                    // Debounced real-time translation for textbox
                    clearTimeout(window.manualTranslateTimer);
                    window.manualTranslateTimer = setTimeout(async () => {
                      const translated = await translateText(text, sourceLang.split('-')[0], targetLang, llmModel, translationMode);
                      setManualTranslated(translated);
                      if (socketRef.current) {
                        socketRef.current.emit('send-subtitle', { original: text, translated });
                      }
                      if (ipcRenderer) {
                        ipcRenderer.send('send-subtitle', { original: text, translated });
                      }
                    }, 500);
                  }}
                  placeholder="Paste or type long text here for real-time translation..."
                  className="w-full bg-slate-900/50 border border-slate-700/50 p-3 rounded-xl outline-none text-sm min-h-[100px] resize-y custom-scrollbar focus:border-indigo-500/50 transition-colors placeholder:text-slate-600"
                />
                {manualTranslated && (
                  <div className="mt-4 pt-4 border-t border-slate-700 animate-in slide-in-from-top-2 duration-300">
                    <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest block mb-2">Translation Result</span>
                    <p className="text-white text-lg font-medium leading-relaxed">
                      {manualTranslated}
                    </p>
                  </div>
                )}
              </div>

              {segments.length === 0 && !manualText && (
                <p className="text-slate-500 italic text-center mt-20">Speak or type to see translation...</p>
              )}
              {segments.map((segment) => (
                <div key={segment.id} className={`space-y-2 transition-all duration-500 ${segment.isFinal ? 'opacity-100' : 'opacity-50'}`}>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Original</span>
                    <p className="text-lg text-slate-300 italic">
                      {segment.original}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className={`text-[10px] uppercase font-bold tracking-widest ${segment.translated ? 'text-indigo-400' : 'text-slate-600 animate-pulse'}`}>
                      Translated {!segment.translated && segment.isFinal && '(Processing...)'}
                    </span>
                    <p className={`text-2xl font-medium transition-all ${segment.translated ? 'text-white' : 'text-slate-600 blur-[2px]'}`}>
                      {segment.translated || "---"}
                    </p>
                  </div>
                  {segment.isFinal && <div className="h-px bg-slate-800 mt-4" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
